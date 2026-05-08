"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { authedFetch } from "@/lib/api-client";
import { useSpeechRecognition } from "@/lib/speech";
import type { QuestionKind, ShopQuestion } from "@/lib/types";
import { DataLabel } from "@/components/brutalist/DataLabel";
import { BrutalistButton } from "@/components/brutalist/BrutalistButton";

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
        className="fixed bottom-24 right-4 z-30 flex items-center gap-2 px-4 py-3 bg-on-background text-background border-2 border-on-background shadow-[4px_4px_0px_0px_currentColor] hover:shadow-[2px_2px_0px_0px_currentColor] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all duration-150"
      >
        <Icon name="auto_awesome" size={18} />
        <span className="font-mono text-xs uppercase tracking-widest font-bold">
          Conciergerie
        </span>
      </button>

      {!open ? null : (
        <div
          className="fixed inset-0 z-50 bg-on-background/40 flex items-end justify-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-screen-md bg-background border-t-2 border-on-background p-6 max-h-[90vh] overflow-y-auto flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between pl-4 relative">
              <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
              <div>
                <DataLabel>AI · CONCIERGERIE</DataLabel>
                <h2 className="font-sans font-black text-2xl tracking-tighter uppercase mt-1">
                  La Niche
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="opacity-60 hover:opacity-100"
              >
                <Icon name="close" />
              </button>
            </header>

            <p className="font-cormorant italic text-base opacity-70 leading-relaxed">
              « Dis-moi ce que tu veux : reformuler une question, en ajouter,
              en supprimer, simplifier les options.{" "}
              {supported ? "Tape ou dicte à la voix." : "(dictée non dispo dans ce navigateur)"} »
            </p>

            <div className="flex items-stretch gap-2">
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={3}
                placeholder="Ex : reformule la question 4, ou ajoute une question sur la peau"
                className="flex-1 px-3 py-2.5 bg-background border-2 border-on-background text-sm leading-relaxed focus:outline-none focus:shadow-[4px_4px_0px_0px_currentColor] placeholder:opacity-40 transition-shadow"
              />
              {supported && (
                <button
                  type="button"
                  onClick={() => (listening ? stop() : start())}
                  aria-label={listening ? "Arrêter la dictée" : "Dicter"}
                  className={`px-4 border-2 flex items-center justify-center transition-colors duration-150 ${
                    listening
                      ? "border-on-background bg-on-background text-background animate-pulse"
                      : "border-on-background bg-background hover:bg-on-background/5"
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
                className="flex-1 py-2.5 border-2 border-on-background bg-background hover:bg-on-background hover:text-background font-mono text-xs font-bold uppercase tracking-widest transition-colors duration-150"
              >
                Effacer
              </button>
              <BrutalistButton
                onClick={send}
                disabled={busy || !transcript.trim()}
                size="md"
                className="flex-1"
              >
                {busy ? (
                  <>
                    <Icon name="progress_activity" size={14} className="animate-spin" />
                    Réfléchit…
                  </>
                ) : (
                  "Demander"
                )}
              </BrutalistButton>
            </div>

            {error && (
              <div className="border-2 border-on-background bg-on-background text-background px-4 py-3">
                <p className="font-mono text-xs uppercase tracking-wider">{error}</p>
              </div>
            )}

            {operations.length > 0 && (
              <section className="flex flex-col gap-2">
                <header className="flex items-center justify-between">
                  <DataLabel emphasis="high">
                    {operations.length} ACTION{operations.length > 1 ? "S" : ""} SUGGÉRÉE{operations.length > 1 ? "S" : ""}
                  </DataLabel>
                  <button
                    type="button"
                    onClick={applyAll}
                    disabled={appliedIdx.size === operations.length}
                    className="font-mono text-xs uppercase tracking-widest font-bold border-b-2 border-on-background disabled:opacity-50"
                  >
                    TOUT APPLIQUER
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
    <div className="border-2 border-on-background bg-background px-4 py-3 flex flex-col gap-2">
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
          className="mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <DataLabel>
            {op.type === "update"
              ? "UPDATE"
              : op.type === "create"
                ? "CREATE"
                : "DELETE"}
          </DataLabel>
          {op.type === "update" && target && (
            <>
              <p className="font-mono text-xs opacity-60 uppercase tracking-wider mt-1">AVANT</p>
              <p className="text-sm">{target.label}</p>
              {op.patch.label && (
                <>
                  <p className="font-mono text-xs opacity-60 uppercase tracking-wider mt-1">APRÈS</p>
                  <p className="text-sm font-bold">{op.patch.label}</p>
                </>
              )}
              {op.patch.kind && (
                <p className="font-mono text-[11px] opacity-70 mt-1">
                  Type → {KIND_LABEL[op.patch.kind]}
                </p>
              )}
              {Array.isArray(op.patch.options) && (
                <p className="font-mono text-[11px] opacity-70 mt-1">
                  Choix → {(op.patch.options as string[]).join(", ")}
                </p>
              )}
              {typeof op.patch.required === "boolean" && (
                <p className="font-mono text-[11px] opacity-70 mt-1">
                  Obligatoire → {op.patch.required ? "oui" : "non"}
                </p>
              )}
            </>
          )}
          {op.type === "create" && (
            <>
              <p className="font-sans font-bold uppercase tracking-tight text-sm mt-1">{op.question.label}</p>
              <p className="font-mono text-[11px] opacity-70 mt-0.5">
                {KIND_LABEL[op.question.kind]}
                {op.question.required ? " · obligatoire" : " · optionnelle"}
                {Array.isArray(op.question.options) &&
                  ` · ${(op.question.options as string[]).length} choix`}
              </p>
            </>
          )}
          {op.type === "delete" && target && (
            <p className="text-sm mt-1">{target.label}</p>
          )}
          <p className="font-cormorant italic text-sm opacity-70 mt-2 leading-relaxed">
            « {op.rationale} »
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onApply}
        disabled={applied}
        className={`self-end px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest font-bold border-2 transition-colors duration-150 ${
          applied
            ? "border-on-background bg-on-background/10 text-on-background opacity-60"
            : "border-on-background bg-on-background text-background hover:bg-background hover:text-on-background"
        }`}
      >
        {applied ? "Appliqué" : "Appliquer"}
      </button>
    </div>
  );
}

