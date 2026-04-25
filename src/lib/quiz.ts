/**
 * Shared quiz definitions used by both:
 *   - "Univers olfactif" (onboarding — perspective "self")
 *   - "Pour un ami"      (recommendations friend mode — perspective "friend")
 *
 * Same eight questions in both flows so the recommendation engine receives
 * comparable signal regardless of who's filling it in. Question wording adapts
 * to the perspective (tu vs il), but the option values are stable across both
 * so downstream prompt builders don't have to branch.
 */

import type { Budget, Moment, Occasion, IntensityPref } from "@/lib/profile";
import type { ScentFamily } from "@/lib/fragrances";

export type QuizAnswer = string | string[];

export type QuizOption = { value: string; label: string };

export type QuizQuestionDef = {
  id: string;
  question: { self: string; friend: string };
  subtitle?: { self: string; friend: string };
  options: QuizOption[];
  /** When true, the answer is `string[]` and the user can tick several
   *  options. The flow shows a "Continuer" button to commit. */
  multi?: boolean;
};

export type QuizPerspective = "self" | "friend";

export const QUIZ_QUESTIONS: QuizQuestionDef[] = [
  {
    id: "vibe",
    question: {
      self: "Tu as quelle vibe générale ?",
      friend: "Ton pote a quelle vibe générale ?",
    },
    subtitle: {
      self: "Ton style global, pas le parfum",
      friend: "Le style global, pas le parfum",
    },
    options: [
      { value: "fresh-young", label: "Jeune frais — street, décontracté" },
      { value: "classy-pro", label: "Classique distingué — pro chic" },
      { value: "rock-nightlife", label: "Rockstar — ambiance nuit, clubbing" },
      { value: "bohemian", label: "Bohème, naturel, zéro prise de tête" },
    ],
  },
  {
    id: "target",
    question: {
      self: "Tu veux plaire à qui surtout ?",
      friend: "Il veut plaire à qui surtout ?",
    },
    options: [
      { value: "women", label: "Aux femmes — faire tourner la tête" },
      { value: "men", label: "Aux hommes" },
      { value: "everyone", label: "Tout le monde, bonne vibe globale" },
      {
        value: "self",
        label: "À moi/lui d'abord — faut kiffer avant tout",
      },
    ],
  },
  {
    id: "temperature",
    question: {
      self: "Plutôt chaud ou plutôt frais ?",
      friend: "Plutôt chaud ou plutôt frais ?",
    },
    options: [
      { value: "cool", label: "Frais — agrumes, menthe, marin" },
      { value: "warm", label: "Chaud — cuir, épices, vanille" },
      { value: "balanced", label: "Entre les deux, selon l'humeur" },
    ],
  },
  {
    id: "taste",
    question: {
      self: "Qu'est-ce qui te fait kiffer ?",
      friend: "Qu'est-ce qui le fait kiffer ?",
    },
    options: [
      { value: "sweet", label: "Sucré / gourmand (vanille, caramel)" },
      { value: "woody", label: "Boisé / sec (cèdre, santal)" },
      { value: "floral", label: "Floral (rose, jasmin, iris)" },
      { value: "citrus", label: "Citrus / frais (bergamote, citron)" },
      { value: "smoky", label: "Fumé / mystérieux (oud, encens, tabac)" },
      { value: "leather", label: "Cuir, musqué, animal" },
    ],
  },
  {
    id: "intensity",
    question: {
      self: "Tu veux sentir comment ?",
      friend: "Il veut sentir comment ?",
    },
    options: [
      { value: "subtle", label: "Discret — sillage intime" },
      { value: "moderate", label: "Présent — sentu à 1 mètre" },
      { value: "projective", label: "Marquant — on se retourne" },
    ],
  },
  {
    id: "budget",
    question: {
      self: "Budget par flacon ?",
      friend: "Budget par flacon pour ce parfum ?",
    },
    subtitle: {
      self: "Choix multiples — coche toutes les fourchettes qui te vont",
      friend: "Choix multiples — coche tout ce qui peut convenir",
    },
    multi: true,
    options: [
      { value: "u100", label: "Moins de 100 €" },
      { value: "100_200", label: "Entre 100 et 200 €" },
      { value: "o200", label: "Plus de 200 €" },
      { value: "any", label: "Aucune limite" },
    ],
  },
  {
    id: "occasion",
    question: {
      self: "Tu le porteras surtout pour quoi ?",
      friend: "Il le portera surtout pour quoi ?",
    },
    options: [
      { value: "daily", label: "Tous les jours / casual" },
      { value: "work", label: "Bosser, réunions, pro" },
      { value: "date", label: "Dates, séduire" },
      { value: "night", label: "Soirées, clubs, la nuit" },
    ],
  },
  {
    id: "nope",
    question: {
      self: "Qu'est-ce que tu DÉTESTES ?",
      friend: "Qu'est-ce qu'il DÉTESTE ?",
    },
    subtitle: {
      self: "Pour qu'on te laisse tranquille avec ça",
      friend: "Pour éviter les cata au comptoir",
    },
    options: [
      { value: "too_sweet", label: "Trop sucré / écœurant" },
      { value: "too_floral", label: "Trop fleuri / mémé" },
      { value: "too_aquatic", label: "Trop marin / savonneux / eau de bébé" },
      { value: "too_animal", label: "Trop animal / cuir lourd" },
      { value: "none", label: "Rien de particulier" },
    ],
  },
];

/** Human-readable French snippet per (questionId, optionValue). Used to build
 *  the profile context string sent to the recommendation engine. */
export const QUIZ_LABEL: Record<string, Record<string, string>> = {
  vibe: {
    "fresh-young": "jeune frais, ambiance street décontractée",
    "classy-pro": "classique distingué, pro chic",
    "rock-nightlife": "rockstar nocturne, clubbing",
    bohemian: "bohème, naturel, effortless",
  },
  target: {
    women: "séduire les femmes, faire tourner la tête",
    men: "plaire aux hommes",
    everyone: "dégager une bonne vibe générale",
    self: "se plaire à soi-même avant tout",
  },
  temperature: {
    cool: "frais (agrumes, menthe, marin)",
    warm: "chaud (cuir, épices, vanille)",
    balanced: "équilibré chaud/frais selon le jour",
  },
  taste: {
    sweet: "gourmand sucré (vanille, caramel)",
    woody: "boisé sec (cèdre, santal)",
    floral: "floral (rose, jasmin, iris)",
    citrus: "citrus frais (bergamote, citron)",
    smoky: "fumé mystérieux (oud, encens, tabac)",
    leather: "cuir, musqué, animal",
  },
  intensity: {
    subtle: "discret, sillage intime",
    moderate: "présent, sillage modéré",
    projective: "projectif, marquant à distance",
  },
  budget: {
    u100: "moins de 100 €",
    "100_200": "100 à 200 €",
    o200: "plus de 200 €",
    any: "sans limite",
  },
  occasion: {
    daily: "usage quotidien, casual",
    work: "bureau, rendez-vous professionnels",
    date: "dates, séduction",
    night: "soirées, clubs, nuit",
  },
  nope: {
    too_sweet: "trop sucré, écœurant, gourmand envahissant",
    too_floral: "trop fleuri, style mémé",
    too_aquatic: "trop marin, savonneux, eau de bébé",
    too_animal: "trop animal, cuir lourd",
    none: "aucun tabou particulier",
  },
};

const SECTION_LABELS: Record<string, string> = {
  vibe: "Vibe générale",
  target: "Veut plaire à",
  temperature: "Préférence température",
  taste: "Goûts olfactifs clés",
  intensity: "Sillage recherché",
  budget: "Budgets acceptés",
  occasion: "Occasion principale",
  nope: "À éviter absolument",
};

const PERSPECTIVE_HEADER: Record<QuizPerspective, string> = {
  self: "PROFIL OLFACTIF DE L'UTILISATEUR (quiz auto-rempli) :",
  friend:
    "PROFIL OLFACTIF DE LA PERSONNE (quiz réalisé par un proche, mode « pour un ami ») :",
};

/** Format a quiz answers map into the French context string the
 *  recommendation agent expects. */
export function buildQuizContext(
  answers: Record<string, QuizAnswer>,
  perspective: QuizPerspective,
): string {
  const lines: string[] = [PERSPECTIVE_HEADER[perspective]];
  for (const q of QUIZ_QUESTIONS) {
    const v = answers[q.id];
    if (!v) continue;
    const values = Array.isArray(v) ? v : [v];
    const readable = values
      .map((val) => QUIZ_LABEL[q.id]?.[val])
      .filter(Boolean)
      .join(", ");
    if (readable) lines.push(`- ${SECTION_LABELS[q.id] ?? q.id} : ${readable}`);
  }
  return lines.join("\n");
}

/* -------------------------------------------------------------------------
 * Legacy bridge — derive the older OlfactiveProfile fields (used by Home,
 * ConciergeWidget, recommendations swipe) from quiz answers so we can swap
 * the onboarding without breaking screens that still read those fields.
 * --------------------------------------------------------------------- */

const TASTE_TO_FAMILY: Record<string, ScentFamily | null> = {
  sweet: "Amber",
  woody: "Woody",
  floral: "Floral",
  citrus: "Citrus",
  smoky: "Smoky",
  leather: "Smoky",
};

const TEMP_TO_FAMILY: Record<string, ScentFamily | null> = {
  cool: "Fresh",
  warm: "Spicy",
  balanced: null,
};

const OCCASION_MAP: Record<string, Occasion | null> = {
  daily: "casual",
  work: "work",
  date: "date",
  night: "going_out",
};

const INTENSITY_MAP: Record<string, IntensityPref | null> = {
  subtle: "subtle",
  moderate: "moderate",
  projective: "projective",
};

const BUDGET_RANK: Budget[] = ["u100", "100_200", "o200", "any"];

function pickBudget(values: string[] | undefined): Budget {
  if (!values || values.length === 0) return "any";
  // If multiple, pick the most generous (highest in BUDGET_RANK).
  let best: Budget = "u100";
  for (const v of values) {
    if (BUDGET_RANK.includes(v as Budget)) {
      const idx = BUDGET_RANK.indexOf(v as Budget);
      if (idx > BUDGET_RANK.indexOf(best)) best = v as Budget;
    }
  }
  return best;
}

export function deriveLegacyProfile(
  answers: Record<string, QuizAnswer>,
): {
  preferred_families: ScentFamily[];
  intensity_preference: IntensityPref;
  moments: Moment[];
  occasions: Occasion[];
  budget: Budget;
} {
  const families = new Set<ScentFamily>();
  const taste = answers["taste"];
  if (typeof taste === "string") {
    const f = TASTE_TO_FAMILY[taste];
    if (f) families.add(f);
  }
  const temp = answers["temperature"];
  if (typeof temp === "string") {
    const f = TEMP_TO_FAMILY[temp];
    if (f) families.add(f);
  }

  const intensityVal = answers["intensity"];
  const intensity_preference =
    (typeof intensityVal === "string" ? INTENSITY_MAP[intensityVal] : null) ??
    "moderate";

  const occasions: Occasion[] = [];
  const occVal = answers["occasion"];
  if (typeof occVal === "string") {
    const m = OCCASION_MAP[occVal];
    if (m) occasions.push(m);
  }

  const budgetVal = answers["budget"];
  const budgetArr = Array.isArray(budgetVal)
    ? budgetVal
    : typeof budgetVal === "string"
      ? [budgetVal]
      : undefined;
  const budget = pickBudget(budgetArr);

  return {
    preferred_families: Array.from(families),
    intensity_preference,
    moments: [],
    occasions,
    budget,
  };
}
