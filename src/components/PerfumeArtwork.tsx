"use client";

import { useState } from "react";
import { clsx } from "clsx";

/**
 * Visual placeholder used wherever we'd previously show a scraped Fragrantica
 * bottle photo. Scraping turned out to be unreliable — wrong perfume, broken
 * URLs — so we now render the La Niche logo as a watermark with the perfume
 * name on top. Same footprint as the old <img>, drop-in replacement.
 *
 * Variants:
 *   - "card"  : full-bleed (e.g. home flashcard, swipe card)
 *   - "thumb" : compact (search result row, autocomplete dropdown)
 */

type Variant = "card" | "thumb";

type Props = {
  brand: string;
  name: string;
  family?: string;
  notesBrief?: string;
  variant?: Variant;
  /** Show the "Image bientôt disponible" caption. Default true on cards. */
  showSoonCaption?: boolean;
  className?: string;
};

export function PerfumeArtwork({
  brand,
  name,
  family,
  notesBrief,
  variant = "card",
  showSoonCaption,
  className,
}: Props) {
  const [logoFailed, setLogoFailed] = useState(false);
  const showCaption = showSoonCaption ?? variant === "card";

  return (
    <div
      className={clsx(
        "relative overflow-hidden bg-surface-container-low border border-outline-variant",
        className,
      )}
      aria-label={`${brand} — ${name}`}
    >
      {/* Logo watermark — large, very low opacity, behind everything. */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {logoFailed ? (
          <span className="text-on-surface-variant/15 font-mono font-bold tracking-[0.4em] text-5xl">
            LN
          </span>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src="/logo-laniche.png"
            alt=""
            className={clsx(
              "object-contain opacity-[0.07]",
              variant === "card" ? "w-3/4 h-3/4" : "w-2/3 h-2/3",
            )}
            onError={() => setLogoFailed(true)}
          />
        )}
      </div>

      {/* Subtle vignette so the text reads against the watermark. */}
      <div className="absolute inset-0 bg-gradient-to-t from-on-background/15 via-transparent to-transparent pointer-events-none" />

      {/* Content */}
      {variant === "card" ? (
        <div className="relative flex flex-col h-full p-5">
          <p className="text-[10px] uppercase tracking-[0.3em] text-outline">
            {brand}
            {family ? ` · ${family}` : ""}
          </p>
          <h3 className="text-2xl font-semibold tracking-tight leading-tight mt-1">
            {name}
          </h3>

          {notesBrief && (
            <p className="text-[12px] text-on-surface-variant mt-3 leading-relaxed line-clamp-4">
              {notesBrief}
            </p>
          )}

          <div className="mt-auto pt-3">
            {showCaption && (
              <p className="text-[9px] uppercase tracking-widest text-outline font-mono">
                Image bientôt disponible
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="relative flex flex-col items-center justify-center h-full px-2 text-center">
          <p className="text-[8px] uppercase tracking-[0.3em] text-outline leading-tight">
            {brand}
          </p>
          <p className="text-[10px] font-semibold tracking-tight leading-tight mt-0.5 line-clamp-2">
            {name}
          </p>
        </div>
      )}
    </div>
  );
}
