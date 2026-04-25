"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";
import { ErrorBubble } from "@/components/ErrorBubble";
import { PerfumeArtwork } from "@/components/PerfumeArtwork";
import { NewsRail } from "@/components/NewsRail";
import { latestNews } from "@/lib/news";
import { useAuth } from "@/lib/auth";
import { readProfileFromUser, FAMILY_VULGAR } from "@/lib/profile";
import { useDailyPicks, type DailyPicksHook } from "@/lib/daily-picks";
import type { SearchCandidate } from "@/lib/agent";
import { useStore } from "@/lib/store";

/* ─── Phrases éditoriales — rotation par jour ─────────────────────────── */

const PHRASES = [
  "Le parfum est la mémoire la plus fidèle.",
  "Sentir, c'est voyager sans bouger.",
  "Une fragrance, un instant, un soi différent.",
  "Le nez précède les yeux.",
  "Ce que le temps efface, le parfum le garde.",
  "L'invisible laisse les traces les plus profondes.",
  "Chaque note est une décision.",
  "L'atelier commence par le silence.",
  "Ce qui disparaît reste le plus longtemps.",
  "Le luxe n'est pas visible, il est respiré.",
  "Un parfum ne se choisit pas — il se reconnaît.",
  "La peau est la dernière surface libre.",
  "Une odeur n'a pas de visage, elle a une présence.",
  "Le sillage est ce qu'on laisse sans le dire.",
  "Toute composition est une autobiographie.",
];

function phraseOfDay(): string {
  const day = Math.floor(Date.now() / 86_400_000);
  return PHRASES[day % PHRASES.length];
}

/* ─── Page ─────────────────────────────────────────────────────────────── */

export default function HomePage() {
  const { user } = useAuth();
  const profile = readProfileFromUser(user);
  const news = latestNews(6);
  const dailyPicks = useDailyPicks(profile, user?.id ?? null);

  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <div className="px-6 pt-4 pb-12">

      {/* ── Hero éditorial ──────────────────────────────────────────────── */}
      <section className="mb-14 pt-2">
        <p className="text-[10px] font-mono text-outline uppercase tracking-[0.2em] mb-8">
          {today}
        </p>
        <blockquote className="text-[2rem] font-extralight italic tracking-tight leading-[1.2] text-on-background mb-8">
          &laquo;&thinsp;{phraseOfDay()}&thinsp;&raquo;
        </blockquote>
        <div className="h-px bg-outline-variant/50" />
      </section>

      {/* ── Actions rapides ─────────────────────────────────────────────── */}
      <section className="mb-12">
        <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-outline mb-4">
          Explorer
        </p>
        <div className="grid grid-cols-3 gap-px bg-outline-variant/40">
          <QuickAction href="/search" icon="search" label="Search" sublabel="Équipe" />
          <QuickAction href="/scan" icon="qr_code_scanner" label="Scan" sublabel="Caméra" />
          <QuickAction href="/balade" icon="directions_walk" label="Balade" sublabel="Test" />
        </div>
      </section>

      {/* ── ADN olfactif ────────────────────────────────────────────────── */}
      <section className="mb-12">
        <div className="flex justify-between items-end mb-4">
          <p className="text-[10px] uppercase tracking-[0.25em] font-bold">
            ADN olfactif
          </p>
          {profile && (
            <Link
              href="/onboarding"
              className="text-[10px] uppercase tracking-widest font-bold border-b border-primary pb-0.5"
            >
              Modifier
            </Link>
          )}
        </div>

        {profile ? (
          <div className="border border-outline-variant/40 p-5 space-y-5">
            <div>
              <p className="text-[9px] uppercase tracking-widest text-outline mb-2.5">
                Familles
              </p>
              <div className="flex flex-wrap gap-2">
                {profile.preferred_families.map((f) => (
                  <span
                    key={f}
                    className="text-[10px] uppercase tracking-widest border border-outline-variant px-3 py-1.5 font-medium"
                  >
                    {FAMILY_VULGAR[f]?.title ?? f}
                  </span>
                ))}
              </div>
            </div>
            <div className="h-px bg-outline-variant/40" />
            <div className="flex gap-10">
              <div>
                <p className="text-[9px] uppercase tracking-widest text-outline mb-1">
                  Intensité
                </p>
                <p className="text-[11px] font-bold uppercase tracking-widest">
                  {profile.intensity_preference === "subtle"
                    ? "Subtile"
                    : profile.intensity_preference === "moderate"
                      ? "Modérée"
                      : "Projective"}
                </p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-widest text-outline mb-1">
                  Moments
                </p>
                <p className="text-[11px] font-bold uppercase tracking-widest">
                  {profile.moments.length} sélectionné{profile.moments.length > 1 ? "s" : ""}
                </p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-widest text-outline mb-1">
                  Budget
                </p>
                <p className="text-[11px] font-bold uppercase tracking-widest">
                  {profile.budget === "u100"
                    ? "< 100€"
                    : profile.budget === "100_200"
                      ? "100–200€"
                      : profile.budget === "o200"
                        ? "> 200€"
                        : "Libre"}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <Link
            href="/onboarding"
            className="flex items-center justify-between border border-outline-variant/40 p-5 hover:bg-surface-container-low transition-colors group"
          >
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest">
                Définis ton profil
              </p>
              <p className="text-[10px] uppercase tracking-widest text-outline mt-1.5">
                8 questions · 2 minutes
              </p>
            </div>
            <Icon
              name="arrow_forward"
              size={18}
              className="text-outline group-hover:text-on-background transition-colors"
            />
          </Link>
        )}
      </section>

      {/* ── Sélection pour toi (carrousel quotidien) ───────────────────── */}
      <section className="mb-12">
        <div className="flex justify-between items-end mb-4">
          <p className="text-[10px] uppercase tracking-[0.25em] font-bold">
            Sélection pour toi
          </p>
          <span className="text-[10px] font-mono text-outline">
            Du jour
          </span>
        </div>
        <DailyShowcase hook={dailyPicks} hasProfile={!!profile} />
      </section>

      {/* ── Actualité ───────────────────────────────────────────────────── */}
      <section>
        <div className="flex justify-between items-end mb-4">
          <p className="text-[10px] uppercase tracking-[0.25em] font-bold">
            Actualité
          </p>
          <span className="text-[10px] font-mono text-outline">
            {new Date().toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
        <NewsRail items={news} />
      </section>

    </div>
  );
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function QuickAction({
  href,
  icon,
  label,
  sublabel,
}: {
  href: string;
  icon: string;
  label: string;
  sublabel: string;
}) {
  return (
    <Link
      href={href}
      className="bg-background hover:bg-primary group p-6 aspect-square flex flex-col justify-between transition-colors duration-300"
    >
      <Icon
        name={icon}
        size={22}
        className="text-on-background group-hover:text-on-primary transition-colors"
      />
      <div>
        <p className="text-sm uppercase tracking-widest font-medium text-on-background group-hover:text-on-primary transition-colors">
          {label}
        </p>
        <p className="text-[9px] uppercase tracking-widest text-outline group-hover:text-on-primary/60 mt-1">
          {sublabel}
        </p>
      </div>
    </Link>
  );
}

/* ─── Daily picks — La Niche envelope + 3 reveal flashcards ─────────────── */

function DailyShowcase({
  hook,
  hasProfile,
}: {
  hook: DailyPicksHook;
  hasProfile: boolean;
}) {
  const { state, reveal } = hook;

  if (state.status === "loading") {
    return (
      <div
        className="aspect-[3/4] max-w-md mx-auto shimmer-bar"
        aria-label="Chargement de la sélection du jour"
      />
    );
  }

  if (state.status === "error") {
    return (
      <ErrorBubble
        detail={state.error}
        context="Sélection du jour"
        variant="block"
      />
    );
  }

  if (state.picks.length === 0) {
    return (
      <div className="border border-outline-variant/40 bg-surface-container-low p-6 text-center">
        <p className="text-xs text-on-surface-variant">
          {hasProfile
            ? "Pas de sélection aujourd'hui — réessaie demain."
            : "Définis ton univers pour recevoir une sélection chaque jour."}
        </p>
        {!hasProfile && (
          <Link
            href="/onboarding"
            className="inline-block mt-3 text-[10px] uppercase tracking-widest font-bold border-b border-primary pb-0.5"
          >
            Commencer
          </Link>
        )}
      </div>
    );
  }

  if (!state.revealed) {
    return <DailyEnvelope picks={state.picks} onOpen={reveal} />;
  }

  return <DailyFlashcardCarousel picks={state.picks} />;
}

/* La Niche surprise card — what the user sees on first visit each day. Tap
 * to reveal the 3 flashcards. */
function DailyEnvelope({
  picks,
  onOpen,
}: {
  picks: SearchCandidate[];
  onOpen: () => void;
}) {
  const [opening, setOpening] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  function handleOpen() {
    if (opening) return;
    setOpening(true);
    // Wait for the open animation to finish before swapping in the flashcards.
    window.setTimeout(onOpen, 520);
  }

  return (
    <button
      type="button"
      onClick={handleOpen}
      className={clsx(
        "group block w-full max-w-md mx-auto aspect-[3/4] relative overflow-hidden border border-outline bg-surface-container-low active:scale-[0.985] transition-transform",
        opening && "envelope-open",
      )}
      aria-label={`Découvrir tes ${picks.length} parfums du jour`}
    >
      {/* Subtle radial gradient backdrop */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.08),transparent_60%)] pointer-events-none" />

      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center gap-5">
        <span className="text-[10px] uppercase tracking-[0.35em] text-outline">
          La Niche · {todayLabel()}
        </span>

        {/* Logo */}
        <div className="w-20 h-20 rounded-full overflow-hidden bg-background border border-outline-variant flex items-center justify-center">
          {logoFailed ? (
            <span className="font-mono font-bold text-base">LN</span>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src="/logo-laniche.png"
              alt="La Niche"
              className="w-full h-full object-cover"
              onError={() => setLogoFailed(true)}
            />
          )}
        </div>

        <div>
          <p className="text-2xl font-medium tracking-tighter leading-tight">
            <span className="italic font-serif font-light">3 parfums</span>
            <br />
            choisis pour toi.
          </p>
          <p className="text-[11px] text-on-surface-variant mt-3 max-w-xs leading-relaxed">
            Une carte par jour, basée sur ton univers olfactif. Touche pour
            révéler les flashcards.
          </p>
        </div>

        <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary text-[10px] uppercase tracking-[0.25em] font-bold rounded-full group-active:scale-95 transition-transform">
          <Icon name="auto_awesome" size={14} />
          Révéler
        </span>

        {/* Sealed-envelope hint badges */}
        <div className="flex gap-1.5 absolute bottom-4 left-1/2 -translate-x-1/2">
          {picks.map((_, i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-outline-variant/70"
            />
          ))}
        </div>
      </div>

      {/* Wax-seal style corner mark */}
      <div className="absolute top-3 right-3 px-2 py-1 bg-on-background text-background text-[9px] font-mono uppercase tracking-widest">
        Scellée
      </div>
    </button>
  );
}

function todayLabel(): string {
  return new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

/* Carousel of 3 flippable flashcards — front shows bottle/brand/name, back
 * shows family + notes brief + source link + wishlist add. */
function DailyFlashcardCarousel({ picks }: { picks: SearchCandidate[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const userInteracted = useRef(false);

  // Auto-advance every 6s (slower than before — flip animation needs time).
  useEffect(() => {
    if (picks.length < 2) return;
    const id = window.setInterval(() => {
      if (userInteracted.current) return;
      const el = scrollRef.current;
      if (!el) return;
      const next = (active + 1) % picks.length;
      const card = el.children[next] as HTMLElement | undefined;
      if (card) {
        el.scrollTo({
          left: card.offsetLeft - el.offsetLeft,
          behavior: "smooth",
        });
        setActive(next);
      }
    }, 6000);
    return () => window.clearInterval(id);
  }, [picks.length, active]);

  function noteUserInteraction() {
    userInteracted.current = true;
    window.setTimeout(() => {
      userInteracted.current = false;
    }, 12000);
  }

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const children = Array.from(el.children) as HTMLElement[];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < children.length; i++) {
      const dist = Math.abs(
        children[i].offsetLeft - el.scrollLeft - el.offsetLeft,
      );
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    if (bestIdx !== active) setActive(bestIdx);
  }

  return (
    <div className="reveal-fade-in">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onPointerDown={noteUserInteraction}
        onWheel={noteUserInteraction}
        className="flex gap-4 overflow-x-auto hide-scrollbar -mx-6 px-6 pb-2 snap-x snap-mandatory scroll-smooth"
        style={{ scrollPaddingLeft: "1.5rem" }}
      >
        {picks.map((p, i) => (
          <div
            key={`${p.brand}-${p.name}-${i}`}
            className="snap-start flex-shrink-0 min-w-[78%] sm:min-w-[280px] aspect-[3/4]"
          >
            <DailyFlashcard pick={p} index={i} />
          </div>
        ))}
      </div>
      {picks.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {picks.map((_, i) => (
            <span
              key={i}
              className={`h-[3px] transition-all ${
                i === active
                  ? "w-6 bg-primary"
                  : "w-3 bg-outline-variant/60"
              }`}
            />
          ))}
        </div>
      )}
      <p className="text-[10px] uppercase tracking-widest text-outline text-center mt-3">
        Touche une carte pour la retourner
      </p>
    </div>
  );
}

function DailyFlashcard({
  pick,
  index,
}: {
  pick: SearchCandidate;
  index: number;
}) {
  const [flipped, setFlipped] = useState(false);
  const { addToWishlist, isWishlisted } = useStore();

  const wishlistKey = `daily::${pick.brand}::${pick.name}`
    .toLowerCase()
    .replace(/\s+/g, "-");
  const liked = isWishlisted(wishlistKey) === "liked";

  function like(e: React.MouseEvent) {
    e.stopPropagation();
    addToWishlist(wishlistKey, "liked", "manual", {
      name: pick.name,
      brand: pick.brand,
      imageUrl: pick.image_url ?? null,
    });
  }

  return (
    <div
      className="flashcard-surface w-full h-full reveal-pop"
      style={{ animationDelay: `${index * 110}ms` }}
    >
      <div
        className={clsx(
          "flashcard-inner shadow-xl cursor-pointer",
          flipped && "is-flipped",
        )}
        onClick={() => setFlipped((f) => !f)}
      >
        <div className="flashcard-face">
          <DailyFlashcardFront pick={pick} />
        </div>
        <div className="flashcard-face flashcard-face--back">
          <DailyFlashcardBack pick={pick} liked={liked} onLike={like} />
        </div>
      </div>
    </div>
  );
}

function DailyFlashcardFront({ pick }: { pick: SearchCandidate }) {
  return (
    <div className="relative w-full h-full">
      <PerfumeArtwork
        brand={pick.brand}
        name={pick.name}
        family={pick.family}
        notesBrief={pick.notes_brief}
        variant="card"
        className="w-full h-full"
      />
      <div className="absolute top-2 right-2 bg-background/90 px-2 py-1 text-[9px] uppercase tracking-widest font-mono">
        Du jour
      </div>
      <div className="absolute top-2 left-2 bg-background/90 px-2 py-1 text-[9px] uppercase tracking-widest font-mono flex items-center gap-1">
        <Icon name="touch_app" size={10} />
        Tap
      </div>
    </div>
  );
}

function DailyFlashcardBack({
  pick,
  liked,
  onLike,
}: {
  pick: SearchCandidate;
  liked: boolean;
  onLike: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="relative w-full h-full overflow-hidden border border-primary bg-background p-5 flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-[9px] uppercase tracking-[0.3em] text-outline">
            {pick.brand}
          </p>
          <p className="text-base font-bold tracking-tight leading-tight mt-0.5">
            {pick.name}
          </p>
        </div>
        <span className="text-[9px] uppercase tracking-widest font-mono px-2 py-1 bg-primary text-on-primary">
          Verso
        </span>
      </div>

      {pick.family && (
        <div className="mb-3">
          <p className="text-[9px] uppercase tracking-widest text-outline mb-1">
            Famille
          </p>
          <p className="text-xs font-bold uppercase tracking-widest">
            {pick.family}
          </p>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden">
        <p className="text-[9px] uppercase tracking-widest text-outline mb-1">
          Notes
        </p>
        <p className="text-[12px] text-on-background leading-relaxed">
          {pick.notes_brief || "Notes non précisées par la source."}
        </p>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={onLike}
          className={clsx(
            "flex-1 py-2.5 rounded-full text-[10px] uppercase tracking-widest font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform",
            liked
              ? "bg-primary text-on-primary"
              : "border border-outline-variant hover:border-primary",
          )}
        >
          <Icon
            name={liked ? "favorite" : "favorite_border"}
            filled={liked}
            size={14}
          />
          {liked ? "Aimé" : "Wishlist"}
        </button>
        <a
          href={pick.source_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label="Voir la fiche"
          className="w-10 h-10 rounded-full border border-outline-variant flex items-center justify-center hover:border-primary transition-colors"
        >
          <Icon name="open_in_new" size={14} />
        </a>
      </div>
    </div>
  );
}
