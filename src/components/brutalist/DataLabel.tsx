import { clsx } from "clsx";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Opacité du texte. Par défaut 60 % pour rester en arrière-plan. */
  emphasis?: "low" | "medium" | "high";
};

const OPACITY = {
  low: "opacity-40",
  medium: "opacity-60",
  high: "opacity-100",
} as const;

/**
 * Micro-label en JetBrains Mono pour signaler une donnée technique.
 * Format type : `DATA_POINT://842`, `STEP:01/04`, `SCORE:0.87`.
 */
export function DataLabel({ children, className, emphasis = "medium" }: Props) {
  return (
    <span
      className={clsx(
        "font-mono text-xs tracking-widest uppercase",
        OPACITY[emphasis],
        className,
      )}
    >
      {children}
    </span>
  );
}
