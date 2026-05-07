"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { QuestionInput } from "@/components/QuestionInput";
import { ClientReport } from "@/components/ClientReport";
import { useRequireAuth } from "@/lib/auth";
import { useShopRole } from "@/lib/role";
import { authedFetch } from "@/lib/api-client";
import type { CommChannel, ShopQuestion } from "@/lib/types";

type TimeBudget = "express" | "classique" | "complet";

type WizardStep =
  | { kind: "time-budget" }
  | { kind: "intro" }
  | { kind: "question"; index: number }
  | { kind: "contact" }
  | { kind: "submitting" }
  | {
      kind: "done";
      clientId: string;
      olfactiveProfile: unknown;
      report: unknown;
    };

/** How many olfactive questions each time bucket allows. Email/phone are
 *  always asked separately in the contact step. */
const QUESTIONS_PER_BUDGET: Record<TimeBudget, number> = {
  express: 5,
  classique: 9,
  complet: Infinity,
};

export default function PourUnClientPage() {
  useRequireAuth();
  const router = useRouter();
  const { isBoutique, loading: roleLoading } = useShopRole();
  const [questions, setQuestions] = useState<ShopQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState<CommChannel>("email");
  const [consent, setConsent] = useState(false);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [timeBudget, setTimeBudget] = useState<TimeBudget>("classique");
  const [step, setStep] = useState<WizardStep>({ kind: "time-budget" });

  // Email/phone live in the contact step regardless of where the boutique
  // placed them in the question order. The remaining olfactive questions are
  // capped by the chosen time budget — express clients answer fewer.
  const wizardQuestions = useMemo(() => {
    const base = questions.filter((q) => q.kind !== "email" && q.kind !== "phone");
    const limit = QUESTIONS_PER_BUDGET[timeBudget];
    return Number.isFinite(limit) ? base.slice(0, limit) : base;
  }, [questions, timeBudget]);

  useEffect(() => {
    if (!roleLoading && !isBoutique) router.replace("/");
  }, [isBoutique, roleLoading, router]);

  useEffect(() => {
    if (!isBoutique) return;
    (async () => {
      try {
        const json = await authedFetch<{ questions: ShopQuestion[] }>(
          "/api/shops/me/questions",
        );
        setQuestions(json.questions);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      } finally {
        setLoading(false);
      }
    })();
  }, [isBoutique]);

  function answerOf(id: string) {
    return answers[id] as string | string[] | number | undefined;
  }
  function setAnswer(id: string, v: unknown) {
    setAnswers((a) => ({ ...a, [id]: v }));
  }

  function next() {
    if (step.kind === "time-budget") {
      setError(null);
      setStep({ kind: "intro" });
      return;
    }
    if (step.kind === "intro") {
      if (!firstName.trim() || !lastName.trim()) {
        setError("Prénom et nom requis.");
        return;
      }
      setError(null);
      setStep(wizardQuestions.length > 0 ? { kind: "question", index: 0 } : { kind: "contact" });
      return;
    }
    if (step.kind === "question") {
      const q = wizardQuestions[step.index];
      if (q.required) {
        const v = answerOf(q.id);
        if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) {
          setError("Cette question est obligatoire.");
          return;
        }
      }
      setError(null);
      setStep(
        step.index + 1 < wizardQuestions.length
          ? { kind: "question", index: step.index + 1 }
          : { kind: "contact" },
      );
      return;
    }
  }

  function back() {
    if (step.kind === "intro") {
      setStep({ kind: "time-budget" });
    } else if (step.kind === "question") {
      if (step.index === 0) setStep({ kind: "intro" });
      else setStep({ kind: "question", index: step.index - 1 });
    } else if (step.kind === "contact") {
      setStep(
        wizardQuestions.length > 0
          ? { kind: "question", index: wizardQuestions.length - 1 }
          : { kind: "intro" },
      );
    }
  }

  async function submit() {
    setError(null);
    if (!email && !phone) {
      setError("Email ou téléphone requis.");
      return;
    }
    if ((channel === "email" || channel === "both") && !email) {
      setError("Email requis pour ce canal.");
      return;
    }
    if ((channel === "sms" || channel === "both") && !phone) {
      setError("Téléphone requis pour ce canal.");
      return;
    }
    if (!consent) {
      setError("Le consentement marketing est requis pour la newsletter.");
      return;
    }

    setStep({ kind: "submitting" });
    try {
      const json = await authedFetch<{
        id: string;
        olfactive_profile: unknown;
        report: unknown;
      }>("/api/clients", {
        method: "POST",
        body: JSON.stringify({
          firstName,
          lastName,
          email: email || null,
          phone: phone || null,
          preferredChannel: channel,
          consentMarketing: consent,
          answers,
        }),
      });
      setStep({
        kind: "done",
        clientId: json.id,
        olfactiveProfile: json.olfactive_profile,
        report: json.report,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setStep({ kind: "contact" });
    }
  }

  if (loading || roleLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Icon name="progress_activity" />
      </div>
    );
  }

  if (step.kind === "done") {
    return (
      <div className="px-6 py-6 flex flex-col gap-6">
        <header className="flex flex-col items-center text-center gap-2 pt-2">
          <Icon name="check_circle" size={48} className="text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">
            Rapport olfactif — {firstName} {lastName}
          </h1>
          <p className="text-xs uppercase tracking-widest text-outline">
            Synthèse IA · fiche enregistrée
          </p>
        </header>

        <ClientReport
          profile={step.olfactiveProfile as never}
          report={step.report as never}
        />

        <div className="flex flex-col gap-2 mt-2">
          <Link
            href={`/clients/${step.clientId}`}
            className="w-full py-3 border border-outline-variant rounded-full text-sm font-medium uppercase tracking-widest text-center"
          >
            Ouvrir la fiche complète
          </Link>
          <button
            type="button"
            onClick={() => {
              setFirstName("");
              setLastName("");
              setEmail("");
              setPhone("");
              setConsent(false);
              setAnswers({});
              setStep({ kind: "intro" });
            }}
            className="w-full py-3 bg-primary text-on-primary rounded-full text-sm font-bold uppercase tracking-widest"
          >
            Nouveau client
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 flex flex-col gap-6">
      <Progress step={step} total={wizardQuestions.length} />

      {step.kind === "time-budget" && (
        <TimeBudgetStep
          selected={timeBudget}
          onSelect={setTimeBudget}
        />
      )}

      {step.kind === "intro" && (
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Pour un client</h1>
          <p className="text-sm text-on-surface-variant">
            Renseigne le prénom et le nom du client. Tu pourras retrouver sa
            fiche dans « Mes clients ».
          </p>
          <Field label="Prénom">
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoFocus
              className="w-full px-4 py-3 bg-surface-container rounded-2xl border border-outline-variant text-sm"
            />
          </Field>
          <Field label="Nom">
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full px-4 py-3 bg-surface-container rounded-2xl border border-outline-variant text-sm"
            />
          </Field>
        </section>
      )}

      {step.kind === "question" && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold tracking-tight leading-tight">
            {wizardQuestions[step.index].label}
            {wizardQuestions[step.index].required && (
              <span className="text-error ml-1">*</span>
            )}
          </h2>
          <QuestionInput
            q={wizardQuestions[step.index]}
            value={answerOf(wizardQuestions[step.index].id)}
            onChange={(v) => setAnswer(wizardQuestions[step.index].id, v)}
          />
        </section>
      )}

      {step.kind === "contact" && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold tracking-tight">
            Comment recevoir la newsletter ?
          </h2>
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-surface-container rounded-2xl border border-outline-variant text-sm"
            />
          </Field>
          <Field label="Téléphone">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 bg-surface-container rounded-2xl border border-outline-variant text-sm"
            />
          </Field>
          <Field label="Canal préféré">
            <div className="grid grid-cols-3 gap-2">
              {(["email", "sms", "both"] as CommChannel[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  className={`px-3 py-2 border rounded-full text-xs uppercase tracking-widest ${
                    channel === c
                      ? "border-primary bg-primary-container/50 font-semibold"
                      : "border-outline-variant"
                  }`}
                >
                  {c === "both" ? "Les deux" : c.toUpperCase()}
                </button>
              ))}
            </div>
          </Field>
          <label className="flex items-start gap-2 text-sm leading-snug">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Le client accepte de recevoir la newsletter par le canal choisi et
              comprend qu'il pourra se désabonner à tout moment.
            </span>
          </label>
        </section>
      )}

      {step.kind === "submitting" && (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3">
          <Icon name="progress_activity" size={48} className="text-primary animate-spin" />
          <p className="text-sm text-on-surface-variant">Génération du profil olfactif…</p>
        </div>
      )}

      {error && (
        <p className="text-sm text-error border border-error/30 bg-error-container/30 px-4 py-3 rounded-xl">
          {error}
        </p>
      )}

      {step.kind !== "submitting" && (
        <footer className="flex gap-3 mt-2">
          {step.kind !== "time-budget" && (
            <button
              type="button"
              onClick={back}
              className="flex-1 py-3 border border-outline-variant rounded-full text-sm font-medium uppercase tracking-widest"
            >
              Retour
            </button>
          )}
          {step.kind === "contact" ? (
            <button
              type="button"
              onClick={submit}
              className="flex-1 py-3 bg-primary text-on-primary rounded-full text-sm font-bold uppercase tracking-widest"
            >
              Enregistrer
            </button>
          ) : (
            <button
              type="button"
              onClick={next}
              className="flex-1 py-3 bg-primary text-on-primary rounded-full text-sm font-bold uppercase tracking-widest"
            >
              {step.kind === "time-budget" ? "C'est parti" : "Suivant"}
            </button>
          )}
        </footer>
      )}
    </div>
  );
}

function Progress({ step, total }: { step: WizardStep; total: number }) {
  if (step.kind === "submitting" || step.kind === "done") return null;
  const done =
    step.kind === "time-budget"
      ? 0
      : step.kind === "intro"
        ? 1
        : step.kind === "question"
          ? step.index + 2
          : total + 2;
  const pct = total > 0 ? Math.min(100, (done / (total + 2)) * 100) : 0;
  return (
    <div className="h-1 bg-outline-variant/30 rounded-full overflow-hidden">
      <div
        className="h-full bg-primary transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * Pre-flight step that asks the client how much time they're willing to
 * spend. Express skips the optional questions ; complet asks everything.
 *
 * Tone is pointedly direct — the longer the questionnaire, the better the
 * vendor can pin down the right perfume, and the less the client risks
 * walking out with a 200 € bottle they'll never wear.
 */
function TimeBudgetStep({
  selected,
  onSelect,
}: {
  selected: TimeBudget;
  onSelect: (b: TimeBudget) => void;
}) {
  const choices: {
    key: TimeBudget;
    minutes: string;
    title: string;
    desc: string;
  }[] = [
    {
      key: "express",
      minutes: "3 min",
      title: "Express",
      desc: "Réponses rapides. Le vendeur fera de son mieux mais devra deviner — risque qu'on te propose un parfum qui te va à 60 %.",
    },
    {
      key: "classique",
      minutes: "5-7 min",
      title: "Classique",
      desc: "Le bon compromis. Le vendeur cible bien tes goûts, peu de gaspillage. Recommandé.",
    },
    {
      key: "complet",
      minutes: "10 min",
      title: "Complet",
      desc: "Profil ultra-précis. Le vendeur trouve LE parfum, pas un compromis à 200 € qui finira dans un tiroir.",
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Combien de temps avez-vous ?
        </h1>
        <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
          Plus vous prenez de temps, mieux le vendeur cerne votre profil olfactif —
          et moins vous risquez de repartir avec un parfum qui ne vous correspond pas.
        </p>
      </header>

      <ul className="flex flex-col gap-2">
        {choices.map((c) => {
          const active = selected === c.key;
          return (
            <li key={c.key}>
              <button
                type="button"
                onClick={() => onSelect(c.key)}
                className={`w-full text-left px-4 py-4 border rounded-2xl transition-all ${
                  active
                    ? "border-primary bg-primary-container/40"
                    : "border-outline-variant hover:border-on-surface-variant"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-base font-semibold tracking-tight">
                    {c.title}
                  </span>
                  <span className="text-xs uppercase tracking-widest text-outline">
                    {c.minutes}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  {c.desc}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-widest text-outline">{label}</span>
      {children}
    </label>
  );
}
