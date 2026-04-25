/**
 * Olfactive profile of a user. Stored in Supabase
 * `auth.users.raw_user_meta_data.olfactive_profile` (JSONB) — no separate table
 * needed. The CRM doesn't write to this field.
 *
 * Used for future recommendation logic (Search ranking, Home suggestions,
 * Guided balade route generation, Scent of the Day).
 */

import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { ScentFamily } from "@/lib/fragrances";

export type Moment = "morning" | "day" | "evening" | "night";
export type Occasion = "work" | "date" | "going_out" | "sport" | "casual";
export type Budget = "u100" | "100_200" | "o200" | "any";
export type IntensityPref = "subtle" | "moderate" | "projective";

export type OlfactiveProfile = {
  preferred_families: ScentFamily[];
  intensity_preference: IntensityPref;
  moments: Moment[];
  occasions: Occasion[];
  budget: Budget;
  /** Raw quiz answers from the shared questionnaire (vibe, target, taste,
   *  temperature, intensity, budget, occasion, nope). The legacy fields
   *  above are derived from these on save so older screens keep working. */
  quiz_answers?: Record<string, string | string[]>;
  /** ISO timestamp of when the user completed (or last edited) the wizard. */
  completed_at: string;
};

export const FAMILY_VULGAR: Record<
  ScentFamily,
  { emoji: string; title: string; subtitle: string }
> = {
  Woody: {
    emoji: "🌲",
    title: "Forêt après la pluie",
    subtitle: "Bois humide, mousse, terre",
  },
  Floral: {
    emoji: "🌹",
    title: "Bouquet frais",
    subtitle: "Rose, jasmin, fleur d'oranger",
  },
  Citrus: {
    emoji: "🍋",
    title: "Sorbet citron",
    subtitle: "Bergamote, citron, pamplemousse",
  },
  Amber: {
    emoji: "🍯",
    title: "Miel et vanille",
    subtitle: "Vanille, ambre, caramel",
  },
  Fresh: {
    emoji: "🌊",
    title: "Air de bord de mer",
    subtitle: "Iode, ozone, menthe",
  },
  Spicy: {
    emoji: "🌶️",
    title: "Marché aux épices",
    subtitle: "Poivre, cardamome, cannelle",
  },
  Smoky: {
    emoji: "🔥",
    title: "Feu de bois sous la neige",
    subtitle: "Encens, cuir, fumée",
  },
};

export const INTENSITY_VULGAR: Record<
  IntensityPref,
  { emoji: string; title: string; subtitle: string }
> = {
  subtle: {
    emoji: "🤫",
    title: "Discret",
    subtitle: "Juste pour toi, intime",
  },
  moderate: {
    emoji: "👌",
    title: "Présent",
    subtitle: "Sentu par les gens à proximité",
  },
  projective: {
    emoji: "⚡",
    title: "Marquant",
    subtitle: "Sentu à 3 mètres, on s'en souvient",
  },
};

export const MOMENT_VULGAR: Record<
  Moment,
  { emoji: string; title: string }
> = {
  morning: { emoji: "☀️", title: "Le matin" },
  day: { emoji: "🌤️", title: "La journée" },
  evening: { emoji: "🌙", title: "Le soir" },
  night: { emoji: "🌃", title: "La nuit" },
};

export const OCCASION_VULGAR: Record<
  Occasion,
  { emoji: string; title: string }
> = {
  work: { emoji: "💼", title: "Le boulot" },
  date: { emoji: "❤️", title: "Un date" },
  going_out: { emoji: "🍷", title: "Sortir le soir" },
  sport: { emoji: "🏃", title: "Le sport" },
  casual: { emoji: "🛋️", title: "Tous les jours" },
};

export const BUDGET_VULGAR: Record<
  Budget,
  { title: string; subtitle: string }
> = {
  u100: { title: "< 100 €", subtitle: "Découverte" },
  "100_200": { title: "100 — 200 €", subtitle: "Confort" },
  o200: { title: "> 200 €", subtitle: "Premium" },
  any: { title: "Pas de limite", subtitle: "Sans contrainte" },
};

/* -------------------------------------------------------------------------
 * Read / write helpers
 * --------------------------------------------------------------------- */

export function readProfileFromUser(
  user: User | null,
): OlfactiveProfile | null {
  const meta = user?.user_metadata as
    | { olfactive_profile?: OlfactiveProfile }
    | undefined;
  if (!meta?.olfactive_profile) return null;
  return meta.olfactive_profile;
}

export async function saveProfile(profile: OlfactiveProfile): Promise<void> {
  const { error } = await supabase.auth.updateUser({
    data: { olfactive_profile: profile },
  });
  if (error) throw error;
}
