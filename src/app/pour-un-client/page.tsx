"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { QuestionInput } from "@/components/QuestionInput";
import { ClientReport } from "@/components/ClientReport";
import { ExistingClientSuggestions } from "@/components/ExistingClientSuggestions";
import { PerfumeGlossary } from "@/components/PerfumeGlossary";
import {
  AddressAutocomplete,
  type ResolvedAddress,
} from "@/components/AddressAutocomplete";
import { useRequireAuth } from "@/lib/auth";
import { useShopRole } from "@/lib/role";
import { authedFetch } from "@/lib/api-client";
import { DataLabel } from "@/components/brutalist/DataLabel";
import { BrutalistButton } from "@/components/brutalist/BrutalistButton";
import { BrutalistCard } from "@/components/brutalist/BrutalistCard";
import type { BoutiqueClient, CommChannel, ShopQuestion } from "@/lib/types";

type TimeBudget = "express" | "classique" | "complet";

type WizardStep =
  | { kind: "time-budget" }
  | { kind: "intro" }
  | { kind: "welcome-back"; client: BoutiqueClient }
  | { kind: "question"; index: number }
  | { kind: "contact" }
  | { kind: "submitting" }
  | {
      kind: "done";
      clientId: string;
      olfactiveProfile: unknown;
      report: unknown;
      llmError: string | null;
      /** True quand la fiche a été chargée depuis l'auto-complétion sur le
       *  nom (returning client) plutôt que créée à l'instant. Pilote le
       *  texte des CTAs et permet d'afficher un bouton « Refaire ». */
      fromExisting: boolean;
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
  const [addressInput, setAddressInput] = useState("");
  const [resolvedAddress, setResolvedAddress] = useState<ResolvedAddress | null>(null);
  /** Quand true, on n'affiche plus les suggestions de fiches existantes —
   *  utile quand la recherche prend trop de temps ou que la boutique veut
   *  juste créer rapidement. */
  const [anonymous, setAnonymous] = useState(false);

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

  /**
   * Quand le boutiquier tape sur une fiche existante dans l'auto-complétion
   * du step intro, on charge la fiche puis on AFFICHE UN ÉCRAN
   * « heureux de te revoir » avec deux choix :
   *   - Encore pour [Prénom] (mode reuse) → saute au rapport existant
   *   - C'est un cadeau               → repart de zéro (fresh)
   */
  async function loadExistingClient(clientId: string) {
    setError(null);
    try {
      const json = await authedFetch<{ client: BoutiqueClient }>(
        `/api/clients/${clientId}`,
      );
      setStep({ kind: "welcome-back", client: json.client });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  /**
   * Branche « encore pour la même personne » du welcome-back : on charge
   * tous les champs depuis la fiche existante et on saute au rapport déjà
   * généré.
   */
  function reuseExistingClient(c: BoutiqueClient) {
    setFirstName(c.first_name);
    setLastName(c.last_name);
    setEmail(c.email ?? "");
    setPhone(c.phone ?? "");
    setChannel(c.preferred_channel);
    setConsent(c.consent_marketing);
    setAnswers(c.quiz_answers ?? {});
    if (c.address_line && c.postal_code && c.city) {
      const label = `${c.address_line} ${c.postal_code} ${c.city}`;
      setAddressInput(label);
      setResolvedAddress({
        label,
        addressLine: c.address_line,
        postalCode: c.postal_code,
        city: c.city,
        latitude: c.latitude ?? 0,
        longitude: c.longitude ?? 0,
      });
    }
    setStep({
      kind: "done",
      clientId: c.id,
      olfactiveProfile: c.olfactive_profile,
      report: c.report,
      llmError: null,
      fromExisting: true,
    });
  }

  /**
   * Branche « cadeau » du welcome-back : on remet TOUT à zéro pour partir
   * sur un nouveau bénéficiaire. Le boutiquier saisira un autre prénom /
   * nom (le destinataire du cadeau, pas l'acheteur).
   */
  function startGiftSession() {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setAddressInput("");
    setResolvedAddress(null);
    setChannel("email");
    setConsent(false);
    setAnswers({});
    setStep({ kind: "intro" });
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
        llm_error: string | null;
      }>("/api/clients", {
        method: "POST",
        body: JSON.stringify({
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
      setStep({
        kind: "done",
        clientId: json.id,
        olfactiveProfile: json.olfactive_profile,
        report: json.report,
        llmError: json.llm_error,
        fromExisting: false,
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
        <header className="flex flex-col items-start gap-3 pt-2 report-section relative pl-6">
          <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
          <DataLabel>
            {step.fromExisting ? "EXISTING_CLIENT" : "NEW_CLIENT"} ·
            ID:{step.clientId.slice(0, 8)}
          </DataLabel>
          <h1 className="font-sans font-black text-3xl tracking-tighter uppercase leading-none">
            <span className="block">RAPPORT</span>
            <span className="block ml-4">OLFACTIF</span>
          </h1>
          <p className="font-cormorant italic text-lg opacity-70">
            « pour {firstName} {lastName} »
          </p>
        </header>

        {step.llmError && (
          <BrutalistCard className="px-4 py-3 flex flex-col gap-1">
            <DataLabel emphasis="high">LLM_ERROR</DataLabel>
            <p className="text-xs break-words mt-1">{step.llmError}</p>
            {step.llmError.includes("402") && (
              <a
                href="https://openrouter.ai/settings/credits"
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs uppercase tracking-widest font-bold border-b-2 border-on-background self-start mt-2"
              >
                RECHARGER OPENROUTER ↗
              </a>
            )}
            <p className="text-[11px] opacity-60 mt-1">
              La fiche est bien enregistrée. Tu peux relancer l'analyse depuis
              la fiche client ou réessayer un nouveau client.
            </p>
          </BrutalistCard>
        )}

        <ClientReport
          profile={step.olfactiveProfile as never}
          report={step.report as never}
        />

        <div className="flex flex-col gap-2 mt-2 report-section">
          {step.fromExisting && (
            <BrutalistButton
              onClick={() => setStep({ kind: "question", index: 0 })}
              variant="primary"
              size="lg"
              className="w-full"
            >
              Refaire le questionnaire
            </BrutalistButton>
          )}
          <Link
            href={`/clients/${step.clientId}`}
            className="w-full py-3.5 px-6 border-2 border-on-background bg-background hover:bg-on-background hover:text-background text-sm font-bold uppercase tracking-widest text-center transition-colors duration-150"
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
              setAddressInput("");
              setResolvedAddress(null);
              setConsent(false);
              setAnswers({});
              setStep({ kind: "time-budget" });
            }}
            className="w-full py-3.5 px-6 border-2 border-on-background bg-background hover:bg-on-background hover:text-background text-sm font-bold uppercase tracking-widest transition-colors duration-150"
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

      {step.kind === "welcome-back" && (
        <WelcomeBackStep
          client={step.client}
          onReuse={() => reuseExistingClient(step.client)}
          onGift={() => startGiftSession()}
        />
      )}

      {step.kind === "intro" && (
        <section className="flex flex-col gap-4">
          <header className="relative pl-6">
            <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
            <DataLabel>STEP:01 · IDENTITY</DataLabel>
            <h1 className="font-sans font-black text-3xl tracking-tighter uppercase mt-2 leading-none">
              POUR
              <br />
              <span className="ml-4">UN CLIENT</span>
            </h1>
            <p className="font-cormorant italic text-base opacity-70 mt-3">
              « Renseigne prénom et nom — la fiche restera dans Mes Clients. »
            </p>
          </header>
          <Field label="PRÉNOM">
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoFocus
              className={brutalInput}
            />
          </Field>
          <Field label="NOM">
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={brutalInput}
            />
          </Field>
          {anonymous ? (
            <div className="border-2 border-on-background bg-on-background/5 px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-xs leading-snug">
                Mode anonyme — la recherche de doublons est désactivée.
              </p>
              <button
                type="button"
                onClick={() => setAnonymous(false)}
                className="font-mono text-[10px] uppercase tracking-widest font-bold border-b-2 border-on-background"
              >
                RÉACTIVER
              </button>
            </div>
          ) : (
            <>
              <ExistingClientSuggestions
                firstName={firstName}
                lastName={lastName}
                onSelect={loadExistingClient}
              />
              <button
                type="button"
                onClick={() => setAnonymous(true)}
                className="self-start font-mono text-[10px] uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity"
              >
                ⚡ MODE ANONYME — SAUTER LA RECHERCHE
              </button>
            </>
          )}
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
              CANAL
              <br />
              <span className="ml-4">NEWSLETTER</span>
            </h2>
          </header>
          <Field label="EMAIL">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={brutalInput}
            />
          </Field>
          <Field label="TÉLÉPHONE">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={brutalInput}
            />
          </Field>
          <Field label="ADRESSE POSTALE (FACULTATIF — AIDE À DÉDOUBLONNER)">
            <AddressAutocomplete
              value={addressInput}
              onChange={(v) => {
                setAddressInput(v);
                if (resolvedAddress && v !== resolvedAddress.label) {
                  setResolvedAddress(null);
                }
              }}
              onSelect={setResolvedAddress}
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
              Le client accepte de recevoir la newsletter par le canal choisi et
              comprend qu'il pourra se désabonner à tout moment.
            </span>
          </label>
        </section>
      )}

      {step.kind === "submitting" && (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3">
          <Icon name="progress_activity" size={48} className="animate-spin" />
          <DataLabel emphasis="high">GENERATING_PROFILE…</DataLabel>
        </div>
      )}

      {error && (
        <div className="border-2 border-on-background bg-on-background text-background px-4 py-3">
          <p className="font-mono text-xs uppercase tracking-wider">{error}</p>
        </div>
      )}

      {step.kind !== "submitting" && step.kind !== "welcome-back" && (
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
              Enregistrer
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

const brutalInput =
  "w-full px-4 py-3 bg-background border-2 border-on-background font-mono text-sm focus:outline-none focus:shadow-[4px_4px_0px_0px_currentColor] placeholder:opacity-40 transition-shadow";

function Progress({ step, total }: { step: WizardStep; total: number }) {
  if (
    step.kind === "submitting" ||
    step.kind === "done" ||
    step.kind === "welcome-back"
  ) {
    return null;
  }
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

/**
 * Quand un boutiquier tape sur une fiche existante dans l'auto-complétion
 * d'intro, on l'amène sur ce step. Heart qui pop, sparkles, deux CTAs :
 * réutiliser la fiche existante, ou repartir de zéro pour un cadeau.
 */
function WelcomeBackStep({
  client,
  onReuse,
  onGift,
}: {
  client: BoutiqueClient;
  onReuse: () => void;
  onGift: () => void;
}) {
  return (
    <section className="flex flex-col gap-6 py-4">
      <div className="welcome-pop relative pl-6">
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
        <DataLabel emphasis="high">RETURNING_CLIENT · MATCHED</DataLabel>
        <h1 className="font-sans font-black text-3xl tracking-tighter uppercase leading-none mt-2">
          <span className="block">COUCOU</span>
          <span className="block ml-4 uppercase">{client.first_name.toUpperCase()}</span>
        </h1>
        <p className="font-cormorant italic text-base opacity-70 mt-3 max-w-sm">
          « Encore pour {client.first_name} — ou c'est un cadeau pour
          quelqu'un d'autre ? »
        </p>
      </div>

      <div className="welcome-cta flex flex-col gap-2">
        <BrutalistButton onClick={onReuse} size="lg" className="w-full">
          Encore pour {client.first_name}
        </BrutalistButton>
        <button
          type="button"
          onClick={onGift}
          className="w-full py-3.5 px-6 border-2 border-on-background bg-background hover:bg-on-background hover:text-background text-sm font-bold uppercase tracking-widest transition-colors duration-150"
        >
          C'est un cadeau, on repart à zéro
        </button>
      </div>
    </section>
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
      <header className="relative pl-6">
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
        <DataLabel>STEP:00 · TIME_BUDGET</DataLabel>
        <h1 className="font-sans font-black text-3xl tracking-tighter uppercase leading-none mt-2">
          COMBIEN
          <br />
          <span className="ml-4">DE TEMPS ?</span>
        </h1>
        <p className="font-cormorant italic text-base opacity-70 mt-3">
          « Plus on prend de temps, plus on cerne le profil — moins on
          repart avec un parfum qui ne correspond pas. »
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
