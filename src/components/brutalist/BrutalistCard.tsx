import { clsx } from "clsx";
import type { HTMLAttributes, ReactNode } from "react";

type Variant = "hero" | "default" | "subtle";

const SHADOW: Record<Variant, string> = {
  hero: "shadow-[8px_8px_0px_0px_currentColor]",
  default: "shadow-[4px_4px_0px_0px_currentColor]",
  subtle: "shadow-[20px_20px_0px_0px_rgba(0,0,0,0.05)]",
};

type Props = HTMLAttributes<HTMLDivElement> & {
  variant?: Variant;
  children: ReactNode;
  /** Active l'effet "press" : la carte se rapproche au hover/active. */
  interactive?: boolean;
};

/**
 * Brutalist card — bordure 2px noire, ombre décalée pleine, sharp corners.
 * Signature visuelle du design system. Jamais de `rounded-*`.
 */
export function BrutalistCard({
  variant = "default",
  interactive = false,
  className,
  children,
  ...rest
}: Props) {
  return (
    <div
      className={clsx(
        "bg-background text-on-background border-2 border-on-background relative",
        SHADOW[variant],
        interactive &&
          "transition-all duration-150 hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_currentColor] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0px_0px_currentColor]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
