/**
 * Partner boutiques — real shops the user can walk into and actually smell
 * a parfum. The recommendation pipeline is biased toward parfums carried
 * by these houses so the user isn't stuck with Fragrantica curiosities
 * they can never test.
 *
 * `domain` MUST match what Tavily returns in `r.url` (no protocol, no www).
 */

export type Boutique = {
  id: string;
  name: string;
  /** Short form for pill badges on the swipe card. */
  shortLabel: string;
  city: string;
  domain: string;
  url: string;
  /** 1-line editorial blurb — shown on the back of the flashcard. */
  note: string;
};

export const BOUTIQUES: Boutique[] = [
  {
    id: "odorare",
    name: "ODORARE Parfumerie",
    shortLabel: "Odorare",
    city: "Villepinte",
    domain: "odorare.fr",
    url: "https://www.odorare.fr/",
    note: "Sélection pointue, orient et parfums puissants.",
  },
  {
    id: "nose",
    name: "Nose",
    shortLabel: "Nose",
    city: "Paris",
    domain: "noseparis.com",
    url: "https://www.noseparis.com/",
    note: "Énorme catalogue niche, diagnostic olfactif sur place.",
  },
  {
    id: "sens-unique",
    name: "Sens Unique",
    shortLabel: "Sens Unique",
    city: "Paris",
    domain: "sensuniqueparis.com",
    url: "https://sensuniqueparis.com/",
    note: "Curation artistique exigeante, très peu de maisons.",
  },
  {
    id: "jovoy",
    name: "Jovoy",
    shortLabel: "Jovoy",
    city: "Paris",
    domain: "jovoyparis.com",
    url: "https://www.jovoyparis.com/",
    note: "Référence mondiale pour les parfums rares et collectionneurs.",
  },
  {
    id: "galeries-lafayette",
    name: "Galeries Lafayette",
    shortLabel: "Galeries Lafayette",
    city: "Paris",
    domain: "galerieslafayette.com",
    url: "https://www.galerieslafayette.com/c/parfum",
    note: "Grand magasin · large sélection grandes maisons et niche.",
  },
  {
    id: "printemps",
    name: "Printemps",
    shortLabel: "Printemps",
    city: "Paris",
    domain: "printemps.com",
    url: "https://www.printemps.com/fr/fr/parfum-femme",
    note: "Grand magasin · découverte niche et exclusivités.",
  },
];

export const BOUTIQUE_IDS = BOUTIQUES.map((b) => b.id);
export const BOUTIQUE_DOMAINS = BOUTIQUES.map((b) => b.domain);

export function findBoutiqueById(id: string): Boutique | undefined {
  return BOUTIQUES.find((b) => b.id === id);
}

export function findBoutiqueByUrl(url: string): Boutique | undefined {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return BOUTIQUES.find(
      (b) => host === b.domain || host.endsWith(`.${b.domain}`),
    );
  } catch {
    return undefined;
  }
}
