"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { authedFetch } from "@/lib/api-client";
import { useSpeechRecognition } from "@/lib/speech";

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
  current: { subject: string; body: string; sms: string };
  onClose: () => void;
  onApply: (next: { subject: string; body: string; sms: string }) => void;
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
      const res = await authedFetch<{ subject: string; body: string; sms: string }>(
        "/api/newsletter/redraft",
        {
          method: "POST",
          body: JSON.stringify({
            perfumeId,
            instruction,
            currentSubject: current.subject,
            currentBody: current.body,
            currentSms: current.sms,
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
      className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-screen-md bg-surface rounded-t-3xl p-6 flex flex-col gap-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Reformuler avec l'IA</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="text-outline"
          >
            <Icon name="close" />
          </button>
        </header>

        <p className="text-xs text-on-surface-variant leading-relaxed">
          Dis-moi ce que tu veux changer : ton plus chaleureux, plus
          court, accent saison, registre VIP… Tu peux taper ou{" "}
          {supported ? "dicter à la voix" : "(dictée non dispo dans ce navigateur)"}.
        </p>

        <div className="flex items-stretch gap-2">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={3}
            placeholder="Ex : rends ça plus chaleureux et personnel, façon ami qui partage une découverte"
            className="flex-1 px-3 py-2 bg-surface-container rounded-2xl border border-outline-variant text-sm leading-relaxed"
          />
          {supported && (
            <button
              type="button"
              onClick={() => (listening ? stop() : start())}
              aria-label={listening ? "Arrêter" : "Dicter"}
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

        {error && (
          <p className="text-sm text-error border border-error/30 bg-error-container/30 px-4 py-3 rounded-xl">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={busy || !instruction.trim()}
          className="w-full py-3 bg-primary text-on-primary rounded-full text-sm font-bold uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? (
            <>
              <Icon name="progress_activity" size={16} className="animate-spin" />
              Reformule…
            </>
          ) : (
            <>
              <Icon name="auto_awesome" size={16} />
              Appliquer la reformulation
            </>
          )}
        </button>
      </div>
    </div>,
    document.body,
  );
}
