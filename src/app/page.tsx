"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { ErrorBubble } from "@/components/ErrorBubble";
import { NewsRail } from "@/components/NewsRail";
import { latestNews } from "@/lib/news";
import { useAuth } from "@/lib/auth";
import { readProfileFromUser, FAMILY_VULGAR } from "@/lib/profile";
import { useDailyPicks } from "@/lib/daily-picks";
import type { SearchCandidate } from "@/lib/agent";

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
        <DailyCarousel state={dailyPicks} hasProfile={!!profile} />
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

/* ─── Daily picks carousel ──────────────────────────────────────────────── */

function DailyCarousel({
  state,
  hasProfile,
}: {
  state: ReturnType<typeof useDailyPicks>;
  hasProfile: boolean;
}) {
  if (state.status === "loading") {
    return (
      <div className="flex gap-4 overflow-hidden -mx-6 px-6">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="min-w-[78%] sm:min-w-[260px] aspect-[3/4] shimmer-bar flex-shrink-0"
          />
        ))}
      </div>
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

  return <AutoScrollCarousel picks={state.picks} />;
}

function AutoScrollCarousel({ picks }: { picks: SearchCandidate[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const userInteracted = useRef(false);

  // Auto-advance every 5s, respecting manual swipes (paused for 8s after a
  // user touch / scroll). Only kicks in when there are 2+ picks.
  useEffect(() => {
    if (picks.length < 2) return;
    const id = window.setInterval(() => {
      if (userInteracted.current) return;
      const el = scrollRef.current;
      if (!el) return;
      const next = (active + 1) % picks.length;
      const card = el.children[next] as HTMLElement | undefined;
      if (card) {
        el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: "smooth" });
        setActive(next);
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [picks.length, active]);

  function noteUserInteraction() {
    userInteracted.current = true;
    window.setTimeout(() => {
      userInteracted.current = false;
    }, 8000);
  }

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    // Snap to whichever card is closest to the left edge.
    const children = Array.from(el.children) as HTMLElement[];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < children.length; i++) {
      const dist = Math.abs(children[i].offsetLeft - el.scrollLeft - el.offsetLeft);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    if (bestIdx !== active) setActive(bestIdx);
  }

  return (
    <div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onPointerDown={noteUserInteraction}
        onWheel={noteUserInteraction}
        className="flex gap-4 overflow-x-auto hide-scrollbar -mx-6 px-6 pb-2 snap-x snap-mandatory scroll-smooth"
        style={{ scrollPaddingLeft: "1.5rem" }}
      >
        {picks.map((p, i) => (
          <DailyCard key={`${p.brand}-${p.name}-${i}`} pick={p} />
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
    </div>
  );
}

function DailyCard({ pick }: { pick: SearchCandidate }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = pick.image_url && !imgFailed;
  return (
    <a
      href={pick.source_url}
      target="_blank"
      rel="noopener noreferrer"
      className="snap-start flex-shrink-0 min-w-[78%] sm:min-w-[260px] aspect-[3/4] relative overflow-hidden border border-outline-variant bg-surface-container-low active:scale-[0.99] transition-transform"
    >
      {showImage ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={pick.image_url!}
          alt={pick.name}
          className="absolute inset-0 w-full h-full object-cover grayscale-[0.15]"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon name="local_florist" size={42} className="text-outline" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-on-background/85 via-on-background/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4 text-background">
        <p className="text-[10px] uppercase tracking-[0.25em] opacity-80">
          {pick.brand}
          {pick.family ? ` · ${pick.family}` : ""}
        </p>
        <p className="text-lg font-semibold tracking-tight leading-tight mt-0.5">
          {pick.name}
        </p>
        {pick.notes_brief && (
          <p className="text-[11px] opacity-80 mt-1.5 leading-snug line-clamp-2">
            {pick.notes_brief}
          </p>
        )}
      </div>
      <div className="absolute top-2 right-2 bg-background/90 px-2 py-1 text-[9px] uppercase tracking-widest font-mono">
        Du jour
      </div>
    </a>
  );
}
