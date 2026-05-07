"use client";

import { clsx } from "clsx";
import type { ShopQuestion } from "@/lib/types";

type Value = string | string[] | number | undefined;

type Props = {
  q: Pick<ShopQuestion, "id" | "label" | "kind" | "options" | "required">;
  value: Value;
  onChange: (v: Value) => void;
};

/**
 * Renders the right input control for a given question kind. Centralised
 * here so the wizard, the user-side form, and the questions preview all
 * stay visually consistent.
 */
export function QuestionInput({ q, value, onChange }: Props) {
  switch (q.kind) {
    case "text": {
      return (
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          required={q.required}
          rows={3}
          className="w-full px-4 py-3 bg-surface-container rounded-2xl border border-outline-variant text-sm leading-relaxed"
          placeholder="Tape ta réponse"
        />
      );
    }

    case "email":
      return (
        <input
          type="email"
          inputMode="email"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          required={q.required}
          className="w-full px-4 py-3 bg-surface-container rounded-2xl border border-outline-variant text-sm"
          placeholder="prenom@exemple.com"
        />
      );

    case "phone":
      return (
        <input
          type="tel"
          inputMode="tel"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          required={q.required}
          className="w-full px-4 py-3 bg-surface-container rounded-2xl border border-outline-variant text-sm"
          placeholder="06 12 34 56 78"
        />
      );

    case "single": {
      const options = Array.isArray(q.options) ? (q.options as string[]) : [];
      return (
        <ul className="flex flex-col gap-2">
          {options.map((opt) => {
            const selected = value === opt;
            return (
              <li key={opt}>
                <button
                  type="button"
                  onClick={() => onChange(opt)}
                  className={clsx(
                    "w-full text-left px-4 py-3 border rounded-2xl text-sm transition-all",
                    selected
                      ? "border-primary bg-primary-container/40 font-semibold"
                      : "border-outline-variant hover:border-on-surface-variant",
                  )}
                >
                  {opt}
                </button>
              </li>
            );
          })}
        </ul>
      );
    }

    case "multi": {
      const options = Array.isArray(q.options) ? (q.options as string[]) : [];
      const current = Array.isArray(value) ? value : [];
      function toggle(opt: string) {
        const next = current.includes(opt)
          ? current.filter((v) => v !== opt)
          : [...current, opt];
        onChange(next);
      }
      return (
        <ul className="flex flex-wrap gap-2">
          {options.map((opt) => {
            const selected = current.includes(opt);
            return (
              <li key={opt}>
                <button
                  type="button"
                  onClick={() => toggle(opt)}
                  className={clsx(
                    "px-4 py-2 border rounded-full text-sm transition-all",
                    selected
                      ? "border-primary bg-primary-container/50 font-semibold"
                      : "border-outline-variant hover:border-on-surface-variant",
                  )}
                >
                  {opt}
                </button>
              </li>
            );
          })}
        </ul>
      );
    }

    case "scale": {
      const opts = (q.options ?? {}) as {
        min?: number;
        max?: number;
        minLabel?: string;
        maxLabel?: string;
      };
      const min = opts.min ?? 1;
      const max = opts.max ?? 5;
      const current = typeof value === "number" ? value : Math.round((min + max) / 2);
      const range = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      return (
        <div className="flex flex-col gap-2">
          <div className="flex justify-between gap-2">
            {range.map((n) => {
              const selected = current === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => onChange(n)}
                  className={clsx(
                    "flex-1 aspect-square rounded-2xl border text-base font-semibold transition-all",
                    selected
                      ? "border-primary bg-primary-container/50 scale-105"
                      : "border-outline-variant hover:border-on-surface-variant",
                  )}
                >
                  {n}
                </button>
              );
            })}
          </div>
          {(opts.minLabel || opts.maxLabel) && (
            <div className="flex justify-between text-[11px] uppercase tracking-widest text-outline px-1">
              <span>{opts.minLabel ?? ""}</span>
              <span>{opts.maxLabel ?? ""}</span>
            </div>
          )}
        </div>
      );
    }
  }
}
