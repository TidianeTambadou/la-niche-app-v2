/**
 * Generate the olfactive profile + sales-pitch report for a fresh client
 * fiche, given their answers to the boutique's dynamic questionnaire.
 *
 * Server-side only. Output mirrors the v1 "FriendReport" format (a real
 * actionable seller's brief) but feeds on questionnaire QCM answers
 * instead of a swipe session :
 *
 *   - summary             : 1 phrase claire
 *   - signature           : 2-3 lines on the olfactive personality
 *   - loved_references    : 3-5 perfume references the AI infers from
 *                           the picked notes/families/accords, with
 *                           1 sentence why each fits.
 *   - rejected_references : 2-3 perfume styles to avoid pitching.
 *   - sales_advice        : 1 concrete paragraph on directions to take.
 *
 * The olfactive_profile is the structured output used by the newsletter
 * scoring engine — same shape as v1's "DNA".
 */

import { chatJSON } from "@/lib/llm";

export type OlfactiveProfile = {
  /** 2-4 dominant olfactive families ranked from strongest. */
  dominant_families: string[];
  /** Composed accord names ("boisé ambré chaud") — not bare families. */
  dominant_accords: string[];
  /** 5-10 specific notes the client is drawn to. */
  key_notes: string[];
  /** Notes the client explicitly rejected. */
  avoid_notes: string[];
  /** One-sentence personality capture. */
  personality: string;
  /** "discret" | "modéré" | "puissant" — narrative label, also a 1-5 score. */
  intensity_label: string;
  intensity_score: number;
  /** Best-fit occasions / moments to wear. */
  wear_context: string[];
};

/** Reference perfume cited in the report — same shape as v1 FriendReport. */
export type PerfumeReference = {
  brand: string;
  name: string;
  family: string;
  why: string;
};

export type OlfactiveReport = {
  /** 1 sentence : "Cherche un parfum X pour Y". */
  summary: string;
  /** 2-3 lines : accords, notes phares, personnalité. */
  signature: string;
  /** 3-5 perfume references that should appeal to this client. */
  loved_references: PerfumeReference[];
  /** 2-3 perfume styles to avoid pitching. */
  rejected_references: PerfumeReference[];
  /** 1 paragraph of concrete pitch directions. */
  sales_advice: string;
};

type QuestionRef = { id: string; label: string; kind: string };

const SYSTEM_PROMPT = `Tu reçois les réponses d'un client à un questionnaire QCM en boutique. Tu rédiges DEUX choses :

1. PROFIL OLFACTIF structuré (utilisé par un moteur de matching)
2. RAPPORT VENDEUR concret et actionnable (langage direct, factuel, pas de poésie, pas de jargon marketing — un vendeur doit comprendre en 10 secondes ce que le client cherche)

CONTRAINTES PROFIL :
- Familles olfactives possibles : Floral, Boisé, Oriental, Ambré, Hespéridé, Fougère, Chypré, Cuir, Gourmand, Aromatique, Aquatique, Poudré, Vert, Iodé, Fruité, Musqué.
- Accords : noms COMPOSÉS ("boisé ambré chaud", "floral poudré frais"). JAMAIS un simple "Woody".
- Notes : SPÉCIFIQUES (ex : "bergamote de Calabre", "iris pallida", "encens d'oliban"). PAS des familles.
- intensity_score : 1 (très discret) à 5 (enveloppant).

CONTRAINTES RAPPORT :
- summary : UNE phrase qui dit clairement le profil et l'occasion ("Cherche un parfum boisé épicé pour le quotidien" — pas plus).
- signature : 2-3 lignes — cite les accords dominants, les notes phares, la personnalité olfactive.
- loved_references : 3-5 PARFUMS RÉELS de maisons connues (mainstream OU niche) qui collent à ce profil. Pour chaque : { brand, name, family, why } où "why" est UNE phrase concrète qui cite 1-2 notes spécifiques du parfum qui matchent le client.
- rejected_references : 2-3 STYLES ou PARFUMS à éviter de proposer, expliqués brièvement (pourquoi ça coince — note rebutée, intensité, etc.).
- sales_advice : 1 paragraphe concret — directions, maisons à privilégier, gamme de prix indicative, intensité à viser, ce qu'il faut éviter de pitcher d'entrée.
- Tutoie le vendeur. Direct, pro, jamais "peut-être" ou "possiblement".
- Cite des MAISONS et des NOTES précises.

Si le client a peu répondu, infère prudemment depuis les réponses disponibles ; ne mens pas mais sois affirmé.

Retourne UNIQUEMENT ce JSON (rien avant, rien après) :
{
  "profile": {
    "dominant_families": [],
    "dominant_accords": [],
    "key_notes": [],
    "avoid_notes": [],
    "personality": "",
    "intensity_label": "",
    "intensity_score": 3,
    "wear_context": []
  },
  "report": {
    "summary": "",
    "signature": "",
    "loved_references": [{"brand":"","name":"","family":"","why":""}],
    "rejected_references": [{"brand":"","name":"","family":"","why":""}],
    "sales_advice": ""
  }
}`;

export async function buildOlfactiveReport(
  questions: QuestionRef[],
  answers: Record<string, unknown>,
  client: { firstName: string; lastName: string },
): Promise<{ profile: OlfactiveProfile; report: OlfactiveReport }> {
  const transcript = questions
    .map((q) => {
      const a = answers[q.id];
      const formatted =
        a == null
          ? "(pas de réponse)"
          : Array.isArray(a)
            ? a.join(", ")
            : typeof a === "object"
              ? JSON.stringify(a)
              : String(a);
      return `Q (${q.kind}) : ${q.label}\nR : ${formatted}`;
    })
    .join("\n\n");

  const userPrompt = `Client : ${client.firstName} ${client.lastName}

Réponses au questionnaire :
${transcript}

Génère le JSON.`;

  const out = await chatJSON<{ profile: OlfactiveProfile; report: OlfactiveReport }>(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    { temperature: 0.5, maxTokens: 2000 },
  );

  return out;
}
