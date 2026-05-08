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
        <header className="flex flex-col items-center text-center gap-2 pt-2 report-section">
          <Icon
            name={step.fromExisting ? "person" : "check_circle"}
            size={48}
            className="text-primary"
          />
          <h1 className="text-2xl font-semibold tracking-tight">
            Rapport olfactif — {firstName} {lastName}
          </h1>
          <p className="text-xs uppercase tracking-widest text-outline">
            {step.fromExisting
              ? "Fiche existante · dernière session"
              : "Synthèse IA · fiche enregistrée"}
          </p>
        </header>

        {step.llmError && (
          <div className="border border-error/40 bg-error-container/30 rounded-2xl px-4 py-3 flex flex-col gap-1">
            <p className="text-xs uppercase tracking-widest font-bold text-error">
              Rapport IA échoué
            </p>
            <p className="text-xs text-on-surface-variant break-words">
              {step.llmError}
            </p>
            {step.llmError.includes("402") && (
              <a
                href="https://openrouter.ai/settings/credits"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs uppercase tracking-widest font-bold text-primary border-b border-primary self-start mt-2"
              >
                Recharger OpenRouter ↗
              </a>
            )}
            <p className="text-[11px] text-outline mt-1">
              La fiche est bien enregistrée. Tu peux relancer l'analyse depuis
              la fiche client (à venir) ou réessayer un nouveau client.
            </p>
          </div>
        )}

        <ClientReport
          profile={step.olfactiveProfile as never}
          report={step.report as never}
        />

        <div className="flex flex-col gap-2 mt-2 report-section">
          {step.fromExisting && (
            <button
              type="button"
              onClick={() =>
                setStep({ kind: "question", index: 0 })
              }
              className="w-full py-3 bg-primary text-on-primary rounded-full text-sm font-bold uppercase tracking-widest"
            >
              Refaire le questionnaire
            </button>
          )}
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
              setAddressInput("");
              setResolvedAddress(null);
              setConsent(false);
              setAnswers({});
              setStep({ kind: "time-budget" });
            }}
            className="w-full py-3 border border-outline-variant rounded-full text-sm font-medium uppercase tracking-widest"
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
          {anonymous ? (
            <div className="border border-outline-variant rounded-2xl px-4 py-3 flex items-center justify-between gap-3 bg-surface-container/40">
              <p className="text-xs text-on-surface-variant leading-snug">
                Mode anonyme — la recherche de doublons est désactivée.
              </p>
              <button
                type="button"
                onClick={() => setAnonymous(false)}
                className="text-[10px] uppercase tracking-widest font-bold text-primary border-b border-primary"
              >
                Réactiver
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
                className="self-start text-[11px] uppercase tracking-widest text-outline hover:text-primary"
              >
                ⚡ Sauter la recherche (mode anonyme)
              </button>
            </>
          )}
        </section>
      )}

      {step.kind === "question" && (
        <section className="flex flex-col gap-4">
          <PerfumeGlossary />
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
          <Field label="Adresse postale (facultatif, aide à dédoublonner)">
            <AddressAutocomplete
              value={addressInput}
              onChange={(v) => {
                setAddressInput(v);
                // Clear the resolved address as soon as the user edits the
                // text so we don't persist a stale (label, gps) pair.
                if (resolvedAddress && v !== resolvedAddress.label) {
                  setResolvedAddress(null);
                }
              }}
              onSelect={setResolvedAddress}
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

      {step.kind !== "submitting" && step.kind !== "welcome-back" && (
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
    <div className="h-1 bg-outline-variant/30 rounded-full overflow-hidden">
      <div
        className="h-full bg-primary transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
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
    <section className="flex flex-col items-center text-center gap-5 py-6">
      <div className="relative">
        <div className="welcome-pop w-20 h-20 rounded-full bg-primary-container/40 flex items-center justify-center">
          <Icon name="favorite" size={36} className="text-primary" filled />
        </div>
        <span className="sparkle-1 absolute -top-2 -right-3 text-primary">
          <Icon name="auto_awesome" size={16} />
        </span>
        <span className="sparkle-2 absolute -bottom-1 -left-3 text-primary">
          <Icon name="auto_awesome" size={12} />
        </span>
        <span className="sparkle-3 absolute -top-3 left-1/2 -translate-x-1/2 text-primary">
          <Icon name="auto_awesome" size={10} />
        </span>
      </div>

      <div className="welcome-text flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Coucou, heureux de revoir {client.first_name} !
        </h1>
        <p className="text-sm text-on-surface-variant max-w-sm">
          Cette session, c'est encore pour {client.first_name} — ou c'est un cadeau pour quelqu'un d'autre&nbsp;?
        </p>
      </div>

      <div className="welcome-cta flex flex-col gap-2 w-full max-w-sm">
        <button
          type="button"
          onClick={onReuse}
          className="w-full py-3 bg-primary text-on-primary rounded-full text-sm font-bold uppercase tracking-widest active:scale-95 transition-transform"
        >
          Encore pour {client.first_name}
        </button>
        <button
          type="button"
          onClick={onGift}
          className="w-full py-3 border border-outline-variant rounded-full text-sm font-medium uppercase tracking-widest active:scale-95 transition-transform"
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
