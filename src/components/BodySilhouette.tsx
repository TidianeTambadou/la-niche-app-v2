"use client";

import { clsx } from "clsx";
import type { BodyZone } from "@/lib/fragrances";

/**
 * Interactive front-view body silhouette with tappable zones.
 * Drawn as a single SVG so zones stay perfectly aligned at any size.
 *
 * Coordinate system: viewBox="0 0 200 400". The silhouette path is purely
 * decorative — interaction happens via <circle> "hotspots" at fixed positions.
 */

type ZonePoint = { zone: BodyZone; cx: number; cy: number; label: string };

const ZONE_POINTS: ZonePoint[] = [
  { zone: "behind-ear-left", cx: 87, cy: 38, label: "Oreille G" },
  { zone: "behind-ear-right", cx: 113, cy: 38, label: "Oreille D" },
  { zone: "neck-left", cx: 92, cy: 65, label: "Cou G" },
  { zone: "neck-right", cx: 108, cy: 65, label: "Cou D" },
  { zone: "chest", cx: 100, cy: 110, label: "Buste" },
  { zone: "inner-elbow-left", cx: 60, cy: 175, label: "Coude G" },
  { zone: "inner-elbow-right", cx: 140, cy: 175, label: "Coude D" },
  { zone: "wrist-left", cx: 42, cy: 235, label: "Poignet G" },
  { zone: "wrist-right", cx: 158, cy: 235, label: "Poignet D" },
];

type Props = {
  /** Map zone -> short marker label (e.g. perfume initials). */
  filledZones?: Partial<Record<BodyZone, string>>;
  /** Currently highlighted zone (e.g. just-placed). */
  highlightedZone?: BodyZone | null;
  /** Called when the user taps any zone. */
  onZoneClick?: (zone: BodyZone) => void;
  /** Read-only mode disables interaction (used on End-of-Balade summary). */
  readOnly?: boolean;
  className?: string;
};

export function BodySilhouette({
  filledZones = {},
  highlightedZone,
  onZoneClick,
  readOnly = false,
  className,
}: Props) {
  return (
    <svg
      viewBox="0 0 200 400"
      className={clsx(
        "w-full max-w-[280px] mx-auto",
        readOnly ? "cursor-default" : "cursor-pointer",
        className,
      )}
      role="img"
      aria-label="Silhouette du corps"
    >
      {/* Decorative grid backdrop */}
      <defs>
        <pattern
          id="bodyGrid"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r="0.5" fill="currentColor" opacity="0.15" />
        </pattern>
      </defs>
      <rect width="200" height="400" fill="url(#bodyGrid)" className="text-outline-variant" />

      {/* Silhouette outline — abstract, gender-neutral */}
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        strokeLinecap="round"
        className="text-on-surface-variant"
      >
        {/* Head */}
        <circle cx="100" cy="32" r="18" />
        {/* Neck */}
        <path d="M93 50 L93 62 Q100 68 107 62 L107 50" />
        {/* Shoulders + torso */}
        <path d="M70 70 Q100 62 130 70 L150 95 L145 175 L130 220 L120 280 L115 360 L105 360 L102 280 L100 220 L98 280 L95 360 L85 360 L80 280 L70 220 L55 175 L50 95 Z" />
        {/* Arms */}
        <path d="M70 70 L48 130 L40 220 L38 260" />
        <path d="M48 130 L60 175 L62 215" />
        <path d="M130 70 L152 130 L160 220 L162 260" />
        <path d="M152 130 L140 175 L138 215" />
        {/* Hands */}
        <circle cx="38" cy="265" r="6" />
        <circle cx="162" cy="265" r="6" />
      </g>

      {/* Zone hotspots */}
      {ZONE_POINTS.map((p) => {
        const filledLabel = filledZones[p.zone];
        const isFilled = Boolean(filledLabel);
        const isHighlighted = highlightedZone === p.zone;
        return (
          <g key={p.zone}>
            {/* Pulse ring on highlighted */}
            {isHighlighted && (
              <circle
                cx={p.cx}
                cy={p.cy}
                r={14}
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                className="text-primary"
                opacity="0.4"
              >
                <animate
                  attributeName="r"
                  from="9"
                  to="18"
                  dur="1.4s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  from="0.6"
                  to="0"
                  dur="1.4s"
                  repeatCount="indefinite"
                />
              </circle>
            )}
            {/* Hotspot — clickable */}
            <circle
              cx={p.cx}
              cy={p.cy}
              r={isFilled ? 9 : 6}
              fill={isFilled ? "currentColor" : "white"}
              stroke="currentColor"
              strokeWidth="1.2"
              className={clsx(
                isFilled ? "text-primary" : "text-on-surface-variant",
                !readOnly && "transition-all hover:r-8",
              )}
              onClick={readOnly ? undefined : () => onZoneClick?.(p.zone)}
              style={{ cursor: readOnly ? "default" : "pointer" }}
            />
            {/* Marker label inside filled hotspot */}
            {isFilled && (
              <text
                x={p.cx}
                y={p.cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="6"
                fontFamily="var(--font-jetbrains-mono), monospace"
                fontWeight="700"
                className="text-on-primary"
                fill="currentColor"
                pointerEvents="none"
              >
                {filledLabel}
              </text>
            )}
            {/* Zone caption (always visible, small) */}
            <text
              x={p.cx}
              y={p.cy + 18}
              textAnchor="middle"
              fontSize="5.5"
              fontFamily="var(--font-jetbrains-mono), monospace"
              className="text-outline"
              fill="currentColor"
              pointerEvents="none"
            >
              {p.label.toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Helper: 2-letter initials for a perfume name (used as zone marker). */
export function fragranceInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
