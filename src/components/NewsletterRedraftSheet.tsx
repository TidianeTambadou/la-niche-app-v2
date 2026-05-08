"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { authedFetch } from "@/lib/api-client";
import { useSpeechRecognition } from "@/lib/speech";
import { DataLabel } from "@/components/brutalist/DataLabel";
import { BrutalistButton } from "@/components/brutalist/BrutalistButton";

/**
 * Conciergerie newsletter — bottom sheet ouverte depuis le step preview
 * de /newsletter. Le boutiquier tape ou DICTE comment il veut reformuler
 * son mail/SMS ("plus chaleureux", "plus court", "ton de Noël"…) ;
 * /api/newsletter/redraft renvoie un nouveau brouillon que la page
 * applique via callback.
 */

type Props = {
  /** Null en mode message libre — l'IA reformule sans grounder sur un parfum. */
  perfumeId: string | null;
  current: { subject: string; body: string };
  onClose: () => void;
  onApply: (next: { subject: string; body: string }) => void;
};

export function NewsletterRedraftSheet({
  perfumeId,
  current,
  onClose,
  onApply,
}: Props) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { supported, listening, start, stop } = useSpeechRecognition({
    onTranscript: (t) => setInstruction(t),
  });

  async function submit() {
    if (!instruction.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch<{ subject: string; body: string }>(
        "/api/newsletter/redraft",
        {
          method: "POST",
          body: JSON.stringify({
            perfumeId,
            instruction,
            currentSubject: current.subject,
            currentBody: current.body,
          }),
        },
      );
      onApply(res);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-on-background/40 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-screen-md bg-background border-t-2 border-on-background p-6 flex flex-col gap-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between pl-4 relative">
          <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
          <div>
            <DataLabel>AI · REDRAFT</DataLabel>
            <h2 className="font-sans font-black text-2xl tracking-tighter uppercase mt-1">
              Reformuler
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="opacity-60 hover:opacity-100"
          >
            <Icon name="close" />
          </button>
        </header>

        <p className="font-cormorant italic text-base opacity-70 leading-relaxed">
          « Dis-moi ce que tu veux changer : ton plus chaleureux, plus court,
          accent saison, registre VIP… {supported ? "Tape ou dicte à la voix." : "(dictée non dispo dans ce navigateur)"} »
        </p>

        <div className="flex items-stretch gap-2">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={3}
            placeholder="Ex : rends ça plus chaleureux et personnel"
            className="flex-1 px-3 py-2.5 bg-background border-2 border-on-background text-sm leading-relaxed focus:outline-none focus:shadow-[4px_4px_0px_0px_currentColor] placeholder:opacity-40 transition-shadow"
          />
          {supported && (
            <button
              type="button"
              onClick={() => (listening ? stop() : start())}
              aria-label={listening ? "Arrêter" : "Dicter"}
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

        {error && (
          <div className="border-2 border-on-background bg-on-background text-background px-4 py-3">
            <p className="font-mono text-xs uppercase tracking-wider">{error}</p>
          </div>
        )}

        <BrutalistButton
          onClick={submit}
          disabled={busy || !instruction.trim()}
          size="lg"
          className="w-full"
        >
          {busy ? (
            <>
              <Icon name="progress_activity" size={16} className="animate-spin" />
              Reformule…
            </>
          ) : (
            <>
              <Icon name="auto_awesome" size={16} />
              Appliquer
            </>
          )}
        </BrutalistButton>
      </div>
    </div>,
    document.body,
  );
}
