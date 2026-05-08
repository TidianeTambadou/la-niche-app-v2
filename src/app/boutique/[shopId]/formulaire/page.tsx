"use client";

import { useEffect, useMemo, useState } from "react";
import { use } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { QuestionInput } from "@/components/QuestionInput";
import { PerfumeGlossary } from "@/components/PerfumeGlossary";
import {
  AddressAutocomplete,
  type ResolvedAddress,
} from "@/components/AddressAutocomplete";
import { useAuth, useRequireAuth } from "@/lib/auth";
import { authedFetch } from "@/lib/api-client";
import type { CommChannel, ShopQuestion } from "@/lib/types";
import { DataLabel } from "@/components/brutalist/DataLabel";
import { BrutalistButton } from "@/components/brutalist/BrutalistButton";

type TimeBudget = "express" | "classique" | "complet";

type WizardStep =
  | { kind: "time-budget" }
  | { kind: "intro" }
  | { kind: "question"; index: number }
  | { kind: "contact" }
  | { kind: "submitting" }
  | { kind: "done" };

const QUESTIONS_PER_BUDGET: Record<TimeBudget, number> = {
  express: 5,
  classique: 9,
  complet: Infinity,
};

/**
 * User-side equivalent of /pour-un-client. Differences :
 *   - No boutique role check (this page IS for non-boutique users).
 *   - shop_id taken from the URL ; questions fetched via the public endpoint.
 *   - Source = "user_account" ; submission flagged as such by the server.
 *   - No follow-up "voir le rapport" link — the user is told their profile
 *     was sent to the boutique, that's it.
 */
export default function UserFormPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = use(params);
  useRequireAuth();
  const router = useRouter();
  const { user } = useAuth();

  const [questions, setQuestions] = useState<ShopQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState<CommChannel>("email");
  const [consent, setConsent] = useState(false);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [timeBudget, setTimeBudget] = useState<TimeBudget>("classique");
  const [step, setStep] = useState<WizardStep>({ kind: "time-budget" });
  const [addressInput, setAddressInput] = useState("");
  const [resolvedAddress, setResolvedAddress] = useState<ResolvedAddress | null>(null);

  const wizardQuestions = useMemo(() => {
    const base = questions.filter((q) => q.kind !== "email" && q.kind !== "phone");
    const limit = QUESTIONS_PER_BUDGET[timeBudget];
    return Number.isFinite(limit) ? base.slice(0, limit) : base;
  }, [questions, timeBudget]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/shops/${shopId}/questions`);
        const json = (await res.json()) as { questions: ShopQuestion[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        setQuestions(json.questions);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      } finally {
        setLoading(false);
      }
    })();
  }, [shopId]);

  useEffect(() => {
    if (user?.email && !email) setEmail(user.email);
  }, [user, email]);

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
      setError("Le consentement marketing est requis.");
      return;
    }

    setStep({ kind: "submitting" });
    try {
      await authedFetch("/api/clients", {
        method: "POST",
        body: JSON.stringify({
          shopId,
          firstName,
          lastName,
          email: email || null,
          phone: phone || null,
          addressLine: resolvedAddress?.addressLine ?? null,
          postalCode: resolvedAddress?.postalCode ?? null,
          city: resolvedAddress?.city ?? null,
          latitude: resolvedAddress?.latitude ?? null,
          longitude: resolvedAddress?.longitude ?? null,
          preferredChannel: channel,
          consentMarketing: consent,
          answers,
        }),
      });
      setStep({ kind: "done" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setStep({ kind: "contact" });
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <DataLabel>LOADING…</DataLabel>
      </div>
    );
  }

  if (step.kind === "done") {
    return (
      <div className="px-6 py-10 flex flex-col gap-4 relative pl-6">
        <div className="absolute left-6 top-10 bottom-10 w-[2px] bg-on-background" />
        <DataLabel emphasis="high">SUCCESS · PROFILE_SENT</DataLabel>
        <h1 className="font-sans font-black text-4xl tracking-tighter uppercase leading-none">
          PROFIL
          <br />
          <span className="ml-4">ENVOYÉ</span>
        </h1>
        <p className="font-cormorant italic text-base opacity-70 max-w-sm">
          « La boutique a reçu ton profil olfactif. Elle te contactera lors de
          ses prochaines sélections. »
        </p>
        <BrutalistButton
          onClick={() => router.replace("/choix-boutique")}
          size="lg"
          className="self-start mt-4"
        >
          Retour
        </BrutalistButton>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 flex flex-col gap-6">
      <Progress step={step} total={wizardQuestions.length} />

      {step.kind === "time-budget" && (
        <TimeBudgetStep selected={timeBudget} onSelect={setTimeBudget} />
      )}

      {step.kind === "intro" && (
        <section className="flex flex-col gap-4">
          <header className="relative pl-6">
            <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
            <DataLabel>STEP:01 · IDENTITY</DataLabel>
            <h1 className="font-sans font-black text-3xl tracking-tighter uppercase leading-none mt-2">
              TON
              <br />
              <span className="ml-4">PROFIL</span>
            </h1>
            <p className="font-cormorant italic text-base opacity-70 mt-3">
              « Réponds à quelques questions, la boutique reçoit ton profil et
              t'envoie des suggestions calibrées. »
            </p>
          </header>
          <Field label="PRÉNOM">
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoFocus
              className={inputCls}
            />
          </Field>
          <Field label="NOM">
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} />
          </Field>
        </section>
      )}

      {step.kind === "question" && (
        <section className="flex flex-col gap-4">
          <PerfumeGlossary />
          <header className="relative pl-6">
            <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
            <DataLabel>
              QUESTION:{String(step.index + 1).padStart(2, "0")}/
              {String(wizardQuestions.length).padStart(2, "0")}
            </DataLabel>
            <h2 className="font-sans font-black text-2xl tracking-tighter leading-tight uppercase mt-2">
              {wizardQuestions[step.index].label}
              {wizardQuestions[step.index].required && (
                <span className="ml-1">*</span>
              )}
            </h2>
          </header>
          <QuestionInput
            q={wizardQuestions[step.index]}
            value={answerOf(wizardQuestions[step.index].id)}
            onChange={(v) => setAnswer(wizardQuestions[step.index].id, v)}
          />
        </section>
      )}

      {step.kind === "contact" && (
        <section className="flex flex-col gap-4">
          <header className="relative pl-6">
            <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
            <DataLabel>STEP:FINAL · CONTACT</DataLabel>
            <h2 className="font-sans font-black text-3xl tracking-tighter uppercase leading-none mt-2">
              CONTACT
            </h2>
          </header>
          <Field label="EMAIL">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </Field>
          <Field label="TÉLÉPHONE">
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </Field>
          <Field label="ADRESSE POSTALE (FACULTATIF)">
            <AddressAutocomplete
              value={addressInput}
              onChange={(v) => {
                setAddressInput(v);
                if (resolvedAddress && v !== resolvedAddress.label) {
                  setResolvedAddress(null);
                }
              }}
              onSelect={setResolvedAddress}
              className={inputCls}
            />
          </Field>
          <Field label="CANAL PRÉFÉRÉ">
            <div className="grid grid-cols-3 gap-2">
              {(["email", "sms", "both"] as CommChannel[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  className={`px-3 py-2.5 border-2 font-mono text-[11px] uppercase tracking-widest transition-colors duration-150 ${
                    channel === c
                      ? "border-on-background bg-on-background text-background font-bold"
                      : "border-on-background bg-background hover:bg-on-background/5"
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
              className="mt-1 w-4 h-4 accent-on-background"
            />
            <span>
              J'accepte de recevoir les sélections de la boutique par le canal
              choisi. Je peux me désabonner à tout moment.
            </span>
          </label>
        </section>
      )}

      {step.kind === "submitting" && (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3">
          <Icon name="progress_activity" size={48} className="animate-spin" />
          <DataLabel emphasis="high">SENDING…</DataLabel>
        </div>
      )}

      {error && (
        <div className="border-2 border-on-background bg-on-background text-background px-4 py-3">
          <p className="font-mono text-xs uppercase tracking-wider">{error}</p>
        </div>
      )}

      {step.kind !== "submitting" && (
        <footer className="flex gap-3 mt-2">
          {step.kind !== "time-budget" && (
            <button
              type="button"
              onClick={back}
              className="flex-1 py-3.5 border-2 border-on-background bg-background hover:bg-on-background hover:text-background text-sm font-bold uppercase tracking-widest transition-colors duration-150"
            >
              Retour
            </button>
          )}
          {step.kind === "contact" ? (
            <BrutalistButton onClick={submit} size="lg" className="flex-1">
              Envoyer
            </BrutalistButton>
          ) : (
            <BrutalistButton onClick={next} size="lg" className="flex-1">
              {step.kind === "time-budget" ? "C'est parti" : "Suivant"}
            </BrutalistButton>
          )}
        </footer>
      )}
    </div>
  );
}

const inputCls =
  "w-full px-4 py-3 bg-background border-2 border-on-background font-mono text-sm focus:outline-none focus:shadow-[4px_4px_0px_0px_currentColor] placeholder:opacity-40 transition-shadow";

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
    <div className="flex items-center gap-3">
      <DataLabel emphasis="high">{Math.round(pct).toString().padStart(2, "0")}%</DataLabel>
      <div className="h-[2px] flex-1 bg-on-background/10 relative">
        <div
          className="absolute inset-y-0 left-0 bg-on-background transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

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
      desc: "Réponses rapides. La boutique fera de son mieux mais devra deviner — risque qu'on te propose un parfum qui te va à 60 %.",
    },
    {
      key: "classique",
      minutes: "5-7 min",
      title: "Classique",
      desc: "Le bon compromis. La boutique cible bien tes goûts, peu de gaspillage. Recommandé.",
    },
    {
      key: "complet",
      minutes: "10 min",
      title: "Complet",
      desc: "Profil ultra-précis. La boutique trouve LE parfum, pas un compromis à 200 € qui finira dans un tiroir.",
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <header className="relative pl-6">
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
        <DataLabel>STEP:00 · TIME_BUDGET</DataLabel>
        <h1 className="font-sans font-black text-3xl tracking-tighter uppercase leading-none mt-2">
          COMBIEN
          <br />
          <span className="ml-4">DE TEMPS ?</span>
        </h1>
        <p className="font-cormorant italic text-base opacity-70 mt-3">
          « Plus tu prends de temps, mieux on cerne ton profil — moins de
          risque de repartir avec un parfum qui ne te correspond pas. »
        </p>
      </header>

      <ul className="flex flex-col gap-3">
        {choices.map((c) => {
          const active = selected === c.key;
          return (
            <li key={c.key}>
              <button
                type="button"
                onClick={() => onSelect(c.key)}
                className={`w-full text-left px-4 py-4 border-2 transition-all duration-150 ${
                  active
                    ? "border-on-background bg-on-background text-background shadow-[4px_4px_0px_0px_currentColor]"
                    : "border-on-background bg-background hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[4px_4px_0px_0px_currentColor]"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="font-sans font-black text-base tracking-tight uppercase">
                    {c.title}
                  </span>
                  <span className="font-mono text-xs uppercase tracking-widest opacity-70">
                    {c.minutes}
                  </span>
                </div>
                <p className="text-xs leading-relaxed opacity-80">{c.desc}</p>
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
      <DataLabel emphasis="high">{label}</DataLabel>
      {children}
    </label>
  );
}
