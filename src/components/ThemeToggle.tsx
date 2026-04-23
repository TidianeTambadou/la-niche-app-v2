"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";

const THEMES = [
  { value: "light", icon: "light_mode", label: "Clair" },
  { value: "system", icon: "brightness_auto", label: "Auto" },
  { value: "dark", icon: "dark_mode", label: "Sombre" },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <div
      className="flex w-full border border-outline-variant"
      role="radiogroup"
      aria-label="Apparence"
    >
      {THEMES.map(({ value, icon, label }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={clsx(
              "flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors text-[9px] uppercase tracking-widest font-medium",
              active
                ? "bg-primary text-on-primary"
                : "text-outline hover:text-on-background",
            )}
          >
            <Icon name={icon} size={16} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
