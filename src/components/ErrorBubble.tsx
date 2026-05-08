"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

const SUPPORT_EMAIL = "lanichedev@gmail.com";

type Variant = "block" | "inline" | "panel";

type Props = {
  /** Raw error message — used in the bug report email body, never shown to the user. */
  detail?: string;
  /** Source page/feature for the bug report subject. */
  context?: string;
  /** "block" = full panel (scan, recommendations done view), "inline" = compact (autocomplete dropdown), "panel" = bordered card. */
  variant?: Variant;
  /** Optional retry callback. When provided, a "Réessayer" button is shown. */
  onRetry?: () => void;
  className?: string;
};

/**
 * Friendly error surface for any agent / network / unexpected failure.
 *
 * Shows the Gallery La Niche logo, a non-technical message, and a "Faire part
 * du bug au support" button that opens the user's mail client pre-filled with
 * the raw error so the dev team can diagnose. The raw error is never shown
 * to the end user.
 */
export function ErrorBubble({
  detail,
  context,
  variant = "block",
  onRetry,
  className,
}: Props) {
  const [imgFailed, setImgFailed] = useState(false);

  function reportBug() {
    const subject = `[Bug Gallery La Niche]${context ? ` ${context}` : ""}`;
    const lines = [
      "Bonjour l'équipe Gallery La Niche,",
      "",
      "J'ai rencontré un bug dans l'application :",
      "",
      `Page / contexte : ${context ?? "(non précisé)"}`,
      `Détail technique : ${detail ?? "(aucun)"}`,
      `Heure : ${new Date().toISOString()}`,
      "",
      "Merci de regarder !",
    ];
    const href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(lines.join("\n"))}`;
    if (typeof window !== "undefined") window.location.href = href;
  }

  const Logo = (
    <div
      className={
        variant === "inline"
          ? "w-7 h-7 rounded-full overflow-hidden bg-background border border-outline-variant flex items-center justify-center flex-shrink-0"
          : "w-12 h-12 rounded-full overflow-hidden bg-background border border-outline-variant flex items-center justify-center flex-shrink-0"
      }
      aria-hidden
    >
      {imgFailed ? (
        <span className="text-[10px] font-mono font-bold tracking-widest">
          LN
        </span>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src="/logo-laniche.png"
          alt=""
          className="w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      )}
    </div>
  );

  if (variant === "inline") {
    return (
      <div
        className={`px-3 py-3 flex items-start gap-3 ${className ?? ""}`}
        role="alert"
      >
        {Logo}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-on-background leading-snug">
            Oups, on essaye de régler le souci.
          </p>
          <button
            type="button"
            onClick={reportBug}
            className="mt-1 text-[10px] uppercase tracking-widest font-bold text-primary border-b border-primary pb-px"
          >
            Faire part du bug au support
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`border border-outline-variant bg-surface-container-low p-5 flex flex-col items-center text-center gap-3 ${className ?? ""}`}
      role="alert"
    >
      {Logo}
      <div>
        <p className="text-sm font-semibold tracking-tight">
          Oups, on essaye de régler le souci.
        </p>
        <p className="text-xs text-on-surface-variant mt-1 max-w-xs">
          L&apos;équipe Gallery La Niche est sur le coup. Tu peux nous aider en
          nous envoyant un mot.
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        <button
          type="button"
          onClick={reportBug}
          className="w-full py-3 bg-primary text-on-primary rounded-full text-[10px] uppercase tracking-widest font-bold active:scale-95 transition-transform flex items-center justify-center gap-2"
        >
          <Icon name="mail" size={14} />
          Faire part du bug au support
        </button>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="w-full py-2.5 border border-outline-variant rounded-full text-[10px] uppercase tracking-widest font-bold hover:border-primary transition-colors"
          >
            Réessayer
          </button>
        )}
      </div>
    </div>
  );
}
