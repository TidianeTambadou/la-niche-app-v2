import { clsx } from "clsx";

type IconProps = {
  name: string;
  filled?: boolean;
  className?: string;
  /** Inline size override (px). Defaults to font-size of parent. */
  size?: number;
};

/**
 * Material Symbols Outlined wrapper. The font is loaded from Google Fonts
 * via a <link> in the root layout's <head>.
 */
export function Icon({ name, filled, className, size }: IconProps) {
  return (
    <span
      aria-hidden
      className={clsx("material-symbols-outlined", filled && "filled", className)}
      style={size ? { fontSize: size } : undefined}
    >
      {name}
    </span>
  );
}
