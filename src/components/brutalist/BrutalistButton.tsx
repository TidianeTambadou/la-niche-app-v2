import { clsx } from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-on-background text-background border-2 border-on-background shadow-[4px_4px_0px_0px_currentColor] hover:shadow-[2px_2px_0px_0px_currentColor] hover:translate-x-[2px] hover:translate-y-[2px]",
  secondary:
    "bg-background text-on-background border-2 border-on-background hover:bg-on-background hover:text-background",
  ghost:
    "bg-transparent text-on-background border-2 border-transparent hover:border-on-background",
};

const SIZE: Record<Size, string> = {
  sm: "px-3 py-1.5 text-[10px]",
  md: "px-5 py-2.5 text-xs",
  lg: "px-7 py-3.5 text-sm",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
};

export function BrutalistButton({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      className={clsx(
        "font-sans font-semibold tracking-widest uppercase rounded-none transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
