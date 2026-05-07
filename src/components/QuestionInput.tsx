"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";
import type { ShopQuestion } from "@/lib/types";

type Value = string | string[] | number | undefined;

type Props = {
  q: Pick<ShopQuestion, "id" | "label" | "kind" | "options" | "required">;
  value: Value;
  onChange: (v: Value) => void;
};

/**
 * Tap on a chip = SELECTS directly (default behaviour).
 *
 * For technical multi/single questions (label mentioning families, accords,
 * notes), a long-press (or right-click on desktop) opens a sheet with a
 * 1-2 sentence plain-language IA explanation. We use the native
 * `contextmenu` event which fires both on right-click and mobile long-press.
 *
 * A small caption beneath the question advertises the gesture so the
 * boutique's clients know they can ask the IA without disrupting people who
 * already know what "Chypré" means.
 */
export function QuestionInput({ q, value, onChange }: Props) {
  const [explain, setExplain] = useState<{ term: string; text: string; loading: boolean } | null>(null);

  const explainContext: "family" | "accord" | "note" = (() => {
    const l = q.label.toLowerCase();
    if (l.includes("accord")) return "accord";
    if (l.includes("note")) return "note";
    return "family";
  })();
  const isTechnical = /famille|accord|note/.test(q.label.toLowerCase());

  async function fetchExplain(term: string) {
    setExplain({ term, text: "", loading: true });
    try {
      const url = new URL("/api/explain", window.location.origin);
      url.searchParams.set("term", term);
      url.searchParams.set("context", explainContext);
      const res = await fetch(url);
      const json = (await res.json()) as {
        explanation?: string;
        error?: string;
        detail?: string;
      };
      const text =
        json.explanation ??
        (json.detail ? `${json.error ?? "Erreur"} — ${json.detail}` : json.error ?? "Indisponible");
      setExplain({ term, text, loading: false });
    } catch {
      setExplain({ term, text: "Erreur réseau", loading: false });
    }
  }

  /**
   * Wires up the long-press gesture. `contextmenu` fires :
   *   - on desktop : right-click
   *   - on mobile  : ~500ms press-and-hold
   * preventDefault stops the browser's native context menu so we own the UX.
   */
  function explainBindings(opt: string) {
    if (!isTechnical) return {};
    return {
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        fetchExplain(opt);
      },
    };
  }

  function ExplainSheet() {
    if (!explain) return null;
    return (
      <div
        className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
        onClick={() => setExplain(null)}
      >
        <div
          className="w-full max-w-screen-md bg-surface rounded-t-3xl p-6 flex flex-col gap-4"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{explain.term}</h3>
            <button
              onClick={() => setExplain(null)}
              aria-label="Fermer"
              className="text-outline"
            >
              <Icon name="close" />
            </button>
          </header>

          {explain.loading ? (
            <p className="text-sm text-on-surface-variant flex items-center gap-2">
              <Icon name="progress_activity" size={16} className="animate-spin" />
              L'IA cherche une explication simple…
            </p>
          ) : (
            <p className="text-sm leading-relaxed">{explain.text}</p>
          )}

          <button
            type="button"
            onClick={() => setExplain(null)}
            className="w-full py-3 rounded-full text-sm font-bold uppercase tracking-widest border border-outline-variant"
          >
            Fermer
          </button>
        </div>
      </div>
    );
  }

  /**
   * Discreet caption shown beneath technical multi/single questions to teach
   * the long-press gesture. Only rendered for technical questions.
   */
  function ExplainHint() {
    if (!isTechnical) return null;
    return (
      <p className="text-[11px] text-outline mt-1 leading-snug">
        Tape long sur un mot que tu ne comprends pas pour que l'IA te l'explique.
      </p>
    );
  }

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
        <>
          <ul className="flex flex-col gap-2">
            {options.map((opt) => {
              const selected = value === opt;
              return (
                <li key={opt}>
                  <button
                    type="button"
                    onClick={() => onChange(opt)}
                    {...explainBindings(opt)}
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
          <ExplainHint />
          <ExplainSheet />
        </>
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
        <>
          <ul className="flex flex-wrap gap-2">
            {options.map((opt) => {
              const selected = current.includes(opt);
              return (
                <li key={opt}>
                  <button
                    type="button"
                    onClick={() => toggle(opt)}
                    {...explainBindings(opt)}
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
          <ExplainHint />
          <ExplainSheet />
        </>
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
