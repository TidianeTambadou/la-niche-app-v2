/**
 * Type re-exports + static catalog (body zones, scent families).
 * The real fragrance + shop data comes from `@/lib/data` (Supabase-backed).
 *
 * NOTE: this file used to host a mock FRAGRANCES array. It now only declares
 * static metadata that doesn't live in the database. Use the `useFragrances`
 * / `useFragrance` hooks from `@/lib/data` for actual fragrance data.
 */

export type {
  Fragrance,
  Availability,
} from "@/lib/data";

export {
  fragranceKey,
  slugify,
  searchFragrances,
  scentOfTheDay,
} from "@/lib/data";

export type ScentFamily =
  | "Woody"
  | "Floral"
  | "Citrus"
  | "Amber"
  | "Fresh"
  | "Spicy"
  | "Smoky";

export type BodyZone =
  // Head / neck
  | "behind-ear-left"
  | "behind-ear-right"
  | "neck-left"
  | "neck-right"
  | "throat"
  | "nape"
  // Torso
  | "chest"
  // Arms
  | "inner-elbow-left"
  | "inner-elbow-right"
  | "outer-elbow-left"
  | "outer-elbow-right"
  // Hands
  | "wrist-left"
  | "wrist-right"
  | "back-of-hand-left"
  | "back-of-hand-right";

export const BODY_ZONE_LABELS: Record<BodyZone, string> = {
  "behind-ear-left": "Derrière l'oreille — gauche",
  "behind-ear-right": "Derrière l'oreille — droite",
  "neck-left": "Cou — gauche",
  "neck-right": "Cou — droite",
  throat: "Creux du cou",
  nape: "Nuque",
  chest: "Buste",
  "inner-elbow-left": "Pli du coude — gauche",
  "inner-elbow-right": "Pli du coude — droite",
  "outer-elbow-left": "Dos du coude — gauche",
  "outer-elbow-right": "Dos du coude — droite",
  "wrist-left": "Poignet — gauche",
  "wrist-right": "Poignet — droite",
  "back-of-hand-left": "Dos de la main — gauche",
  "back-of-hand-right": "Dos de la main — droite",
};
