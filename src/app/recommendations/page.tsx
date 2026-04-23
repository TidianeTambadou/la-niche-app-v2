"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import {
  readProfileFromUser,
  FAMILY_VULGAR,
  INTENSITY_VULGAR,
  BUDGET_VULGAR,
  type OlfactiveProfile,
} from "@/lib/profile";
import { agentRecommend } from "@/lib/agent-client";
import type { RecommendationCandidate } from "@/lib/agent";

type Phase = "configure" | "loading" | "swiping" | "done";
type Count = 5 | 10 | 20;

/* -------------------------------------------------------------------------
 * Profile → prompt context. Same shape as ConciergeWidget so the recs feel
 * consistent with what the concierge knows about the user.
 * --------------------------------------------------------------------- */

function buildProfileContext(profile: OlfactiveProfile | null): string {
  if (!profile) return "";
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
  const { user } = useAuth();
  const { wishlist, addToWishlist } = useStore();

  const [phase, setPhase] = useState<Phase>("configure");
  const [count, setCount] = useState<Count>(10);
  const [recs, setRecs] = useState<RecommendationCandidate[]>([]);
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cardExiting, setCardExiting] = useState<"left" | "right" | null>(null);
  const [liked, setLiked] = useState(0);
  const [passed, setPassed] = useState(0);
  const [matchedCards, setMatchedCards] = useState<RecommendationCandidate[]>([]);

  // Drag state
  const [dragX, setDragX] = useState(0);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);

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

  async function generate() {
    setPhase("loading");
    setError(null);
    setIdx(0);
    setLiked(0);
    setPassed(0);
    setMatchedCards([]);
    try {
      const result = await agentRecommend(
        count,
        buildProfileContext(profile),
        likedFragrances,
        dislikedFragrances,
      );
      if (result.length === 0) {
        setError(
          "Aucune recommandation générée. Essaie de compléter ton profil ou d'ajouter quelques parfums en wishlist.",
        );
        setPhase("configure");
        return;
      }
      setRecs(result);
      setPhase("swiping");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setPhase("configure");
    }
  }

  function decide(decision: "liked" | "disliked") {
    if (cardExiting || phase !== "swiping") return;
    const card = recs[idx];
    if (!card) return;

    setCardExiting(decision === "liked" ? "right" : "left");

    const fragranceId = recFragranceId(card);
    addToWishlist(fragranceId, decision, "search", {
      name: card.name,
      brand: card.brand,
      imageUrl: card.image_url ?? null,
    });

    if (decision === "liked") {
      setLiked((n) => n + 1);
      setMatchedCards((prev) => [...prev, card]);
    } else {
      setPassed((n) => n + 1);
    }

    window.setTimeout(() => {
      setCardExiting(null);
      setDragX(0);
      if (idx + 1 >= recs.length) {
        setPhase("done");
      } else {
        setIdx((i) => i + 1);
      }
    }, 380);
  }

  /* Drag handlers */
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (cardExiting) return;
    isDragging.current = true;
    dragStartX.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging.current || cardExiting) return;
    setDragX(e.clientX - dragStartX.current);
  }
  function onPointerUp() {
    if (!isDragging.current) return;
    isDragging.current = false;
    const current = dragX;
    if (Math.abs(current) > 90) {
      decide(current > 0 ? "liked" : "disliked");
    } else {
      setDragX(0);
    }
  }

  /* -------------------------------- Phases ------------------------------ */

  if (phase === "configure") {
    return (
      <ConfigureView
        profile={profile}
        count={count}
        setCount={setCount}
        onGenerate={generate}
        error={error}
        likedCount={likedFragrances.length}
      />
    );
  }

  if (phase === "loading") {
    return <LoadingView count={count} />;
  }

  if (phase === "done") {
    return (
      <DoneView
        liked={liked}
        passed={passed}
        matchedCards={matchedCards}
        onRestart={() => {
          setPhase("configure");
          setRecs([]);
          setError(null);
        }}
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
            <SwipeCard card={nextCard} />
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
            <SwipeCard card={currentCard} dragIntent={dragIntent} />
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
          aria-label="Détails Fragrantica"
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
  error,
  likedCount,
}: {
  profile: OlfactiveProfile | null;
  count: Count;
  setCount: (c: Count) => void;
  onGenerate: () => void;
  error: string | null;
  likedCount: number;
}) {
  return (
    <div className="px-6 pt-4 pb-12">
      <header className="mb-10">
        <p className="text-[10px] uppercase tracking-[0.3em] text-outline mb-2">
          Archives &amp; aspirations
        </p>
        <h1 className="text-5xl font-medium leading-[0.9] tracking-tighter">
          Pour toi.
        </h1>
        <p className="text-sm text-on-surface-variant mt-4 max-w-md leading-relaxed">
          L&apos;IA analyse ton profil olfactif et ta wishlist pour te
          proposer des parfums que tu n&apos;as pas encore croisés. Swipe
          ou tape pour décider — chaque choix affine ta signature.
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
        <p className="mb-6 text-[11px] text-error border border-error/40 bg-error/5 px-4 py-3">
          {error}
        </p>
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
        Sources Fragrantica · Basenotes · Parfumo
      </p>
    </div>
  );
}

/* ========================================================================
 * Loading view
 * ====================================================================== */

function LoadingView({ count }: { count: number }) {
  return (
    <div className="px-6 pt-4 pb-12 flex flex-col items-center text-center">
      <div className="mt-8 mb-6 w-full max-w-md">
        <div
          className="relative overflow-hidden bg-surface-container-low border border-outline-variant"
          style={{ aspectRatio: "3 / 4.6" }}
        >
          <div className="shimmer-bar absolute inset-0" />
        </div>
      </div>
      <p className="text-[10px] uppercase tracking-[0.3em] text-outline mb-2">
        Analyse en cours
      </p>
      <p className="text-sm text-on-surface-variant max-w-xs">
        L&apos;IA croise ton profil avec {count} suggestions Fragrantica…
      </p>
      <div className="mt-6 flex items-center gap-2">
        <span className="w-2 h-2 bg-primary rounded-full animate-bounce" />
        <span
          className="w-2 h-2 bg-primary rounded-full animate-bounce"
          style={{ animationDelay: "0.15s" }}
        />
        <span
          className="w-2 h-2 bg-primary rounded-full animate-bounce"
          style={{ animationDelay: "0.3s" }}
        />
      </div>
    </div>
  );
}

/* ========================================================================
 * Done view
 * ====================================================================== */

function DoneView({
  liked,
  passed,
  matchedCards,
  onRestart,
}: {
  liked: number;
  passed: number;
  matchedCards: RecommendationCandidate[];
  onRestart: () => void;
}) {
  return (
    <div className="px-6 pt-4 pb-12">
      <header className="mb-10">
        <p className="text-[10px] uppercase tracking-[0.3em] text-outline mb-2">
          Session terminée
        </p>
        <h1 className="text-5xl font-medium leading-[0.9] tracking-tighter">
          Ta signature
          <br />
          s&apos;affine.
        </h1>
      </header>

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
                <div className="w-12 h-16 bg-surface-container-low overflow-hidden flex-shrink-0">
                  {c.image_url && (
                    <img
                      src={c.image_url}
                      alt={c.name}
                      className="w-full h-full object-cover grayscale"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                </div>
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
                <a
                  href={c.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-outline hover:text-primary transition-colors"
                  aria-label="Détails"
                >
                  <Icon name="open_in_new" size={16} />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onRestart}
          className="w-full py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.25em] font-bold active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <Icon name="refresh" size={16} />
          Nouvelle session
        </button>
        <Link
          href="/wishlist"
          className="w-full py-3 border border-outline-variant rounded-full text-[10px] uppercase tracking-widest font-bold text-center hover:border-primary transition-all"
        >
          Voir la wishlist
        </Link>
      </div>
    </div>
  );
}

/* ========================================================================
 * Swipe Card — the actual Tinder-style fragrance card
 * ====================================================================== */

function SwipeCard({
  card,
  dragIntent,
}: {
  card: RecommendationCandidate;
  dragIntent?: "liked" | "disliked" | null;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const fallback = `https://placehold.co/600x900/0a0a0a/e2e2e2?font=montserrat&text=${encodeURIComponent(card.name)}`;
  const imageUrl = !imgFailed && card.image_url ? card.image_url : fallback;

  return (
    <div className="relative w-full h-full overflow-hidden bg-background border border-outline-variant shadow-xl">
      {/* Background image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={card.name}
        draggable={false}
        className="absolute inset-0 w-full h-full object-cover grayscale select-none"
        onError={() => setImgFailed(true)}
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

      {/* Drag intent stamps */}
      {dragIntent === "liked" && (
        <div
          className="absolute top-8 left-5 -rotate-[18deg] border-4 border-white text-white px-5 py-2 text-3xl font-black tracking-widest"
          style={{ textShadow: "0 2px 10px rgba(0,0,0,0.6)" }}
        >
          MATCH ♥
        </div>
      )}
      {dragIntent === "disliked" && (
        <div
          className="absolute top-8 right-5 rotate-[18deg] border-4 border-white text-white px-5 py-2 text-3xl font-black tracking-widest"
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

        {card.notes_brief && (
          <p className="text-[11px] text-white/75 mb-3 leading-relaxed">
            {card.notes_brief}
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
