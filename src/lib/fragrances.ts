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
  | "neck-left"
  | "neck-right"
  | "wrist-left"
  | "wrist-right"
  | "chest"
  | "inner-elbow-left"
  | "inner-elbow-right"
  | "behind-ear-left"
  | "behind-ear-right";

export const BODY_ZONE_LABELS: Record<BodyZone, string> = {
  "neck-left": "Cou — gauche",
  "neck-right": "Cou — droite",
  "wrist-left": "Poignet — gauche",
  "wrist-right": "Poignet — droite",
  chest: "Buste",
  "inner-elbow-left": "Pli du coude — gauche",
  "inner-elbow-right": "Pli du coude — droite",
  "behind-ear-left": "Derrière l'oreille — gauche",
  "behind-ear-right": "Derrière l'oreille — droite",
};
