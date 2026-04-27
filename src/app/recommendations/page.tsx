"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";
import { ErrorBubble } from "@/components/ErrorBubble";
import { PerfumeArtwork } from "@/components/PerfumeArtwork";
import { useAuth, useRequireAuth } from "@/lib/auth";
import { findBoutiqueById } from "@/lib/boutiques";
import { useStore, TIER_LABELS, type SubscriptionTier } from "@/lib/store";
import {
  readProfileFromUser,
  FAMILY_VULGAR,
  INTENSITY_VULGAR,
  BUDGET_VULGAR,
  type OlfactiveProfile,
} from "@/lib/profile";
import {
  agentFriendReport,
  agentRecommend,
  AuthRequiredError,
  QuotaExceededError,
} from "@/lib/agent-client";
import type {
  FriendReport,
  OlfactiveDNA,
  RecommendationCandidate,
} from "@/lib/agent";
import {
  QUIZ_QUESTIONS,
  buildQuizContext,
  type QuizAnswer,
} from "@/lib/quiz";

type Phase =
  | "mode-picker"
  | "quiz"
  | "configure"
  | "loading"
  | "swiping"
  | "done"
  | "report-loading"
  | "report";
type Mode = "self" | "friend";
type Count = 5 | 10 | 20;

/* -------------------------------------------------------------------------
 * Friend / self quiz — uses the shared QUIZ_QUESTIONS bank from src/lib/quiz.
 * The "Pour un ami" flow uses perspective="friend"; the user-profile flow
 * (onboarding) uses perspective="self" and reads the same answers back from
 * `OlfactiveProfile.quiz_answers`.
 * --------------------------------------------------------------------- */

function buildFriendProfileContext(
  answers: Record<string, QuizAnswer>,
): string {
  return buildQuizContext(answers, "friend");
}

/* -------------------------------------------------------------------------
 * Profile → prompt context. Same shape as ConciergeWidget so the recs feel
 * consistent with what the concierge knows about the user.
 * --------------------------------------------------------------------- */

function buildProfileContext(profile: OlfactiveProfile | null): string {
  if (!profile) return "";
  // New onboarding stores raw quiz answers — they're richer than the legacy
  // derived fields, so prefer them when available.
  if (profile.quiz_answers) {
    return buildQuizContext(profile.quiz_answers, "self");
  }
  const families = profile.preferred_families
    .map((f) => FAMILY_VULGAR[f]?.title ?? f)
    .join(", ");
  const intensity =
    INTENSITY_VULGAR[profile.intensity_preference]?.title ??
    profile.intensity_preference;
  const budget = BUDGET_VULGAR[profile.budget]?.title ?? profile.budget;
  return [
    "PROFIL OLFACTIF DE L'UTILISATEUR :",
    `- Familles préférées : ${families || "non renseignées"}`,
    `- Sillage recherché : ${intensity}`,
    `- Budget : ${budget}`,
  ].join("\n");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function recFragranceId(card: RecommendationCandidate): string {
  return `rec::${slugify(card.brand)}::${slugify(card.name)}`;
}

/* ========================================================================
 * Page
 * ====================================================================== */

export default function RecommendationsPage() {
  useRequireAuth();
  const router = useRouter();
  const { user } = useAuth();
  const {
    wishlist,
    addToWishlist,
    canUseRecommendation,
    consumeRecommendation,
    remaining,
    subscription,
    refreshUsage,
  } = useStore();

  const [phase, setPhase] = useState<Phase>("mode-picker");
  const [mode, setMode] = useState<Mode>("self");
  const [quizAnswers, setQuizAnswers] = useState<Record<string, QuizAnswer>>({});
  const [count, setCount] = useState<Count>(10);
  const [recs, setRecs] = useState<RecommendationCandidate[]>([]);
  const [dna, setDna] = useState<OlfactiveDNA | null>(null);
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cardExiting, setCardExiting] = useState<"left" | "right" | null>(null);
  const [liked, setLiked] = useState(0);
  const [passed, setPassed] = useState(0);
  const [matchedCards, setMatchedCards] = useState<RecommendationCandidate[]>([]);
  const [dislikedCards, setDislikedCards] = useState<RecommendationCandidate[]>([]);
  const [report, setReport] = useState<FriendReport | null>(null);

  // Drag state
  const [dragX, setDragX] = useState(0);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);
  const dragMoved = useRef(false);

  // Flashcard flip state — reset when moving to the next card
  const [flipped, setFlipped] = useState(false);

  const profile = readProfileFromUser(user);

  const { likedFragrances, dislikedFragrances } = useMemo(() => {
    const liked: Array<{ name: string; brand: string }> = [];
    const disliked: Array<{ name: string; brand: string }> = [];
    for (const w of wishlist) {
      if (!w.fragranceMeta) continue;
      const entry = { name: w.fragranceMeta.name, brand: w.fragranceMeta.brand };
      if (w.status === "liked" && liked.length < 12) liked.push(entry);
      else if (w.status === "disliked" && disliked.length < 12)
        disliked.push(entry);
    }
    return { likedFragrances: liked, dislikedFragrances: disliked };
  }, [wishlist]);

  async function generate(forMode: Mode, answers?: Record<string, QuizAnswer>) {
    // Paywall: block generation if the user has used their quota.
    if (!canUseRecommendation()) {
      router.push("/abonnement?from=recommendations");
      return;
    }
    setPhase("loading");
    setError(null);
    setIdx(0);
    setLiked(0);
    setPassed(0);
    setMatchedCards([]);
    setDislikedCards([]);
    setDna(null);
    setReport(null);
    try {
      const profileCtx =
        forMode === "friend"
          ? buildFriendProfileContext(answers ?? {})
          : buildProfileContext(profile);
      // Friend mode ignores the logged-in user's wishlist — it's for someone else.
      const likedArg = forMode === "friend" ? [] : likedFragrances;
      const dislikedArg = forMode === "friend" ? [] : dislikedFragrances;
      const desiredCount = forMode === "friend" ? 10 : count;
      const result = await agentRecommend(
        desiredCount,
        profileCtx,
        likedArg,
        dislikedArg,
      );
      if (result.recommendations.length === 0) {
        setError(
          forMode === "friend"
            ? "Aucune recommandation générée. Relance le quiz."
            : "Aucune recommandation. Complète ton profil ou ajoute des parfums en wishlist.",
        );
        setPhase(forMode === "friend" ? "mode-picker" : "configure");
        return;
      }
      // Burn one credit locally for instant UX feedback. The server has
      // already deducted the canonical count — refreshUsage() reconciles.
      consumeRecommendation();
      void refreshUsage();
      setRecs(result.recommendations);
      setDna(result.dna);
      setPhase("swiping");
    } catch (e) {
      // Server quota exhausted → bounce to /abonnement (the local count
      // could still appear under-used if localStorage is stale).
      if (e instanceof QuotaExceededError) {
        router.push("/abonnement?from=recommendations");
        return;
      }
      if (e instanceof AuthRequiredError) {
        router.push("/login?redirect=/recommendations");
        return;
      }
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setPhase(forMode === "friend" ? "mode-picker" : "configure");
    }
  }

  async function generateReport() {
    if (!dna) return;
    setPhase("report-loading");
    setError(null);
    try {
      const r = await agentFriendReport(
        buildFriendProfileContext(quizAnswers),
        dna,
        matchedCards,
        dislikedCards,
      );
      setReport(r);
      setPhase("report");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur rapport");
      setPhase("done");
    }
  }

  function decide(decision: "liked" | "disliked") {
    if (cardExiting || phase !== "swiping") return;
    const card = recs[idx];
    if (!card) return;

    setCardExiting(decision === "liked" ? "right" : "left");

    // Only persist to the logged-in user's wishlist in "pour moi" mode.
    // Friend mode is for someone else — those decisions go into the report only.
    if (mode === "self") {
      const fragranceId = recFragranceId(card);
      addToWishlist(fragranceId, decision, "search", {
        name: card.name,
        brand: card.brand,
        imageUrl: card.image_url ?? null,
      });
    }

    if (decision === "liked") {
      setLiked((n) => n + 1);
      setMatchedCards((prev) => [...prev, card]);
    } else {
      setPassed((n) => n + 1);
      setDislikedCards((prev) => [...prev, card]);
    }

    window.setTimeout(() => {
      setCardExiting(null);
      setDragX(0);
      setFlipped(false);
      if (idx + 1 >= recs.length) {
        setPhase("done");
      } else {
        setIdx((i) => i + 1);
      }
    }, 380);
  }

  /* Drag / tap handlers. A movement < 10 px is treated as a tap → flip the
   * card; larger horizontal movement triggers a swipe decision. */
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (cardExiting) return;
    isDragging.current = true;
    dragMoved.current = false;
    dragStartX.current = e.clientX;
    dragStartY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging.current || cardExiting) return;
    const dx = e.clientX - dragStartX.current;
    const dy = e.clientY - dragStartY.current;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) dragMoved.current = true;
    // Only apply horizontal drag visually — avoid fighting vertical scroll
    setDragX(dx);
  }
  function onPointerUp() {
    if (!isDragging.current) return;
    isDragging.current = false;
    const current = dragX;
    if (!dragMoved.current) {
      // Tap — flip the flashcard
      setFlipped((f) => !f);
      setDragX(0);
      return;
    }
    if (Math.abs(current) > 90) {
      decide(current > 0 ? "liked" : "disliked");
    } else {
      setDragX(0);
    }
  }

  /* -------------------------------- Phases ------------------------------ */

  function restart() {
    setPhase("mode-picker");
    setRecs([]);
    setDna(null);
    setError(null);
    setReport(null);
    setQuizAnswers({});
    setMatchedCards([]);
    setDislikedCards([]);
    setLiked(0);
    setPassed(0);
    setIdx(0);
  }

  if (phase === "mode-picker") {
    return (
      <ModePickerView
        hasProfile={!!profile}
        error={error}
        remainingRecs={remaining("recommendations")}
        subscription={subscription}
        onPick={(m) => {
          // Hard gate before the quiz/configure screens so the user
          // doesn't fill a long form only to discover they're out of credits.
          if (!canUseRecommendation()) {
            router.push("/abonnement?from=recommendations");
            return;
          }
          setMode(m);
          setError(null);
          if (m === "self") setPhase("configure");
          else setPhase("quiz");
        }}
      />
    );
  }

  if (phase === "quiz") {
    return (
      <QuizView
        answers={quizAnswers}
        setAnswers={setQuizAnswers}
        onComplete={(finalAnswers) => {
          void generate("friend", finalAnswers);
        }}
        onBack={() => setPhase("mode-picker")}
      />
    );
  }

  if (phase === "configure") {
    return (
      <ConfigureView
        profile={profile}
        count={count}
        setCount={setCount}
        onGenerate={() => void generate("self")}
        onBack={() => setPhase("mode-picker")}
        error={error}
        likedCount={likedFragrances.length}
      />
    );
  }

  if (phase === "loading") {
    return <LoadingView />;
  }

  if (phase === "done") {
    return (
      <DoneView
        mode={mode}
        liked={liked}
        passed={passed}
        matchedCards={matchedCards}
        dna={dna}
        error={error}
        onRestart={restart}
        onSeeReport={generateReport}
      />
    );
  }

  if (phase === "report-loading") {
    return <ReportLoadingView />;
  }

  if (phase === "report" && report) {
    return (
      <ReportView
        report={report}
        dna={dna}
        onBack={() => setPhase("done")}
        onRestart={restart}
      />
    );
  }

  /* ----------------------------- Swiping ------------------------------ */

  const currentCard = recs[idx];
  const nextCard = recs[idx + 1];
  const dragIntent: "liked" | "disliked" | null =
    dragX > 60 ? "liked" : dragX < -60 ? "disliked" : null;

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-4">
      {/* Header strip */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] uppercase tracking-[0.25em] text-outline font-mono">
          {String(idx + 1).padStart(2, "0")} / {String(recs.length).padStart(2, "0")}
        </span>
        <div className="flex gap-0.5">
          {recs.map((_, i) => (
            <div
              key={i}
              className={clsx(
                "h-[3px] rounded-full transition-all",
                i < idx
                  ? "bg-primary w-3"
                  : i === idx
                    ? "bg-primary w-6"
                    : "bg-outline-variant/40 w-3",
              )}
            />
          ))}
        </div>
        <span className="text-[10px] uppercase tracking-[0.25em] font-mono font-bold text-primary">
          {liked} ♥
        </span>
      </div>

      {/* Analyzed DNA strip */}
      {dna && dna.key_notes.length > 0 && (
        <div className="border border-outline-variant bg-surface-container-low px-3 py-2">
          <p className="text-[9px] uppercase tracking-[0.25em] text-outline font-mono mb-1">
            Ton ADN analysé
          </p>
          <div className="flex flex-wrap gap-1">
            {dna.dominant_accords.slice(0, 2).map((a) => (
              <span
                key={a}
                className="text-[10px] uppercase tracking-widest font-bold text-on-background"
              >
                {a}
              </span>
            ))}
            <span className="text-[10px] text-outline">·</span>
            {dna.key_notes.slice(0, 5).map((n, i, arr) => (
              <span key={n} className="text-[10px] text-outline">
                {n}
                {i < arr.length - 1 ? "," : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Card stack */}
      <div
        className="relative mx-auto w-full max-w-md"
        style={{ aspectRatio: "3 / 4.6" }}
      >
        {/* Next card peek (behind) */}
        {nextCard && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              transform: "scale(0.94) translateY(14px)",
              opacity: 0.5,
              zIndex: 0,
            }}
          >
            <SwipeCard card={nextCard} flipped={false} />
          </div>
        )}

        {/* Current card */}
        {currentCard && (
          <div
            key={currentCard.name + currentCard.brand}
            className={clsx(
              "absolute inset-0 cursor-grab active:cursor-grabbing",
              cardExiting === "left" && "swipe-exit-left",
              cardExiting === "right" && "swipe-exit-right",
            )}
            style={{
              transform:
                !cardExiting && dragX !== 0
                  ? `translateX(${dragX}px) rotate(${dragX * 0.04}deg)`
                  : undefined,
              transition:
                !cardExiting && !isDragging.current
                  ? "transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)"
                  : "none",
              zIndex: 10,
              touchAction: "none",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <SwipeCard
              card={currentCard}
              dragIntent={dragIntent}
              flipped={flipped}
            />
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-6 mt-2">
        <button
          type="button"
          onClick={() => decide("disliked")}
          disabled={!!cardExiting}
          aria-label="Passer"
          className="w-16 h-16 rounded-full border-2 border-outline-variant bg-background flex items-center justify-center text-on-background hover:border-error hover:text-error hover:bg-error/5 transition-all active:scale-90 disabled:opacity-40"
        >
          <Icon name="close" size={28} />
        </button>
        <a
          href={currentCard?.source_url ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Voir la fiche source"
          className="w-12 h-12 rounded-full border border-outline-variant/70 bg-background flex items-center justify-center text-outline hover:text-on-background hover:border-primary transition-all active:scale-90"
        >
          <Icon name="open_in_new" size={16} />
        </a>
        <button
          type="button"
          onClick={() => decide("liked")}
          disabled={!!cardExiting}
          aria-label="Match"
          className="w-20 h-20 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-xl hover:opacity-90 transition-all active:scale-90 disabled:opacity-40"
        >
          <Icon name="favorite" filled size={34} />
        </button>
      </div>

      <div className="flex items-center justify-center gap-10 text-[9px] uppercase tracking-[0.25em] text-outline mt-1">
        <span className="w-16 text-center">Pass</span>
        <span className="w-12 text-center">Source</span>
        <span className="w-20 text-center text-primary font-bold">Match</span>
      </div>
    </div>
  );
}

/* ========================================================================
 * Configure view
 * ====================================================================== */

function ConfigureView({
  profile,
  count,
  setCount,
  onGenerate,
  onBack,
  error,
  likedCount,
}: {
  profile: OlfactiveProfile | null;
  count: Count;
  setCount: (c: Count) => void;
  onGenerate: () => void;
  onBack: () => void;
  error: string | null;
  likedCount: number;
}) {
  return (
    <div className="px-6 pt-4 pb-12">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-outline hover:text-on-background mb-6 transition-colors"
      >
        <Icon name="arrow_back" size={14} />
        Retour
      </button>

      <header className="mb-10">
        <p className="text-[10px] uppercase tracking-[0.3em] text-outline mb-2">
          Archives &amp; aspirations
        </p>
        <h1 className="text-5xl font-medium leading-[0.9] tracking-tighter">
          Pour toi.
        </h1>
        <p className="text-sm text-on-surface-variant mt-4 max-w-md leading-relaxed">
          L&apos;équipe La Niche analyse ton profil olfactif et ta wishlist
          pour te proposer des parfums que tu n&apos;as pas encore croisés.
          Swipe ou tape pour décider — chaque choix affine ta signature.
        </p>
      </header>

      {/* Profile snapshot / CTA */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-primary font-mono text-[11px]">01</span>
          <div className="h-px flex-1 bg-outline-variant" />
          <h2 className="text-[10px] uppercase font-bold tracking-widest">
            Ton ADN
          </h2>
        </div>
        {profile ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {profile.preferred_families.map((f) => {
                const v = FAMILY_VULGAR[f];
                return (
                  <span
                    key={f}
                    className="px-3 py-1.5 bg-surface-container-high rounded-full text-[10px] uppercase tracking-widest font-medium"
                  >
                    {v?.emoji} {v?.title ?? f}
                  </span>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest text-outline">
              <span>
                Sillage :{" "}
                <span className="text-on-background font-bold">
                  {INTENSITY_VULGAR[profile.intensity_preference]?.title}
                </span>
              </span>
              <span>·</span>
              <span>
                Budget :{" "}
                <span className="text-on-background font-bold">
                  {BUDGET_VULGAR[profile.budget]?.title}
                </span>
              </span>
              <span>·</span>
              <span>
                Wishlist :{" "}
                <span className="text-on-background font-bold">
                  {likedCount} aimés
                </span>
              </span>
            </div>
          </div>
        ) : (
          <div className="border border-outline-variant p-5 flex flex-col gap-3">
            <p className="text-sm text-on-surface-variant">
              Tu n&apos;as pas encore de profil olfactif. Les
              recommandations seront plus pertinentes si tu complètes ton
              onboarding.
            </p>
            <Link
              href="/onboarding"
              className="self-start text-[10px] uppercase tracking-widest font-bold border-b border-primary pb-0.5"
            >
              Compléter mon profil
            </Link>
          </div>
        )}
      </section>

      {/* Count selector */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-primary font-mono text-[11px]">02</span>
          <div className="h-px flex-1 bg-outline-variant" />
          <h2 className="text-[10px] uppercase font-bold tracking-widest">
            Combien
          </h2>
        </div>
        <div className="grid grid-cols-3 gap-px bg-outline-variant/40 border border-outline-variant">
          {([5, 10, 20] as const).map((n) => {
            const active = n === count;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                className={clsx(
                  "py-5 flex flex-col items-center gap-1 transition-all",
                  active
                    ? "bg-primary text-on-primary"
                    : "bg-background hover:bg-surface-container-low",
                )}
                aria-pressed={active}
              >
                <span className="text-2xl font-bold tracking-tight font-mono">
                  {n}
                </span>
                <span className="text-[9px] uppercase tracking-widest">
                  {n === 5 ? "Express" : n === 10 ? "Standard" : "Deep dive"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <div className="mb-6">
          <ErrorBubble
            detail={error}
            context="Recommandations · ConfigureView"
            variant="block"
          />
        </div>
      )}

      {/* Generate CTA */}
      <button
        type="button"
        onClick={onGenerate}
        className="w-full py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.25em] font-bold active:scale-95 transition-all flex items-center justify-center gap-2"
      >
        <Icon name="auto_awesome" size={16} />
        Générer mes recommandations
      </button>

      <p className="text-[10px] text-outline text-center mt-4 leading-relaxed">
        Sélection La Niche
      </p>
    </div>
  );
}

/* ========================================================================
 * Loading view
 * ====================================================================== */

/* Loading screen — three sequential checkpoints framed as the La Niche team
 * working in the background. Timings calibrated to ~15s end-to-end. */
function LoadingView() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const t1 = window.setTimeout(() => setStage(1), 4500);
    const t2 = window.setTimeout(() => setStage(2), 9500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  const stages = [
    {
      icon: "biotech",
      title: "Analyse",
      label: "Lecture de ton ADN olfactif",
      detail: "Croisement profil + wishlist + base de connaissances",
    },
    {
      icon: "travel_explore",
      title: "Recherche",
      label: "Exploration ciblée des archives",
      detail: "Requêtes parallèles sur tes accords clés",
    },
    {
      icon: "auto_awesome",
      title: "Sélection",
      label: "Choix final contre ton ADN",
      detail: "Chaque parfum doit citer tes notes phares",
    },
  ];

  return (
    <div className="px-6 pt-10 pb-12">
      <header className="mb-10">
        <p className="text-[10px] uppercase tracking-[0.3em] text-outline mb-2">
          Équipe La Niche
        </p>
        <h1 className="text-4xl font-medium leading-[0.95] tracking-tighter">
          On s&apos;occupe
          <br />
          de tout.
        </h1>
      </header>

      <ul className="flex flex-col gap-0 border border-outline-variant">
        {stages.map((s, i) => {
          const done = i < stage;
          const active = i === stage;
          return (
            <li
              key={s.title}
              className={clsx(
                "flex items-start gap-4 p-5 border-b border-outline-variant last:border-0 transition-all",
                done && "bg-primary text-on-primary",
                active && "bg-surface-container-low",
              )}
            >
              <div
                className={clsx(
                  "w-10 h-10 flex-shrink-0 flex items-center justify-center border",
                  done
                    ? "border-on-primary"
                    : active
                      ? "border-primary"
                      : "border-outline-variant/50",
                )}
              >
                {done ? (
                  <Icon name="check" size={18} />
                ) : active ? (
                  <span className="relative">
                    <Icon name={s.icon} size={18} />
                  </span>
                ) : (
                  <Icon
                    name={s.icon}
                    size={18}
                    className="text-outline opacity-40"
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={clsx(
                    "text-[9px] uppercase tracking-[0.25em] font-mono",
                    done
                      ? "text-on-primary/70"
                      : active
                        ? "text-primary"
                        : "text-outline",
                  )}
                >
                  {s.title} · {done ? "terminé" : active ? "en cours…" : "en attente"}
                </p>
                <p
                  className={clsx(
                    "text-sm font-semibold tracking-tight mt-0.5",
                    !done && !active && "text-outline",
                  )}
                >
                  {s.label}
                </p>
                <p
                  className={clsx(
                    "text-[11px] mt-1 leading-relaxed",
                    done
                      ? "text-on-primary/80"
                      : active
                        ? "text-on-surface-variant"
                        : "text-outline/70",
                  )}
                >
                  {s.detail}
                </p>
                {active && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" />
                    <span
                      className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
                      style={{ animationDelay: "0.15s" }}
                    />
                    <span
                      className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
                      style={{ animationDelay: "0.3s" }}
                    />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-[10px] uppercase tracking-[0.2em] text-outline text-center mt-8">
        Sélection signée La Niche
      </p>
    </div>
  );
}

/* ========================================================================
 * Done view
 * ====================================================================== */

function DoneView({
  mode,
  liked,
  passed,
  matchedCards,
  dna,
  error,
  onRestart,
  onSeeReport,
}: {
  mode: Mode;
  liked: number;
  passed: number;
  matchedCards: RecommendationCandidate[];
  dna: OlfactiveDNA | null;
  error: string | null;
  onRestart: () => void;
  onSeeReport: () => void;
}) {
  const isFriend = mode === "friend";
  return (
    <div className="px-6 pt-4 pb-12">
      <header className="mb-10">
        <p className="text-[10px] uppercase tracking-[0.3em] text-outline mb-2">
          Session terminée
        </p>
        <h1 className="text-5xl font-medium leading-[0.9] tracking-tighter">
          {isFriend ? (
            <>
              Ton pote
              <br />
              est cerné.
            </>
          ) : (
            <>
              Ta signature
              <br />
              s&apos;affine.
            </>
          )}
        </h1>
      </header>

      {dna && (dna.dominant_accords.length > 0 || dna.key_notes.length > 0) && (
        <section className="mb-10 border border-outline-variant p-5">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="biotech" size={14} className="text-primary" />
            <h2 className="text-[10px] uppercase font-bold tracking-widest">
              ADN olfactif analysé
            </h2>
          </div>
          {dna.dominant_accords.length > 0 && (
            <div className="mb-3">
              <p className="text-[9px] uppercase tracking-widest text-outline mb-1">
                Accords dominants
              </p>
              <div className="flex flex-wrap gap-1.5">
                {dna.dominant_accords.map((a) => (
                  <span
                    key={a}
                    className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 bg-primary text-on-primary"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
          {dna.key_notes.length > 0 && (
            <div className="mb-3">
              <p className="text-[9px] uppercase tracking-widest text-outline mb-1">
                Notes clés
              </p>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                {dna.key_notes.join(" · ")}
              </p>
            </div>
          )}
          {dna.personality && (
            <p className="text-[11px] italic text-on-surface-variant leading-relaxed mt-3">
              &ldquo; {dna.personality} &rdquo;
            </p>
          )}
        </section>
      )}

      <section className="mb-10 grid grid-cols-2 gap-px bg-outline-variant/40 border border-outline-variant">
        <div className="bg-background py-6 flex flex-col items-center">
          <span className="text-4xl font-bold font-mono tracking-tight">
            {String(liked).padStart(2, "0")}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-outline mt-1">
            Matchés
          </span>
        </div>
        <div className="bg-background py-6 flex flex-col items-center">
          <span className="text-4xl font-bold font-mono tracking-tight text-outline">
            {String(passed).padStart(2, "0")}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-outline mt-1">
            Passés
          </span>
        </div>
      </section>

      {matchedCards.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-primary font-mono text-[11px]">01</span>
            <div className="h-px flex-1 bg-outline-variant" />
            <h2 className="text-[10px] uppercase font-bold tracking-widest">
              Tes matchs
            </h2>
          </div>
          <ul className="flex flex-col">
            {matchedCards.map((c) => (
              <li
                key={`${c.brand}-${c.name}`}
                className="flex items-center gap-3 py-3 border-b border-outline-variant/30 last:border-0"
              >
                <PerfumeArtwork
                  brand={c.brand}
                  name={c.name}
                  imageUrl={c.image_url}
                  variant="thumb"
                  className="w-12 h-16 flex-shrink-0"
                />

                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-outline">
                    {c.brand}
                  </p>
                  <p className="text-sm font-semibold tracking-tight truncate">
                    {c.name}
                  </p>
                  <p className="text-[10px] text-outline mt-0.5">
                    {c.family} · {c.match_score}% match
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <div className="mb-4">
          <ErrorBubble
            detail={error}
            context="Recommandations · DoneView"
            variant="block"
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        {isFriend && liked + passed > 0 ? (
          <>
            <button
              type="button"
              onClick={onSeeReport}
              className="w-full py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.25em] font-bold active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Icon name="description" size={16} />
              Voir le rapport
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="w-full py-3 border border-outline-variant rounded-full text-[10px] uppercase tracking-widest font-bold hover:border-primary transition-all"
            >
              Nouvelle session
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onRestart}
              className="w-full py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.25em] font-bold active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Icon name="refresh" size={16} />
              Nouvelle session
            </button>
            {!isFriend && (
              <Link
                href="/wishlist"
                className="w-full py-3 border border-outline-variant rounded-full text-[10px] uppercase tracking-widest font-bold text-center hover:border-primary transition-all"
              >
                Voir la wishlist
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ========================================================================
 * Swipe Card — 3D flashcard.
 *   Front = Tinder-style image card with projection line
 *   Back  = olfactive pyramid (top/heart/base) + price
 * Tap toggles the flip; horizontal drag triggers swipe.
 * ====================================================================== */

function SwipeCard({
  card,
  dragIntent,
  flipped,
}: {
  card: RecommendationCandidate;
  dragIntent?: "liked" | "disliked" | null;
  flipped: boolean;
}) {
  return (
    <div className="flashcard-surface w-full h-full">
      <div
        className={clsx(
          "flashcard-inner shadow-xl",
          flipped && "is-flipped",
        )}
      >
        <div className="flashcard-face">
          <SwipeCardFront card={card} dragIntent={dragIntent} />
        </div>
        <div className="flashcard-face flashcard-face--back">
          <SwipeCardBack card={card} />
        </div>
      </div>
    </div>
  );
}

function SwipeCardFront({
  card,
  dragIntent,
}: {
  card: RecommendationCandidate;
  dragIntent?: "liked" | "disliked" | null;
}) {
  return (
    <div className="relative w-full h-full overflow-hidden bg-background border border-outline-variant">
      {/* Real bottle photo when the curator scraped one (fimgs.net), else
          falls back to the La Niche logo watermark. */}
      <PerfumeArtwork
        brand={card.brand}
        name={card.name}
        family={card.family}
        imageUrl={card.image_url}
        variant="card"
        showSoonCaption={false}
        className="absolute inset-0 w-full h-full border-0 bg-on-background"
      />

      {/* Readability gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.6) 38%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0) 100%)",
        }}
      />

      {/* Match badge (top-right) */}
      <div className="absolute top-3 right-3 bg-background/90 px-2.5 py-1 border border-outline-variant">
        <span className="text-[10px] font-mono font-bold text-on-background tracking-widest">
          {card.match_score}% MATCH
        </span>
      </div>

      {/* Flip affordance (top-left) */}
      <div className="absolute top-3 left-3 bg-background/90 px-2.5 py-1 border border-outline-variant flex items-center gap-1.5">
        <Icon name="touch_app" size={11} className="text-on-background" />
        <span className="text-[9px] font-mono font-bold text-on-background tracking-widest uppercase">
          Tap · notes
        </span>
      </div>

      {/* Drag intent stamps */}
      {dragIntent === "liked" && (
        <div
          className="absolute top-20 left-5 -rotate-[18deg] border-4 border-white text-white px-5 py-2 text-3xl font-black tracking-widest"
          style={{ textShadow: "0 2px 10px rgba(0,0,0,0.6)" }}
        >
          MATCH ♥
        </div>
      )}
      {dragIntent === "disliked" && (
        <div
          className="absolute top-20 right-5 rotate-[18deg] border-4 border-white text-white px-5 py-2 text-3xl font-black tracking-widest"
          style={{ textShadow: "0 2px 10px rgba(0,0,0,0.6)" }}
        >
          PASS ✗
        </div>
      )}

      {/* Info overlay (bottom) */}
      <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
        <p className="text-[10px] uppercase tracking-[0.3em] text-white/60 mb-1">
          {card.brand}
        </p>
        <h2 className="text-2xl font-bold tracking-tight leading-tight mb-3 drop-shadow-md">
          {card.name}
        </h2>

        {card.family && card.family !== "—" && (
          <span className="inline-block text-[9px] uppercase tracking-widest border border-white/40 px-2 py-0.5 mb-3 text-white/90">
            {card.family}
          </span>
        )}

        {card.available_at.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <Icon name="storefront" size={11} className="text-white/70" />
            <span className="text-[9px] uppercase tracking-[0.25em] text-white/70">
              Dispo
            </span>
            {card.available_at.map((id) => {
              const b = findBoutiqueById(id);
              if (!b) return null;
              return (
                <span
                  key={id}
                  className="text-[9px] uppercase tracking-widest font-bold text-white bg-primary/80 backdrop-blur-sm px-2 py-0.5"
                >
                  {b.shortLabel}
                </span>
              );
            })}
          </div>
        )}

        {card.projection && (
          <p className="text-[13px] italic text-white font-medium leading-snug mb-3 drop-shadow">
            &ldquo;{card.projection}&rdquo;
          </p>
        )}

        {card.reason && (
          <div className="flex items-start gap-2 bg-white/10 backdrop-blur-sm px-3 py-2.5 mb-3 border border-white/10">
            <Icon
              name="auto_awesome"
              size={13}
              className="text-white/80 mt-0.5 flex-shrink-0"
            />
            <p className="text-[11px] text-white/95 leading-relaxed">
              {card.reason}
            </p>
          </div>
        )}

        {/* Match bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-[2px] bg-white/20 overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-500"
              style={{ width: `${card.match_score}%` }}
            />
          </div>
          <span className="text-[9px] font-mono text-white/70 font-bold tracking-widest">
            {card.match_score}%
          </span>
        </div>
      </div>
    </div>
  );
}

function SwipeCardBack({ card }: { card: RecommendationCandidate }) {
  const hasAnyNotes =
    card.notes_top.length + card.notes_heart.length + card.notes_base.length >
    0;
  return (
    <div className="relative w-full h-full overflow-hidden bg-background border border-outline-variant flex flex-col">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-outline-variant/50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-[0.3em] text-outline mb-1">
              {card.brand}
            </p>
            <h2 className="text-xl font-bold tracking-tight leading-tight">
              {card.name}
            </h2>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className="text-[9px] uppercase tracking-widest text-outline">
              Prix
            </span>
            <span className="text-sm font-mono font-bold tracking-tight">
              {card.price_range || "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Pyramid + availability */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {hasAnyNotes ? (
          <div className="space-y-5">
            <NotesLayer
              label="Notes de tête"
              timing="T+0 → T+15 min"
              notes={card.notes_top}
              shape="round"
            />
            <NotesLayer
              label="Notes de cœur"
              timing="T+30 min → T+4 h"
              notes={card.notes_heart}
              shape="square"
            />
            <NotesLayer
              label="Notes de fond"
              timing="T+6 h → T+24 h"
              notes={card.notes_base}
              shape="bar"
            />
          </div>
        ) : (
          <p className="text-sm text-outline italic">
            Pyramide olfactive non détaillée.
          </p>
        )}

        {card.available_at.length > 0 && (
          <div className="mt-6 pt-5 border-t border-outline-variant/50">
            <div className="flex items-center gap-2 mb-3">
              <Icon name="storefront" size={13} className="text-primary" />
              <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-outline">
                Où le sentir
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {card.available_at.map((id) => {
                const b = findBoutiqueById(id);
                if (!b) return null;
                return (
                  <li key={id}>
                    <a
                      href={b.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="flex items-center gap-3 border border-outline-variant/60 px-3 py-2.5 hover:border-primary transition-all active:scale-[0.99]"
                    >
                      <div className="w-9 h-9 flex-shrink-0 bg-primary text-on-primary flex items-center justify-center font-mono font-black text-[11px] tracking-widest">
                        {b.shortLabel.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold tracking-tight leading-tight">
                          {b.name}
                        </p>
                        <p className="text-[10px] uppercase tracking-widest text-outline mt-0.5">
                          {b.city} · {b.note}
                        </p>
                      </div>
                      <Icon
                        name="open_in_new"
                        size={14}
                        className="text-outline flex-shrink-0"
                      />
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Footer — match strip */}
      <div className="px-5 py-4 border-t border-outline-variant/50 flex items-center justify-end gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono font-bold text-outline tracking-widest">
            {card.match_score}% MATCH
          </span>
          <Icon name="flip" size={14} className="text-outline" />
        </div>
      </div>
    </div>
  );
}

function NotesLayer({
  label,
  timing,
  notes,
  shape,
}: {
  label: string;
  timing: string;
  notes: string[];
  shape: "round" | "square" | "bar";
}) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-outline">
        {timing}
      </p>
      <h3 className="text-lg font-bold tracking-tight mb-2">{label}</h3>
      {notes.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {notes.map((n) => (
            <li key={n} className="flex items-center gap-2.5">
              <span
                className={clsx(
                  "flex-shrink-0",
                  shape === "round" &&
                    "w-2 h-2 rounded-full border border-primary",
                  shape === "square" && "w-2 h-2 bg-primary",
                  shape === "bar" && "w-2 h-4 bg-primary",
                )}
              />
              <span className="text-[12px] uppercase font-bold tracking-widest">
                {n}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-outline italic">Non documenté.</p>
      )}
    </div>
  );
}

/* ========================================================================
 * Mode picker — "Pour moi" vs "Pour un ami"
 * ====================================================================== */

function ModePickerView({
  hasProfile,
  error,
  remainingRecs,
  subscription,
  onPick,
}: {
  hasProfile: boolean;
  error: string | null;
  remainingRecs: number;
  subscription: SubscriptionTier;
  onPick: (m: Mode) => void;
}) {
  const unlimited = remainingRecs === Infinity;
  const tierLabel =
    subscription === "free"
      ? "Découverte"
      : `Abonné ${TIER_LABELS[subscription]}`;
  return (
    <div className="px-6 pt-4 pb-12 min-h-screen flex flex-col">
      <header className="mb-10">
        <p className="text-[10px] uppercase tracking-[0.3em] text-outline mb-2">
          Agent personnel
        </p>
        <h1 className="text-5xl font-medium leading-[0.9] tracking-tighter">
          Pour qui
          <br />
          on cherche ?
        </h1>
        <p className="text-sm text-on-surface-variant mt-4 leading-relaxed">
          Soit tu découvres tes propres parfums, soit tu aides un pote à
          trouver le sien — avec un rapport à transmettre à son vendeur.
        </p>
        <p className="text-[11px] text-outline mt-3 flex items-center gap-1.5">
          <Icon name="storefront" size={12} />
          Recommandations priorisées sur les stocks Jovoy · Nose · Sens
          Unique · ODORARE · Galeries Lafayette · Printemps.
        </p>
      </header>

      {/* Quota strip */}
      <div className="mb-8 border border-outline-variant p-4 flex items-center gap-3">
        <div
          className={clsx(
            "w-9 h-9 flex items-center justify-center flex-shrink-0",
            subscription === "free"
              ? "bg-surface-container-high text-on-background"
              : "bg-primary text-on-primary",
          )}
        >
          <Icon
            name={subscription === "free" ? "lock" : "verified"}
            filled={subscription !== "free"}
            size={16}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] uppercase tracking-[0.25em] text-outline font-mono">
            {tierLabel}
          </p>
          <p className="text-sm font-semibold tracking-tight">
            {unlimited
              ? "Recommandations illimitées."
              : `${remainingRecs} recommandation${remainingRecs > 1 ? "s" : ""} restante${remainingRecs > 1 ? "s" : ""} ce mois-ci.`}
          </p>
        </div>
        {subscription !== "mecene" && (
          <Link
            href="/abonnement?from=recommendations"
            className="text-[10px] uppercase tracking-widest font-bold border-b border-primary pb-0.5 flex-shrink-0"
          >
            {subscription === "free" ? "Passer payant" : "Upgrade"}
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-3 flex-1">
        {/* Pour moi */}
        <button
          type="button"
          onClick={() => onPick("self")}
          className="group relative border border-outline-variant bg-background p-6 text-left hover:border-primary transition-all active:scale-[0.98] overflow-hidden"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 flex-shrink-0 bg-primary text-on-primary flex items-center justify-center">
              <Icon name="fingerprint" size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] uppercase tracking-[0.3em] text-outline mb-1">
                Option 01
              </p>
              <h2 className="text-2xl font-semibold tracking-tight mb-2">
                Pour moi
              </h2>
              <p className="text-[12px] text-on-surface-variant leading-relaxed">
                {hasProfile
                  ? "Basé sur ton ADN olfactif et ta wishlist. Les matchs vont directement dans ta wishlist."
                  : "Profil olfactif pas encore rempli — les recommandations seront moins précises."}
              </p>
            </div>
            <Icon
              name="arrow_forward"
              size={18}
              className="text-outline group-hover:text-primary flex-shrink-0 mt-2"
            />
          </div>
        </button>

        {/* Pour un ami */}
        <button
          type="button"
          onClick={() => onPick("friend")}
          className="group relative border border-outline-variant bg-background p-6 text-left hover:border-primary transition-all active:scale-[0.98] overflow-hidden"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 flex-shrink-0 bg-surface-container-high text-on-background border border-outline-variant flex items-center justify-center">
              <Icon name="groups" size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] uppercase tracking-[0.3em] text-outline mb-1">
                Option 02
              </p>
              <h2 className="text-2xl font-semibold tracking-tight mb-2">
                Pour un ami
              </h2>
              <p className="text-[12px] text-on-surface-variant leading-relaxed">
                Quiz ultra-direct sur ses goûts, sa vibe, son budget. On te
                génère des parfums à swiper, puis un rapport clair à
                transmettre à un vendeur.
              </p>
            </div>
            <Icon
              name="arrow_forward"
              size={18}
              className="text-outline group-hover:text-primary flex-shrink-0 mt-2"
            />
          </div>
        </button>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorBubble
            detail={error}
            context="Recommandations · ModePicker"
            variant="block"
          />
        </div>
      )}

      <p className="text-[10px] uppercase tracking-[0.2em] text-outline text-center mt-8">
        Équipe La Niche · Analyse · Recherche · Sélection
      </p>
    </div>
  );
}

/* ========================================================================
 * Friend quiz — one question at a time, auto-advance on answer
 * ====================================================================== */

function QuizView({
  answers,
  setAnswers,
  onComplete,
  onBack,
}: {
  answers: Record<string, QuizAnswer>;
  setAnswers: (a: Record<string, QuizAnswer>) => void;
  onComplete: (answers: Record<string, QuizAnswer>) => void;
  onBack: () => void;
}) {
  const [step, setStep] = useState(0);
  const q = QUIZ_QUESTIONS[step];
  const progress = (step + 1) / QUIZ_QUESTIONS.length;
  const current = answers[q.id];

  function commit(next: Record<string, QuizAnswer>) {
    setAnswers(next);
    if (step + 1 >= QUIZ_QUESTIONS.length) {
      onComplete(next);
    } else {
      setStep(step + 1);
    }
  }

  function pickSingle(value: string) {
    commit({ ...answers, [q.id]: value });
  }

  function toggleMulti(value: string) {
    const arr = Array.isArray(current) ? current : [];
    const next = arr.includes(value)
      ? arr.filter((v) => v !== value)
      : [...arr, value];
    setAnswers({ ...answers, [q.id]: next });
  }

  function continueMulti() {
    if (Array.isArray(current) && current.length > 0) {
      commit({ ...answers, [q.id]: current });
    }
  }

  function back() {
    if (step === 0) onBack();
    else setStep((s) => s - 1);
  }

  const canContinue =
    q.multi && Array.isArray(current) && current.length > 0;

  return (
    <div className="px-6 pt-4 pb-32 min-h-screen flex flex-col">
      <div className="flex items-center gap-3 mb-8">
        <button
          type="button"
          onClick={back}
          aria-label="Retour"
          className="w-8 h-8 flex items-center justify-center text-outline hover:text-on-background transition-colors"
        >
          <Icon name="arrow_back" size={18} />
        </button>
        <div className="flex-1 h-[3px] bg-outline-variant/40 relative overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-primary transition-all duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="text-[10px] font-mono font-bold text-outline min-w-[36px] text-right">
          {String(step + 1).padStart(2, "0")}/
          {String(QUIZ_QUESTIONS.length).padStart(2, "0")}
        </span>
      </div>

      <div key={q.id} className="quiz-in flex-1 flex flex-col">
        <p className="text-[10px] uppercase tracking-[0.3em] text-outline mb-3">
          Pour un ami · question {step + 1}
          {q.multi ? " · choix multiples" : ""}
        </p>
        <h1 className="text-3xl font-medium leading-[1.05] tracking-tighter mb-3">
          {q.question.friend}
        </h1>
        {q.subtitle?.friend && (
          <p className="text-sm text-on-surface-variant mb-8">
            {q.subtitle.friend}
          </p>
        )}

        <div className="flex flex-col gap-2 mt-4">
          {q.options.map((opt) => {
            const picked = q.multi
              ? Array.isArray(current) && current.includes(opt.value)
              : current === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  q.multi ? toggleMulti(opt.value) : pickSingle(opt.value)
                }
                aria-pressed={picked}
                className={clsx(
                  "w-full py-4 px-5 text-left border transition-all active:scale-[0.98] flex items-center gap-3",
                  picked
                    ? "bg-primary text-on-primary border-primary"
                    : "bg-background border-outline-variant hover:border-primary hover:bg-surface-container-low",
                )}
              >
                {q.multi && (
                  <Icon
                    name={picked ? "check_box" : "check_box_outline_blank"}
                    filled={picked}
                    size={18}
                  />
                )}
                <span className="text-sm font-medium leading-relaxed flex-1">
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>

        {q.multi && (
          <button
            type="button"
            onClick={continueMulti}
            disabled={!canContinue}
            className="mt-6 w-full py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.25em] font-bold active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
          >
            <Icon name="arrow_forward" size={16} />
            Continuer
          </button>
        )}
      </div>
    </div>
  );
}

/* ========================================================================
 * Report loading
 * ====================================================================== */

function ReportLoadingView() {
  return (
    <div className="px-6 pt-16 pb-12 min-h-screen flex flex-col items-center text-center">
      <div className="w-16 h-16 border-2 border-outline-variant flex items-center justify-center mb-6">
        <Icon name="description" size={24} className="text-primary" />
      </div>
      <p className="text-[10px] uppercase tracking-[0.3em] text-outline mb-2">
        Rapport en cours
      </p>
      <h1 className="text-3xl font-medium tracking-tighter max-w-xs">
        Rédaction du brief pour le vendeur…
      </h1>
      <div className="mt-8 flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" />
        <span
          className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
          style={{ animationDelay: "0.15s" }}
        />
        <span
          className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
          style={{ animationDelay: "0.3s" }}
        />
      </div>
    </div>
  );
}

/* ========================================================================
 * Report view — fullscreen sliding panel with stagger-fade sections
 * ====================================================================== */

function ReportView({
  report,
  dna,
  onBack,
  onRestart,
}: {
  report: FriendReport;
  dna: OlfactiveDNA | null;
  onBack: () => void;
  onRestart: () => void;
}) {
  function share() {
    const parts: string[] = [];
    parts.push("RAPPORT PARFUM — La Niche");
    parts.push("");
    parts.push(`RÉSUMÉ : ${report.summary}`);
    parts.push("");
    parts.push(`SIGNATURE : ${report.signature}`);
    if (report.loved_references.length) {
      parts.push("");
      parts.push("PARFUMS AIMÉS :");
      report.loved_references.forEach((r) => {
        parts.push(`• ${r.brand} — ${r.name} [${r.family}]`);
        parts.push(`  → ${r.why}`);
      });
    }
    if (report.rejected_references.length) {
      parts.push("");
      parts.push("PARFUMS REJETÉS (à éviter) :");
      report.rejected_references.forEach((r) => {
        parts.push(`• ${r.brand} — ${r.name} [${r.family}]`);
        parts.push(`  → ${r.why}`);
      });
    }
    parts.push("");
    parts.push("CONSEIL DE VENTE :");
    parts.push(report.sales_advice);
    const text = parts.join("\n");

    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: "Rapport parfum", text }).catch(() => {});
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  }

  return (
    <div className="report-panel fixed inset-0 z-50 bg-background overflow-y-auto">
      {/* Header bar */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-outline-variant/40 px-6 py-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          aria-label="Fermer"
          className="w-8 h-8 flex items-center justify-center text-on-background hover:text-primary transition-colors"
        >
          <Icon name="close" size={22} />
        </button>
        <span className="text-[10px] uppercase tracking-[0.3em] text-outline font-mono">
          Rapport · Vendeur
        </span>
        <button
          type="button"
          onClick={share}
          aria-label="Partager"
          className="w-8 h-8 flex items-center justify-center text-on-background hover:text-primary transition-colors"
        >
          <Icon name="ios_share" size={20} />
        </button>
      </header>

      <div className="px-6 pt-8 pb-28 max-w-xl mx-auto">
        {/* 00 — title */}
        <section
          className="report-section mb-10"
          style={{ animationDelay: "0ms" }}
        >
          <p className="text-[10px] uppercase tracking-[0.3em] text-outline mb-3">
            Brief actionnable
          </p>
          <h1 className="text-4xl font-medium leading-[0.95] tracking-tighter">
            Rapport olfactif.
          </h1>
        </section>

        {/* 01 — summary */}
        <section
          className="report-section mb-10"
          style={{ animationDelay: "120ms" }}
        >
          <div className="flex items-center gap-3 mb-4">
            <span className="text-primary font-mono text-[11px]">01</span>
            <div className="h-px flex-1 bg-outline-variant" />
            <h2 className="text-[10px] uppercase font-bold tracking-widest">
              Résumé
            </h2>
          </div>
          <p className="text-2xl font-medium tracking-tight leading-snug">
            {report.summary || "—"}
          </p>
        </section>

        {/* 02 — signature */}
        <section
          className="report-section mb-10"
          style={{ animationDelay: "240ms" }}
        >
          <div className="flex items-center gap-3 mb-4">
            <span className="text-primary font-mono text-[11px]">02</span>
            <div className="h-px flex-1 bg-outline-variant" />
            <h2 className="text-[10px] uppercase font-bold tracking-widest">
              Signature olfactive
            </h2>
          </div>
          <p className="text-sm text-on-background leading-relaxed italic border-l-2 border-primary pl-4">
            {report.signature || "—"}
          </p>
          {dna && dna.key_notes.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {dna.dominant_accords.slice(0, 3).map((a) => (
                <span
                  key={a}
                  className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 bg-primary text-on-primary"
                >
                  {a}
                </span>
              ))}
              {dna.key_notes.slice(0, 6).map((n) => (
                <span
                  key={n}
                  className="text-[10px] uppercase tracking-widest px-2 py-0.5 border border-outline-variant text-on-surface-variant"
                >
                  {n}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* 03 — loved references */}
        <section
          className="report-section mb-10"
          style={{ animationDelay: "360ms" }}
        >
          <div className="flex items-center gap-3 mb-4">
            <span className="text-primary font-mono text-[11px]">03</span>
            <div className="h-px flex-1 bg-outline-variant" />
            <h2 className="text-[10px] uppercase font-bold tracking-widest">
              Aimés · proposer des similaires
            </h2>
          </div>
          {report.loved_references.length === 0 ? (
            <p className="text-sm italic text-outline">
              Aucun parfum matché pendant la session.
            </p>
          ) : (
            <ul className="flex flex-col">
              {report.loved_references.map((r) => (
                <li
                  key={`${r.brand}-${r.name}`}
                  className="py-4 border-b border-outline-variant/40 last:border-0"
                >
                  <div className="flex items-start gap-3 mb-1.5">
                    <div className="w-6 h-6 bg-primary text-on-primary flex items-center justify-center flex-shrink-0">
                      <Icon name="favorite" filled size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-outline">
                        {r.brand}
                      </p>
                      <p className="text-lg font-semibold tracking-tight leading-tight">
                        {r.name}
                      </p>
                      <p className="text-[10px] uppercase tracking-widest text-outline mt-0.5">
                        {r.family}
                      </p>
                    </div>
                  </div>
                  <p className="text-[12px] text-on-surface-variant leading-relaxed pl-9">
                    {r.why}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 04 — rejected references */}
        <section
          className="report-section mb-10"
          style={{ animationDelay: "480ms" }}
        >
          <div className="flex items-center gap-3 mb-4">
            <span className="text-primary font-mono text-[11px]">04</span>
            <div className="h-px flex-1 bg-outline-variant" />
            <h2 className="text-[10px] uppercase font-bold tracking-widest">
              Rejetés · à éviter
            </h2>
          </div>
          {report.rejected_references.length === 0 ? (
            <p className="text-sm italic text-outline">
              Aucun parfum rejeté — ouvert à tout.
            </p>
          ) : (
            <ul className="flex flex-col">
              {report.rejected_references.map((r) => (
                <li
                  key={`${r.brand}-${r.name}`}
                  className="py-4 border-b border-outline-variant/40 last:border-0"
                >
                  <div className="flex items-start gap-3 mb-1.5">
                    <div className="w-6 h-6 border border-outline-variant flex items-center justify-center flex-shrink-0 text-outline">
                      <Icon name="close" size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-outline">
                        {r.brand}
                      </p>
                      <p className="text-base font-semibold tracking-tight leading-tight text-on-surface-variant line-through">
                        {r.name}
                      </p>
                      <p className="text-[10px] uppercase tracking-widest text-outline mt-0.5">
                        {r.family}
                      </p>
                    </div>
                  </div>
                  <p className="text-[12px] text-on-surface-variant leading-relaxed pl-9">
                    {r.why}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 05 — sales advice */}
        <section
          className="report-section mb-10"
          style={{ animationDelay: "600ms" }}
        >
          <div className="flex items-center gap-3 mb-4">
            <span className="text-primary font-mono text-[11px]">05</span>
            <div className="h-px flex-1 bg-outline-variant" />
            <h2 className="text-[10px] uppercase font-bold tracking-widest">
              Conseil pour le vendeur
            </h2>
          </div>
          <div className="bg-surface-container-low border border-outline-variant p-5">
            <p className="text-[13px] text-on-background leading-relaxed">
              {report.sales_advice || "—"}
            </p>
          </div>
        </section>

        {/* Actions */}
        <section
          className="report-section flex flex-col gap-2"
          style={{ animationDelay: "720ms" }}
        >
          <button
            type="button"
            onClick={share}
            className="w-full py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.25em] font-bold active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Icon name="ios_share" size={16} />
            Partager le rapport
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full py-3 border border-outline-variant rounded-full text-[10px] uppercase tracking-widest font-bold hover:border-primary transition-all"
          >
            Nouvelle session
          </button>
        </section>
      </div>
    </div>
  );
}
