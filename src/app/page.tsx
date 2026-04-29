"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";
import { ErrorBubble } from "@/components/ErrorBubble";
import { PerfumeArtwork } from "@/components/PerfumeArtwork";
import { NewsRail } from "@/components/NewsRail";
import { latestNews } from "@/lib/news";
import { useAuth, useRequireAuth } from "@/lib/auth";
import { readProfileFromUser, FAMILY_VULGAR } from "@/lib/profile";
import { useDailyPicks, type DailyPicksHook } from "@/lib/daily-picks";
import type { SearchCandidate } from "@/lib/agent";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";

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
  // Auth gate : utilisateur non connecté → redirige vers /login.
  // L'app entière est verrouillée derrière auth — aucune action sans compte.
  useRequireAuth();
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

      {/* ── Concours bannière ───────────────────────────────────────────── */}
      <ContestBanner userId={user?.id ?? null} />

      {/* ── Hero éditorial ──────────────────────────────────────────────── */}
      <section className="mb-14 pt-2">
        <p className="text-[10px] font-mono text-outline uppercase tracking-[0.2em] mb-8">
          {today}
        </p>
        <blockquote className="text-[2rem] font-extralight italic tracking-tight leading-[1.2] text-on-background mb-8">
          &laquo;&thinsp;{phraseOfDay()}&thinsp;&raquo;
          <span className="ml-2 align-super text-[0.65rem] font-mono not-italic tracking-widest text-outline">v2</span>
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

      {/* ── Mini classement ─────────────────────────────────────────────── */}
      <section className="mb-12">
        <MiniLeaderboard userId={user?.id ?? null} />
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
      {/* Drifting dotted backdrop for movement */}
      <div className="daily-drift absolute inset-0 opacity-70 pointer-events-none" aria-hidden />

      {/* Subtle radial gradient backdrop */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.08),transparent_60%)] pointer-events-none" />

      {/* Continuous sheen sweep — adds liveliness to the sealed card */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="envelope-sheen absolute top-0 -left-1/3 h-full w-1/2 bg-gradient-to-r from-transparent via-on-background/15 to-transparent" />
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center gap-5">
        <span className="text-[10px] uppercase tracking-[0.35em] text-outline">
          La Niche · {todayLabel()}
        </span>

        {/* Logo with subtle pulsing wax-seal feel */}
        <div className="seal-pulse w-20 h-20 rounded-full overflow-hidden bg-background border border-outline-variant flex items-center justify-center shadow-md">
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
 * shows family + notes brief + source link + wishlist add.
 *
 * Motion design:
 *   - Drift gradient backdrop (very subtle dotted pattern that pans 9s loop)
 *   - Reveal-pop staggered entry (70 ms cubic spring)
 *   - Active card breathes (translateY ±4 px) and glows softly
 *   - Inactive cards dim to opacity 0.55 + scale 0.92 for visual hierarchy
 *   - Auto-advance every 6 s, paused 12 s after a manual interaction
 *   - Pagination dots morph (active dot grows + extends, inactive shrinks)
 */
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
    <div className="reveal-fade-in relative">
      {/* Drifting dotted backdrop adds gentle motion behind the cards. */}
      <div
        className="daily-drift absolute inset-0 -z-0 pointer-events-none opacity-90"
        aria-hidden
      />

      <div
        ref={scrollRef}
        onScroll={onScroll}
        onPointerDown={noteUserInteraction}
        onWheel={noteUserInteraction}
        className="relative flex gap-4 overflow-x-auto hide-scrollbar -mx-6 px-6 py-3 snap-x snap-mandatory scroll-smooth"
        style={{ scrollPaddingLeft: "1.5rem" }}
      >
        {picks.map((p, i) => {
          const isActive = i === active;
          return (
            <div
              key={`${p.brand}-${p.name}-${i}`}
              className={clsx(
                "snap-start flex-shrink-0 min-w-[78%] sm:min-w-[280px] aspect-[3/4]",
                "transition-all duration-500 ease-out will-change-transform",
                isActive
                  ? "opacity-100 scale-100 daily-float"
                  : "opacity-55 scale-[0.92]",
              )}
            >
              <DailyFlashcard pick={p} index={i} active={isActive} />
            </div>
          );
        })}
      </div>

      {picks.length > 1 && (
        <div className="flex justify-center items-center gap-2 mt-4">
          {picks.map((_, i) => (
            <span
              key={i}
              className={clsx(
                "h-[3px] rounded-full transition-all duration-500 ease-out",
                i === active
                  ? "w-7 bg-primary dot-grow"
                  : "w-2 bg-outline-variant/60",
              )}
            />
          ))}
        </div>
      )}
      <p className="text-[10px] uppercase tracking-widest text-outline text-center mt-3 flex items-center justify-center gap-1.5">
        <Icon name="touch_app" size={11} className="text-outline" />
        Touche une carte pour la retourner
      </p>
    </div>
  );
}

function DailyFlashcard({
  pick,
  index,
  active,
}: {
  pick: SearchCandidate;
  index: number;
  active: boolean;
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
      imageUrl: null,
    });
  }

  return (
    <div
      className={clsx(
        "flashcard-surface w-full h-full reveal-pop",
        active && "daily-glow",
      )}
      style={{ animationDelay: `${index * 130}ms` }}
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
        imageUrl={pick.image_url}
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

/* ─── Contest banner ────────────────────────────────────────────────────── */

type ReferralMe = { rank: number | null; points: number };

function ContestBanner({ userId }: { userId: string | null }) {
  const [me, setMe] = useState<ReferralMe | null>(null);

  useEffect(() => {
    if (!userId) return;
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      fetch("/api/referral", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => {
          if (d) setMe({ rank: d.rank, points: d.points });
        })
        .catch(() => {});
    });
  }, [userId]);

  return (
    <Link href="/classement" className="block mb-8 group">
      <div className="relative overflow-hidden bg-primary text-on-primary px-5 py-4 flex items-center justify-between gap-4">
        {/* Animated shimmer */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="envelope-sheen absolute top-0 -left-1/3 h-full w-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>
        <div>
          <p className="text-[8px] uppercase tracking-[0.4em] opacity-70 mb-0.5">
            Concours lancement
          </p>
          <p className="text-xl font-black tracking-tight leading-none">
            Gagne 400€&nbsp;!
          </p>
          <p className="text-[9px] uppercase tracking-widest opacity-70 mt-1">
            Parraine tes amis · points &amp; classement
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {userId && me ? (
            <div className="text-right">
              <p className="text-[8px] uppercase tracking-widest opacity-70">
                Ton score
              </p>
              <p className="text-lg font-black leading-none">{me.points} pts</p>
              {me.rank && (
                <p className="text-[8px] opacity-60">#{me.rank}</p>
              )}
            </div>
          ) : (
            <p className="text-[9px] uppercase tracking-widest opacity-70 text-right max-w-[80px]">
              Voir le classement
            </p>
          )}
          <Icon
            name="chevron_right"
            size={20}
            className="opacity-60 group-hover:opacity-100 transition-opacity"
          />
        </div>
      </div>
    </Link>
  );
}

/* ─── Mini leaderboard ──────────────────────────────────────────────────── */

type LeaderboardRow = {
  user_id: string;
  display_name: string;
  points: number;
  rank: number;
};

function MiniLeaderboard({ userId }: { userId: string | null }) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from("leaderboard_view")
      .select("user_id, display_name, points, rank")
      .order("points", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        setRows((data as LeaderboardRow[]) ?? []);
        setLoaded(true);
      });
  }, []);

  if (loaded && rows.length === 0) return null;

  return (
    <div>
      <div className="flex justify-between items-end mb-4">
        <p className="text-[10px] uppercase tracking-[0.25em] font-bold">
          Classement parrainage
        </p>
        <Link
          href="/classement"
          className="text-[10px] uppercase tracking-widest font-bold border-b border-primary pb-0.5"
        >
          Voir tout
        </Link>
      </div>

      {!loaded ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="border border-outline-variant/40 divide-y divide-outline-variant/20">
          {rows.map((row, i) => {
            const isMe = row.user_id === userId;
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
            return (
              <div
                key={row.user_id}
                className={`flex items-center gap-3 px-4 py-2.5 ${isMe ? "bg-primary/5" : ""}`}
              >
                <div className="w-6 text-center shrink-0">
                  {medal ? (
                    <span className="text-sm">{medal}</span>
                  ) : (
                    <span className="text-[10px] font-mono text-outline">
                      #{row.rank}
                    </span>
                  )}
                </div>
                <p className={`flex-1 text-[11px] font-semibold uppercase tracking-widest truncate ${isMe ? "text-primary" : ""}`}>
                  {row.display_name}
                  {isMe && <span className="ml-1 text-[8px] opacity-50">(toi)</span>}
                </p>
                <p className="text-xs font-black shrink-0">{row.points} pts</p>
              </div>
            );
          })}
        </div>
      )}
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
      </div>
    </div>
  );
}
