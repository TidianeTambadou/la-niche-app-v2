"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/lib/auth";
import {
  BUDGET_VULGAR,
  FAMILY_VULGAR,
  INTENSITY_VULGAR,
  MOMENT_VULGAR,
  OCCASION_VULGAR,
  readProfileFromUser,
  saveProfile,
  type Budget,
  type IntensityPref,
  type Moment,
  type Occasion,
  type OlfactiveProfile,
} from "@/lib/profile";
import type { ScentFamily } from "@/lib/fragrances";

const TOTAL_STEPS = 5;

type Draft = {
  preferred_families: ScentFamily[];
  intensity_preference: IntensityPref | null;
  moments: Moment[];
  occasions: Occasion[];
  budget: Budget | null;
};

const FAMILY_KEYS: ScentFamily[] = [
  "Woody",
  "Floral",
  "Citrus",
  "Amber",
  "Fresh",
  "Spicy",
  "Smoky",
];

const INTENSITY_KEYS: IntensityPref[] = ["subtle", "moderate", "projective"];
const MOMENT_KEYS: Moment[] = ["morning", "day", "evening", "night"];
const OCCASION_KEYS: Occasion[] = [
  "work",
  "date",
  "going_out",
  "sport",
  "casual",
];
const BUDGET_KEYS: Budget[] = ["u100", "100_200", "o200", "any"];

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft>({
    preferred_families: [],
    intensity_preference: null,
    moments: [],
    occasions: [],
    budget: null,
  });

  // Hydrate draft from existing profile (when redoing) on first auth resolve.
  useEffect(() => {
    if (authLoading || !user) return;
    const existing = readProfileFromUser(user);
    if (existing) {
      setDraft({
        preferred_families: existing.preferred_families,
        intensity_preference: existing.intensity_preference,
        moments: existing.moments,
        occasions: existing.occasions,
        budget: existing.budget,
      });
    }
  }, [authLoading, user]);

  // Auth required
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?redirect=/onboarding");
    }
  }, [authLoading, user, router]);

  const canAdvance = isStepComplete(step, draft);
  const isLast = step === TOTAL_STEPS;

  function toggleInArray<T>(value: T, arr: T[]): T[] {
    return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
  }

  async function next() {
    if (!canAdvance) return;
    if (!isLast) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    if (!draft.intensity_preference || !draft.budget) return;
    setSubmitting(true);
    setError(null);
    try {
      const profile: OlfactiveProfile = {
        preferred_families: draft.preferred_families,
        intensity_preference: draft.intensity_preference,
        moments: draft.moments,
        occasions: draft.occasions,
        budget: draft.budget,
        completed_at: new Date().toISOString(),
      };
      await saveProfile(profile);
      router.push("/profile");
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Erreur lors de l'enregistrement.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function prev() {
    if (step > 1) {
      setStep(step - 1);
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }

  if (authLoading) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center">
        <p className="text-[10px] uppercase tracking-widest text-outline">
          Chargement…
        </p>
      </main>
    );
  }

  if (!user) return null; // redirect in flight

  return (
    <main className="min-h-[100dvh] flex flex-col max-w-screen-md mx-auto px-6 pt-10 pb-32 safe-top">
      {/* Top brand + step indicator */}
      <header className="mb-10">
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/"
            className="text-xl font-semibold tracking-[0.2em] uppercase"
          >
            LA NICHE
          </Link>
          <span className="text-[10px] font-mono text-outline uppercase">
            ADN olfactif
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] uppercase tracking-[0.3em] font-semibold">
            Étape {String(step).padStart(2, "0")}
          </span>
          <div className="h-px flex-1 bg-outline-variant relative">
            <div
              className="absolute inset-y-0 left-0 bg-primary transition-all duration-300"
              style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            />
          </div>
          <span className="text-[10px] uppercase tracking-[0.3em] text-outline">
            {String(TOTAL_STEPS).padStart(2, "0")}
          </span>
        </div>
      </header>

      {/* Step content */}
      <section className="flex-1">
        {step === 1 && (
          <Step
            kind="multi"
            title={
              <>
                Quel <span className="italic font-serif">univers</span>
                <br />
                te touche ?
              </>
            }
            hint="Choisis ce qui t'évoque quelque chose. Plusieurs réponses possibles."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-outline-variant/40">
              {FAMILY_KEYS.map((f) => {
                const v = FAMILY_VULGAR[f];
                const selected = draft.preferred_families.includes(f);
                return (
                  <BigCard
                    key={f}
                    selected={selected}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        preferred_families: toggleInArray(
                          f,
                          draft.preferred_families,
                        ),
                      })
                    }
                  >
                    <p className="text-3xl mb-2">{v.emoji}</p>
                    <p className="text-base font-semibold tracking-tight">
                      {v.title}
                    </p>
                    <p
                      className={clsx(
                        "text-[10px] uppercase tracking-widest mt-1",
                        selected ? "text-on-primary/70" : "text-outline",
                      )}
                    >
                      {v.subtitle}
                    </p>
                  </BigCard>
                );
              })}
            </div>
          </Step>
        )}

        {step === 2 && (
          <Step
            kind="single"
            title={
              <>
                Quel <span className="italic font-serif">sillage</span>
                <br />
                tu veux laisser ?
              </>
            }
            hint="Un seul choix."
          >
            <div className="grid grid-cols-1 gap-px bg-outline-variant/40">
              {INTENSITY_KEYS.map((i) => {
                const v = INTENSITY_VULGAR[i];
                const selected = draft.intensity_preference === i;
                return (
                  <BigCard
                    key={i}
                    selected={selected}
                    onClick={() =>
                      setDraft({ ...draft, intensity_preference: i })
                    }
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-3xl">{v.emoji}</span>
                      <div className="flex-1">
                        <p className="text-base font-semibold tracking-tight">
                          {v.title}
                        </p>
                        <p
                          className={clsx(
                            "text-[10px] uppercase tracking-widest mt-1",
                            selected ? "text-on-primary/70" : "text-outline",
                          )}
                        >
                          {v.subtitle}
                        </p>
                      </div>
                    </div>
                  </BigCard>
                );
              })}
            </div>
          </Step>
        )}

        {step === 3 && (
          <Step
            kind="multi"
            title={
              <>
                À quels <span className="italic font-serif">moments</span>
                <br />
                tu portes ?
              </>
            }
            hint="Plusieurs réponses possibles."
          >
            <div className="grid grid-cols-2 gap-px bg-outline-variant/40">
              {MOMENT_KEYS.map((m) => {
                const v = MOMENT_VULGAR[m];
                const selected = draft.moments.includes(m);
                return (
                  <BigCard
                    key={m}
                    selected={selected}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        moments: toggleInArray(m, draft.moments),
                      })
                    }
                  >
                    <p className="text-3xl mb-2">{v.emoji}</p>
                    <p className="text-base font-semibold tracking-tight">
                      {v.title}
                    </p>
                  </BigCard>
                );
              })}
            </div>
          </Step>
        )}

        {step === 4 && (
          <Step
            kind="multi"
            title={
              <>
                Pour quelles
                <br />
                <span className="italic font-serif">occasions</span> ?
              </>
            }
            hint="Plusieurs réponses possibles."
          >
            <div className="grid grid-cols-2 gap-px bg-outline-variant/40">
              {OCCASION_KEYS.map((o) => {
                const v = OCCASION_VULGAR[o];
                const selected = draft.occasions.includes(o);
                return (
                  <BigCard
                    key={o}
                    selected={selected}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        occasions: toggleInArray(o, draft.occasions),
                      })
                    }
                  >
                    <p className="text-3xl mb-2">{v.emoji}</p>
                    <p className="text-base font-semibold tracking-tight">
                      {v.title}
                    </p>
                  </BigCard>
                );
              })}
            </div>
          </Step>
        )}

        {step === 5 && (
          <Step
            kind="single"
            title={
              <>
                Ton <span className="italic font-serif">budget</span>
                <br />
                par flacon ?
              </>
            }
            hint="Un seul choix."
          >
            <div className="grid grid-cols-2 gap-px bg-outline-variant/40 mb-10">
              {BUDGET_KEYS.map((b) => {
                const v = BUDGET_VULGAR[b];
                const selected = draft.budget === b;
                return (
                  <BigCard
                    key={b}
                    selected={selected}
                    onClick={() => setDraft({ ...draft, budget: b })}
                  >
                    <p className="text-2xl font-bold tracking-tight font-mono mb-1">
                      {v.title}
                    </p>
                    <p
                      className={clsx(
                        "text-[10px] uppercase tracking-widest",
                        selected ? "text-on-primary/70" : "text-outline",
                      )}
                    >
                      {v.subtitle}
                    </p>
                  </BigCard>
                );
              })}
            </div>

            {/* Recap */}
            <div className="border border-outline-variant p-5 mb-4">
              <p className="text-[10px] uppercase tracking-[0.2em] font-bold mb-3">
                Synthèse de ton ADN
              </p>
              <RecapRow
                label="Univers"
                value={
                  draft.preferred_families.length > 0
                    ? draft.preferred_families
                        .map((f) => FAMILY_VULGAR[f].title)
                        .join(", ")
                    : "—"
                }
              />
              <RecapRow
                label="Sillage"
                value={
                  draft.intensity_preference
                    ? INTENSITY_VULGAR[draft.intensity_preference].title
                    : "—"
                }
              />
              <RecapRow
                label="Moments"
                value={
                  draft.moments.length > 0
                    ? draft.moments.map((m) => MOMENT_VULGAR[m].title).join(", ")
                    : "—"
                }
              />
              <RecapRow
                label="Occasions"
                value={
                  draft.occasions.length > 0
                    ? draft.occasions
                        .map((o) => OCCASION_VULGAR[o].title)
                        .join(", ")
                    : "—"
                }
              />
              <RecapRow
                label="Budget"
                value={
                  draft.budget ? BUDGET_VULGAR[draft.budget].title : "—"
                }
                last
              />
            </div>
          </Step>
        )}

        {error && (
          <div className="border border-error/50 bg-error-container/20 px-4 py-3 mt-4">
            <p className="text-xs text-error">{error}</p>
          </div>
        )}
      </section>

      {/* Sticky bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-xl border-t border-outline-variant/40 z-10">
        <div className="max-w-screen-md mx-auto px-6 py-4 safe-bottom flex items-center gap-3">
          <button
            type="button"
            onClick={prev}
            disabled={step === 1 || submitting}
            className="px-5 py-3 border border-outline-variant rounded-full text-[10px] uppercase tracking-widest font-bold hover:border-primary disabled:opacity-30 transition-all"
          >
            <Icon name="arrow_back" size={14} />
          </button>
          <button
            type="button"
            onClick={next}
            disabled={!canAdvance || submitting}
            className="flex-1 py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.3em] font-bold active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <Icon name="progress_activity" size={16} />
            ) : (
              <Icon name={isLast ? "check" : "arrow_forward"} size={16} />
            )}
            {submitting
              ? "…"
              : isLast
                ? "Enregistrer mon ADN"
                : "Suivant"}
          </button>
        </div>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------
 * Sub-components
 * --------------------------------------------------------------------- */

function Step({
  kind,
  title,
  hint,
  children,
}: {
  kind: "multi" | "single";
  title: React.ReactNode;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="text-4xl md:text-5xl font-extralight tracking-tighter leading-[1.05] mb-3">
        {title}
      </h1>
      <p className="text-[10px] uppercase tracking-[0.2em] text-outline mb-6">
        {kind === "multi" ? "Choix multiples" : "Choix unique"} · {hint}
      </p>
      {children}
    </div>
  );
}

function BigCard({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "p-5 text-left transition-all duration-300 relative",
        selected
          ? "bg-primary text-on-primary"
          : "bg-background hover:bg-surface-container-low",
      )}
      aria-pressed={selected}
    >
      {children}
      {selected && (
        <Icon
          name="check_circle"
          filled
          size={16}
          className="absolute top-3 right-3"
        />
      )}
    </button>
  );
}

function RecapRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={clsx(
        "flex items-start justify-between gap-3 py-2",
        !last && "border-b border-outline-variant/30",
      )}
    >
      <span className="text-[10px] uppercase tracking-widest text-outline shrink-0">
        {label}
      </span>
      <span className="text-xs text-on-background text-right">{value}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Validation: each step requires at least one selection.
 * --------------------------------------------------------------------- */

function isStepComplete(step: number, draft: Draft): boolean {
  switch (step) {
    case 1:
      return draft.preferred_families.length > 0;
    case 2:
      return draft.intensity_preference !== null;
    case 3:
      return draft.moments.length > 0;
    case 4:
      return draft.occasions.length > 0;
    case 5:
      return (
        draft.budget !== null &&
        draft.preferred_families.length > 0 &&
        draft.intensity_preference !== null &&
        draft.moments.length > 0 &&
        draft.occasions.length > 0
      );
    default:
      return false;
  }
}
