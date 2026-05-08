"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { authedFetch } from "@/lib/api-client";
import { useSpeechRecognition } from "@/lib/speech";
import type { QuestionKind, ShopQuestion } from "@/lib/types";

/**
 * Conciergerie La Niche — assistant intégré sur /settings/questions.
 *
 * Le boutiquier tape ou DICTE (Web Speech API) ce qu'il veut ; l'IA
 * traduit son intention en opérations CRUD applicables (update / create
 * / delete). Chaque opération est affichée comme une carte avec un
 * bouton "Appliquer" — l'application appelle les endpoints existants
 * /api/shops/me/questions[/:id], jamais l'IA elle-même, pour garder le
 * modèle hors du chemin sécurité.
 */

type Op =
  | {
      type: "update";
      questionId: string;
      patch: {
        label?: string;
        kind?: QuestionKind;
        options?: unknown;
        required?: boolean;
      };
      rationale: string;
    }
  | {
      type: "create";
      afterPosition?: number;
      question: {
        label: string;
        kind: QuestionKind;
        options?: unknown;
        required: boolean;
      };
      rationale: string;
    }
  | { type: "delete"; questionId: string; rationale: string };

type Props = {
  questions: ShopQuestion[];
  onChange: () => void;
};

const KIND_LABEL: Record<QuestionKind, string> = {
  text: "Texte libre",
  single: "Choix unique",
  multi: "Choix multiple",
  scale: "Échelle 1-5",
  email: "Email",
  phone: "Téléphone",
};

export function QuestionsConcierge({ questions, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operations, setOperations] = useState<Op[]>([]);
  const [appliedIdx, setAppliedIdx] = useState<Set<number>>(new Set());

  const { listening, supported, start, stop } = useSpeechRecognition({
    onTranscript: (text) => setTranscript(text),
  });

  async function send() {
    setError(null);
    if (!transcript.trim()) return;
    setBusy(true);
    setOperations([]);
    setAppliedIdx(new Set());
    try {
      const res = await authedFetch<{ operations: Op[] }>(
        "/api/concierge/questions",
        {
          method: "POST",
          body: JSON.stringify({ transcript, questions }),
        },
      );
      setOperations(res.operations);
      if (res.operations.length === 0) {
        setError("La conciergerie n'a rien suggéré. Reformule ta demande ?");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function applyOne(idx: number) {
    const op = operations[idx];
    setError(null);
    try {
      if (op.type === "update") {
        await authedFetch(`/api/shops/me/questions/${op.questionId}`, {
          method: "PATCH",
          body: JSON.stringify(op.patch),
        });
      } else if (op.type === "create") {
        // Created at the end. The boutique can drag-drop to reposition
        // ; reordering en bloc nécessiterait un PUT supplémentaire et
        // alourdit l'expérience pour un gain marginal.
        await authedFetch("/api/shops/me/questions", {
          method: "POST",
          body: JSON.stringify({
            label: op.question.label,
            kind: op.question.kind,
            options: op.question.options ?? null,
            required: op.question.required,
          }),
        });
      } else if (op.type === "delete") {
        await authedFetch(`/api/shops/me/questions/${op.questionId}`, {
          method: "DELETE",
        });
      }
      setAppliedIdx((s) => new Set(s).add(idx));
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function applyAll() {
    for (let i = 0; i < operations.length; i++) {
      if (appliedIdx.has(i)) continue;
      // eslint-disable-next-line no-await-in-loop
      await applyOne(i);
    }
  }

  function reset() {
    setTranscript("");
    setOperations([]);
    setAppliedIdx(new Set());
    setError(null);
  }

  return (
    <>
      {/* Floating launcher */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir la conciergerie"
        className="fixed bottom-24 right-4 z-30 flex items-center gap-2 px-4 py-3 bg-primary text-on-primary rounded-full shadow-lg active:scale-95 transition-transform"
      >
        <Icon name="auto_awesome" size={18} />
        <span className="text-xs uppercase tracking-widest font-bold">
          Conciergerie
        </span>
      </button>

      {!open ? null : (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-screen-md bg-surface rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Conciergerie La Niche</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="text-outline"
              >
                <Icon name="close" />
              </button>
            </header>

            <p className="text-xs text-on-surface-variant leading-relaxed">
              Dis-moi ce que tu veux : reformuler une question, en ajouter,
              en supprimer, simplifier les options. Tu peux taper ou{" "}
              {supported ? "dicter à la voix" : "(la dictée n'est pas dispo dans ce navigateur)"}.
            </p>

            <div className="flex items-stretch gap-2">
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={3}
                placeholder="Ex : reformule la question 4 pour qu'elle soit plus simple, ou ajoute une question sur la peau"
                className="flex-1 px-3 py-2 bg-surface-container rounded-2xl border border-outline-variant text-sm leading-relaxed"
              />
              {supported && (
                <button
                  type="button"
                  onClick={() => (listening ? stop() : start())}
                  aria-label={listening ? "Arrêter la dictée" : "Dicter"}
                  className={`px-3 rounded-2xl border flex items-center justify-center transition-colors ${
                    listening
                      ? "border-error bg-error-container/40 text-error animate-pulse"
                      : "border-outline-variant hover:border-primary"
                  }`}
                >
                  <Icon name={listening ? "stop" : "mic"} />
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={reset}
                className="flex-1 py-2 border border-outline-variant rounded-full text-xs uppercase tracking-widest"
              >
                Effacer
              </button>
              <button
                type="button"
                onClick={send}
                disabled={busy || !transcript.trim()}
                className="flex-1 py-2 bg-primary text-on-primary rounded-full text-xs font-bold uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {busy ? (
                  <>
                    <Icon name="progress_activity" size={14} className="animate-spin" />
                    Réfléchit…
                  </>
                ) : (
                  "Demander"
                )}
              </button>
            </div>

            {error && (
              <p className="text-sm text-error border border-error/30 bg-error-container/30 px-4 py-3 rounded-xl">
                {error}
              </p>
            )}

            {operations.length > 0 && (
              <section className="flex flex-col gap-2">
                <header className="flex items-center justify-between">
                  <h3 className="text-xs uppercase tracking-widest text-outline">
                    {operations.length} action{operations.length > 1 ? "s" : ""} suggérée{operations.length > 1 ? "s" : ""}
                  </h3>
                  <button
                    type="button"
                    onClick={applyAll}
                    disabled={appliedIdx.size === operations.length}
                    className="text-xs uppercase tracking-widest font-bold text-primary border-b border-primary disabled:opacity-50"
                  >
                    Tout appliquer
                  </button>
                </header>
                <ul className="flex flex-col gap-2">
                  {operations.map((op, i) => (
                    <li key={i}>
                      <OpCard
                        op={op}
                        questions={questions}
                        applied={appliedIdx.has(i)}
                        onApply={() => applyOne(i)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function OpCard({
  op,
  questions,
  applied,
  onApply,
}: {
  op: Op;
  questions: ShopQuestion[];
  applied: boolean;
  onApply: () => void;
}) {
  const target =
    op.type !== "create"
      ? questions.find((q) => q.id === op.questionId)
      : undefined;

  return (
    <div className="border border-outline-variant rounded-2xl px-4 py-3 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <Icon
          name={
            op.type === "update"
              ? "edit"
              : op.type === "create"
                ? "add_circle"
                : "delete"
          }
          size={18}
          className="mt-0.5 text-primary"
        />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-outline">
            {op.type === "update"
              ? "Modifier"
              : op.type === "create"
                ? "Créer"
                : "Supprimer"}
          </p>
          {op.type === "update" && target && (
            <>
              <p className="text-xs text-outline mt-0.5">Avant</p>
              <p className="text-sm">{target.label}</p>
              {op.patch.label && (
                <>
                  <p className="text-xs text-outline mt-1">Après</p>
                  <p className="text-sm font-semibold">{op.patch.label}</p>
                </>
              )}
              {op.patch.kind && (
                <p className="text-[11px] text-on-surface-variant mt-1">
                  Type → {KIND_LABEL[op.patch.kind]}
                </p>
              )}
              {Array.isArray(op.patch.options) && (
                <p className="text-[11px] text-on-surface-variant mt-1">
                  Choix → {(op.patch.options as string[]).join(", ")}
                </p>
              )}
              {typeof op.patch.required === "boolean" && (
                <p className="text-[11px] text-on-surface-variant mt-1">
                  Obligatoire → {op.patch.required ? "oui" : "non"}
                </p>
              )}
            </>
          )}
          {op.type === "create" && (
            <>
              <p className="text-sm font-semibold">{op.question.label}</p>
              <p className="text-[11px] text-on-surface-variant mt-0.5">
                {KIND_LABEL[op.question.kind]}
                {op.question.required ? " · obligatoire" : " · optionnelle"}
                {Array.isArray(op.question.options) &&
                  ` · ${(op.question.options as string[]).length} choix`}
              </p>
            </>
          )}
          {op.type === "delete" && target && (
            <p className="text-sm">{target.label}</p>
          )}
          <p className="text-xs text-on-surface-variant italic mt-2 leading-relaxed">
            {op.rationale}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onApply}
        disabled={applied}
        className={`self-end px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-bold ${
          applied
            ? "bg-primary-container/40 text-on-primary-container"
            : "bg-primary text-on-primary"
        }`}
      >
        {applied ? "Appliqué" : "Appliquer"}
      </button>
    </div>
  );
}

