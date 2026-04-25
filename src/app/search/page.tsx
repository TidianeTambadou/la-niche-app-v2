"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { ErrorBubble } from "@/components/ErrorBubble";
import { PerfumeCard } from "@/components/PerfumeCard";
import {
  searchFragrances,
  useData,
  useFragrances,
} from "@/lib/data";

const SUGGESTIONS = [
  "boisé chaud élégant hiver",
  "frais minéral pluie",
  "ambré soir chaud",
  "fumé intense nuit",
  "floral poudré intime",
];

export default function SearchPage() {
  const { loading, error } = useData();
  const fragrances = useFragrances();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  const results = useMemo(() => {
    if (!submitted) return [];
    return searchFragrances(fragrances, submitted);
  }, [submitted, fragrances]);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSubmitted(q);
  }

  function pickSuggestion(s: string) {
    setQuery(s);
    setSubmitted(s);
  }

  return (
    <div className="px-6 pt-4 pb-12">
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2 h-2 bg-primary rounded-full" />
          <span className="text-[10px] uppercase tracking-[0.2em] font-medium">
            Concierge La Niche
          </span>
        </div>
        <h1 className="text-4xl font-light tracking-tighter leading-none mb-4">
          Décris ton
          <br />
          <span className="font-bold">atmosphère</span>.
        </h1>
        <p className="text-sm text-on-surface-variant leading-relaxed max-w-md">
          Notre moteur traduit des préférences abstraites en formules olfactives.
          Décris une mémoire, une texture, ou une humeur.
        </p>
      </section>

      {error && (
        <div className="mb-6">
          <ErrorBubble
            detail={error}
            context="Search · chargement catalogue"
            variant="block"
          />
        </div>
      )}

      {/* Concierge greeting */}
      {!submitted && (
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <Icon name="face_6" size={16} />
            <span className="text-[10px] uppercase tracking-widest font-bold">
              Concierge
            </span>
          </div>
          <p className="text-base font-light leading-relaxed text-on-surface-variant">
            Bonjour. Pour commencer, comment décrirais-tu l&apos;atmosphère que tu
            souhaites habiter ?
          </p>
        </section>
      )}

      {/* User echo + analysis */}
      {submitted && (
        <section className="mb-10">
          <div className="flex flex-col gap-4 items-end mb-8">
            <div className="flex items-center gap-3">
              <span className="text-[10px] uppercase tracking-widest font-bold text-outline">
                Toi
              </span>
              <Icon name="person" size={16} className="text-outline" />
            </div>
            <div className="text-base font-light leading-relaxed text-on-background text-right italic max-w-md">
              &laquo;&nbsp;{submitted}&nbsp;&raquo;
            </div>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <Icon name="face_6" size={16} />
            <span className="text-[10px] uppercase tracking-widest font-bold">
              Concierge
            </span>
          </div>
          {results.length > 0 ? (
            <p className="text-sm text-on-surface-variant leading-relaxed mb-6">
              J&apos;ai isolé{" "}
              <span className="text-on-background font-medium">
                {results.length} formulation{results.length > 1 ? "s" : ""}
              </span>{" "}
              alignées avec ta requête. Affine en ajoutant des mots, ou explore
              les détails.
            </p>
          ) : (
            <p className="text-sm text-on-surface-variant leading-relaxed mb-6">
              Aucune correspondance pour « {submitted} » dans le stock actuel.
              Essaie avec un nom de marque ou de parfum présent en boutique.
            </p>
          )}

          {results.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {results.slice(0, 6).map((f, i) => (
                <PerfumeCard
                  key={f.key}
                  fragrance={f}
                  variant="feature"
                  matchScore={Math.max(0.55, 0.98 - i * 0.06)}
                  origin="search"
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Input */}
      <form onSubmit={submit} className="sticky bottom-24 bg-background pt-4">
        <div className="flex items-end gap-3 border-b-2 border-primary pb-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Décris une atmosphère…"
            className="w-full bg-transparent border-none outline-none text-base font-light placeholder:text-outline/60 py-1"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={!query.trim()}
            className="bg-primary text-on-primary w-11 h-11 flex items-center justify-center rounded-full active:scale-95 transition-transform disabled:opacity-30"
            aria-label="Envoyer"
          >
            <Icon name="arrow_forward" size={18} />
          </button>
        </div>

        <div className="flex gap-2 mt-3 overflow-x-auto hide-scrollbar -mx-6 px-6 pb-1">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => pickSuggestion(s)}
              className="px-3 py-1.5 rounded-full border border-outline-variant text-[10px] uppercase tracking-widest whitespace-nowrap hover:bg-primary hover:text-on-primary hover:border-primary transition-all"
            >
              {s}
            </button>
          ))}
        </div>
      </form>

      {/* Empty-state catalog browse */}
      {!submitted && (
        <section className="mt-10">
          <h2 className="text-[10px] uppercase tracking-[0.2em] font-bold mb-4">
            Catalogue
          </h2>
          {loading ? (
            <div className="grid grid-cols-2 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="aspect-[4/5] bg-surface-container-low animate-pulse"
                />
              ))}
            </div>
          ) : fragrances.length === 0 ? (
            <div className="border border-outline-variant/40 bg-surface-container-low p-6 text-center">
              <p className="text-xs text-on-surface-variant">
                Aucun parfum dans le stock des boutiques. Ajoute du stock dans le
                CRM pour les voir apparaître ici.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {fragrances.slice(0, 4).map((f) => (
                <PerfumeCard
                  key={f.key}
                  fragrance={f}
                  variant="feature"
                  origin="search"
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
