"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";

/**
 * Mini-lexique accessible depuis le wizard. Affiché en bouton discret,
 * ouvre une feuille avec les termes techniques de parfumerie expliqués
 * en langage de tous les jours — assez simple pour un enfant.
 *
 * Volontairement statique (pas d'IA) : les définitions sont écrites une
 * fois, pas de coût par tap, dispo offline, et on contrôle le ton.
 */

type Entry = { term: string; def: string; example?: string };

const ENTRIES: Entry[] = [
  {
    term: "Famille olfactive",
    def: "Catégorie du parfum, comme un genre de musique. Floral, boisé, sucré, etc.",
  },
  {
    term: "Note",
    def: "Un ingrédient précis qu'on sent dans le parfum.",
    example: "La vanille, la rose, le citron sont des notes.",
  },
  {
    term: "Accord",
    def: "Plusieurs notes mélangées ensemble qui donnent une impression unique.",
    example: "« Vanille gourmande » = vanille + caramel + un peu de fève tonka.",
  },
  {
    term: "Pyramide olfactive",
    def: "Un parfum se découvre en 3 temps : le départ (les premières secondes), le cœur (15-30 minutes après), et le fond (heures plus tard).",
  },
  {
    term: "Sillage",
    def: "L'odeur qu'on laisse derrière soi en marchant. Plus il est fort, plus les gens autour le sentent.",
  },
  {
    term: "Tenue",
    def: "Combien de temps le parfum dure sur la peau avant de disparaître.",
  },
  {
    term: "Floral",
    def: "Sent les fleurs.",
    example: "Rose, jasmin, fleur d'oranger.",
  },
  {
    term: "Boisé",
    def: "Sent le bois.",
    example: "Cèdre, santal — comme une forêt sèche ou une planche en bois.",
  },
  {
    term: "Hespéridé / Citrus",
    def: "Sent les agrumes, le frais.",
    example: "Bergamote, citron, orange, pamplemousse.",
  },
  {
    term: "Oriental / Ambré",
    def: "Sent chaud, épicé, un peu mystérieux.",
    example: "Vanille, ambre, cannelle, encens — comme un bazar.",
  },
  {
    term: "Gourmand",
    def: "Sent bon comme un dessert.",
    example: "Vanille, caramel, chocolat, fève tonka.",
  },
  {
    term: "Chypré",
    def: "Un mélange élégant de bergamote (frais), de fleurs et de mousse de chêne (humus de forêt). Sophistiqué, un peu vintage.",
  },
  {
    term: "Fougère",
    def: "Famille classique pour homme : lavande + bois + un peu d'herbes coupées. Pas de vraie fougère dedans.",
  },
  {
    term: "Aromatique",
    def: "Sent les herbes du jardin.",
    example: "Menthe, basilic, romarin, sauge.",
  },
  {
    term: "Aquatique / Iodé",
    def: "Sent la mer, le frais, l'eau.",
    example: "Embruns, sel, vent du large.",
  },
  {
    term: "Cuir",
    def: "Sent le cuir d'un blouson, d'un canapé ou d'une selle. Souvent un peu fumé.",
  },
  {
    term: "Musqué",
    def: "Sent comme une peau propre, doux et chaud — un confort.",
  },
  {
    term: "Poudré",
    def: "Sent comme une poudre cosmétique, doux et velouté.",
    example: "Iris, violette.",
  },
  {
    term: "Oud",
    def: "Bois rare et précieux d'Asie, à l'odeur très puissante, fumée, animale.",
  },
];

export function PerfumeGlossary() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start flex items-center gap-1.5 px-3 py-1.5 border border-outline-variant rounded-full text-[11px] uppercase tracking-widest text-on-surface-variant hover:border-primary hover:text-primary transition-colors"
      >
        <Icon name="menu_book" size={14} />
        Mini-lexique
      </button>
      {open && <GlossarySheet onClose={() => setOpen(false)} />}
    </>
  );
}

function GlossarySheet({ onClose }: { onClose: () => void }) {
  // Portail vers <body> pour échapper le stacking context des layouts en
  // position:fixed (TopHeader, BottomTabBar, modals parents…).
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-screen-md bg-surface rounded-t-3xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-outline-variant">
          <h2 className="text-lg font-semibold tracking-tight">
            Mini-lexique parfumerie
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="text-outline"
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="overflow-y-auto px-6 py-4">
          <p className="text-xs text-on-surface-variant leading-relaxed mb-4">
            Tous les mots compliqués qu'on entend quand on parle de parfum,
            traduits en langage de tous les jours.
          </p>
          <ul className="flex flex-col gap-3">
            {ENTRIES.map((e) => (
              <li
                key={e.term}
                className="border-l-2 border-primary/60 pl-3 py-0.5"
              >
                <p className="text-sm font-semibold">{e.term}</p>
                <p className="text-sm text-on-surface-variant leading-relaxed mt-0.5">
                  {e.def}
                </p>
                {e.example && (
                  <p className="text-[11px] text-outline italic mt-1">
                    {e.example}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>,
    document.body,
  );
}
