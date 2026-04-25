"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";
import { ErrorBubble } from "@/components/ErrorBubble";
import { useAuth } from "@/lib/auth";
import {
  readProfileFromUser,
  saveProfile,
  type OlfactiveProfile,
} from "@/lib/profile";
import {
  QUIZ_QUESTIONS,
  buildQuizContext,
  deriveLegacyProfile,
  type QuizAnswer,
} from "@/lib/quiz";

const TOTAL_STEPS = QUIZ_QUESTIONS.length;

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>({});

  // Hydrate from existing profile (when redoing).
  useEffect(() => {
    if (authLoading || !user) return;
    const existing = readProfileFromUser(user);
    if (existing?.quiz_answers) {
      setAnswers(existing.quiz_answers);
    }
  }, [authLoading, user]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?redirect=/onboarding");
    }
  }, [authLoading, user, router]);

  const q = QUIZ_QUESTIONS[step];
  const current = answers[q.id];
  const isLast = step === TOTAL_STEPS - 1;
  const canAdvance = q.multi
    ? Array.isArray(current) && current.length > 0
    : typeof current === "string" && current.length > 0;

  function pickSingle(value: string) {
    setAnswers((prev) => ({ ...prev, [q.id]: value }));
    if (!isLast) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }

  function toggleMulti(value: string) {
    setAnswers((prev) => {
      const arr = Array.isArray(prev[q.id]) ? (prev[q.id] as string[]) : [];
      const next = arr.includes(value)
        ? arr.filter((v) => v !== value)
        : [...arr, value];
      return { ...prev, [q.id]: next };
    });
  }

  async function next() {
    if (!canAdvance) return;
    if (!isLast) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const legacy = deriveLegacyProfile(answers);
      const profile: OlfactiveProfile = {
        ...legacy,
        quiz_answers: answers,
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
    if (step > 0) {
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

  if (!user) return null;

  const stepNumber = step + 1;

  return (
    <main className="min-h-[100dvh] flex flex-col max-w-screen-md mx-auto px-6 pt-10 pb-32 safe-top">
      <header className="mb-10">
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/"
            className="text-xl font-semibold tracking-[0.2em] uppercase"
          >
            LA NICHE
          </Link>
          <span className="text-[10px] font-mono text-outline uppercase">
            Univers olfactif
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] uppercase tracking-[0.3em] font-semibold">
            Étape {String(stepNumber).padStart(2, "0")}
          </span>
          <div className="h-px flex-1 bg-outline-variant relative">
            <div
              className="absolute inset-y-0 left-0 bg-primary transition-all duration-300"
              style={{ width: `${(stepNumber / TOTAL_STEPS) * 100}%` }}
            />
          </div>
          <span className="text-[10px] uppercase tracking-[0.3em] text-outline">
            {String(TOTAL_STEPS).padStart(2, "0")}
          </span>
        </div>
      </header>

      <section className="flex-1">
        <p className="text-[10px] uppercase tracking-[0.2em] text-outline mb-3">
          {q.multi ? "Choix multiples" : "Choix unique"}
          {q.subtitle?.self ? ` · ${q.subtitle.self}` : ""}
        </p>
        <h1 className="text-3xl md:text-4xl font-medium tracking-tighter leading-[1.05] mb-6">
          {q.question.self}
        </h1>

        <div className="flex flex-col gap-2">
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

        {isLast && (
          <div className="border border-outline-variant p-5 mt-8">
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold mb-3">
              Synthèse de ton univers
            </p>
            <pre className="text-[11px] text-on-surface-variant whitespace-pre-wrap font-sans leading-relaxed">
              {buildQuizContext(answers, "self") || "—"}
            </pre>
          </div>
        )}

        {error && (
          <div className="mt-4">
            <ErrorBubble
              detail={error}
              context="Onboarding · enregistrement"
              variant="block"
            />
          </div>
        )}
      </section>

      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-xl border-t border-outline-variant/40 z-10">
        <div className="max-w-screen-md mx-auto px-6 py-4 safe-bottom flex items-center gap-3">
          <button
            type="button"
            onClick={prev}
            disabled={step === 0 || submitting}
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
                ? "Enregistrer mon univers"
                : q.multi
                  ? "Continuer"
                  : "Suivant"}
          </button>
        </div>
      </div>
    </main>
  );
}
