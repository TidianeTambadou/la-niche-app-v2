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
 * Renders the right input control for a given question kind. Centralised
 * here so the wizard, the user-side form, and the questions preview all
 * stay visually consistent.
 *
 * On `single` and `multi` questions, every option carries a small (?)
 * button. Tapping it opens an explainer sheet that fetches a 1-2 sentence
 * plain-language explanation from /api/explain. Lets debutants understand
 * a "Chypré" or "Hespéridé" without leaving the form. Explanations are
 * cached server-side so subsequent taps are free.
 */
export function QuestionInput({ q, value, onChange }: Props) {
  const [explain, setExplain] = useState<{ term: string; text: string } | null>(null);
  const [loadingTerm, setLoadingTerm] = useState<string | null>(null);

  // Heuristic : on the "accords" question we tag the context as "accord"
  // so the LLM knows it should describe a composite, not a single family.
  const explainContext: "family" | "accord" =
    q.label.toLowerCase().includes("accord") ? "accord" : "family";

  async function openExplain(term: string) {
    setLoadingTerm(term);
    setExplain({ term, text: "" });
    try {
      const url = new URL("/api/explain", window.location.origin);
      url.searchParams.set("term", term);
      url.searchParams.set("context", explainContext);
      const res = await fetch(url);
      const json = (await res.json()) as { explanation?: string; error?: string };
      setExplain({ term, text: json.explanation ?? json.error ?? "Indisponible" });
    } catch {
      setExplain({ term, text: "Erreur réseau" });
    } finally {
      setLoadingTerm(null);
    }
  }

  function ExplainSheet() {
    if (!explain) return null;
    return (
      <div
        className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
        onClick={() => setExplain(null)}
      >
        <div
          className="w-full max-w-screen-md bg-surface rounded-t-3xl p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold">{explain.term}</h3>
            <button
              onClick={() => setExplain(null)}
              aria-label="Fermer"
              className="text-outline"
            >
              <Icon name="close" />
            </button>
          </header>
          {explain.text ? (
            <p className="text-sm leading-relaxed">{explain.text}</p>
          ) : (
            <p className="text-sm text-on-surface-variant flex items-center gap-2">
              <Icon name="progress_activity" size={16} className="animate-spin" />
              L'IA cherche…
            </p>
          )}
        </div>
      </div>
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
                <li key={opt} className="flex items-stretch gap-2">
                  <button
                    type="button"
                    onClick={() => onChange(opt)}
                    className={clsx(
                      "flex-1 text-left px-4 py-3 border rounded-2xl text-sm transition-all",
                      selected
                        ? "border-primary bg-primary-container/40 font-semibold"
                        : "border-outline-variant hover:border-on-surface-variant",
                    )}
                  >
                    {opt}
                  </button>
                  <ExplainButton
                    term={opt}
                    loading={loadingTerm === opt}
                    onClick={() => openExplain(opt)}
                  />
                </li>
              );
            })}
          </ul>
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
                <li key={opt} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => toggle(opt)}
                    className={clsx(
                      "pl-4 pr-2 py-2 border rounded-l-full text-sm transition-all flex items-center gap-2",
                      selected
                        ? "border-primary bg-primary-container/50 font-semibold"
                        : "border-outline-variant hover:border-on-surface-variant",
                    )}
                  >
                    {opt}
                  </button>
                  <ExplainButton
                    term={opt}
                    loading={loadingTerm === opt}
                    onClick={() => openExplain(opt)}
                    variant="chip"
                  />
                </li>
              );
            })}
          </ul>
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

function ExplainButton({
  loading,
  onClick,
  variant = "stack",
}: {
  term: string;
  loading: boolean;
  onClick: () => void;
  variant?: "stack" | "chip";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Que veut dire ce mot ?"
      className={clsx(
        "border border-l-0 border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary transition-colors flex items-center justify-center",
        variant === "chip"
          ? "px-2 py-2 rounded-r-full"
          : "px-3 rounded-2xl",
      )}
    >
      <Icon name={loading ? "progress_activity" : "help_outline"} size={16} className={loading ? "animate-spin" : ""} />
    </button>
  );
}
