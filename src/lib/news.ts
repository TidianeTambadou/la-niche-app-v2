/**
 * Curated niche-perfume news rail. Static data for now — no API key wired.
 *
 * To replace with a live source later:
 *   - RSS feeds (Auparfum, Fragrantica, Perfumesphere) — but most are CORS-blocked
 *     so call them from a Next.js route handler `/api/news` server-side.
 *   - A simple Notion / Sanity / Airtable backend that the marketing team curates.
 *   - The CRM if you add a `news` table later.
 *
 * Keep the items short: one image, one title, one excerpt. The Home rail is a
 * teaser, not a reader.
 */

export type NewsTag =
  | "Drop"
  | "Nouveauté"
  | "Exclu"
  | "Évènement"
  | "Interview"
  | "Maison";

export type NewsItem = {
  id: string;
  title: string;
  excerpt: string;
  imageUrl: string;
  source: string;
  /** ISO date — used for sorting + display. */
  publishedAt: string;
  /** External link (article, drop page) or null. */
  url: string | null;
  tags: NewsTag[];
};

const I = (seed: string) =>
  `https://placehold.co/800x500/0a0a0a/e2e2e2?font=montserrat&text=${encodeURIComponent(seed)}`;

const NOW = "2026-04-22T10:00:00Z";

export const NEWS: NewsItem[] = [
  {
    id: "n-001",
    title: "Le Labo dévoile une eau exclusive Paris pour le mois d'avril",
    excerpt:
      "City Exclusive limitée à 600 flacons, disponible uniquement en boutique du Marais.",
    imageUrl: I("LE LABO\\nCITY EXCLUSIVE"),
    source: "La Niche",
    publishedAt: "2026-04-20T08:00:00Z",
    url: null,
    tags: ["Exclu", "Drop"],
  },
  {
    id: "n-002",
    title: "Maison Crivelli ouvre les portes de son atelier à Florence",
    excerpt:
      "Visites guidées sur rendez-vous : extraction CO₂ supercritique en démo.",
    imageUrl: I("MAISON CRIVELLI\\nATELIER"),
    source: "La Niche",
    publishedAt: "2026-04-18T08:00:00Z",
    url: null,
    tags: ["Évènement", "Maison"],
  },
  {
    id: "n-003",
    title: "Frédéric Malle : interview du nez derrière la collection 2026",
    excerpt:
      "Sur les origines du brief « béton humide » et le travail autour de la géosmine.",
    imageUrl: I("FRÉDÉRIC MALLE\\nINTERVIEW"),
    source: "La Niche",
    publishedAt: "2026-04-15T08:00:00Z",
    url: null,
    tags: ["Interview"],
  },
  {
    id: "n-004",
    title: "Atelier Materi annonce un drop confidentiel pour mai",
    excerpt:
      "Un cuir/safran travaillé en absolu, distribution sur invitation uniquement.",
    imageUrl: I("ATELIER MATERI\\nDROP CONFIDENTIEL"),
    source: "La Niche",
    publishedAt: "2026-04-12T08:00:00Z",
    url: null,
    tags: ["Drop", "Exclu"],
  },
  {
    id: "n-005",
    title: "Bruno Fazzolari présente une rétrospective olfactive à Lyon",
    excerpt:
      "Six pièces inédites + un livret tiré à 200 exemplaires numérotés.",
    imageUrl: I("BRUNO FAZZOLARI\\nLYON"),
    source: "La Niche",
    publishedAt: "2026-04-08T08:00:00Z",
    url: null,
    tags: ["Évènement"],
  },
  {
    id: "n-006",
    title: "Nishane : la collection Hacivat fête ses 10 ans",
    excerpt:
      "Réédition en parfum extrait, packaging revisité par Daniel Pop.",
    imageUrl: I("NISHANE\\nHACIVAT 10"),
    source: "La Niche",
    publishedAt: "2026-04-05T08:00:00Z",
    url: null,
    tags: ["Nouveauté", "Maison"],
  },
];

export function latestNews(limit?: number): NewsItem[] {
  const sorted = [...NEWS].sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
  return typeof limit === "number" ? sorted.slice(0, limit) : sorted;
}

export function formatNewsDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date(NOW);
  const days = Math.round(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  if (days < 7) return `Il y a ${days} j`;
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
}
