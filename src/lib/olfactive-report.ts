/**
 * Generate the olfactive profile + sales-pitch report for a fresh client
 * fiche, given their answers to the boutique's dynamic questionnaire.
 *
 * Server-side only. The output shape is what the boutique's "Mes clients"
 * detail page renders, AND what the newsletter scoring uses to match
 * perfumes — so consistency here is critical.
 */

import { chatJSON } from "@/lib/llm";

export type OlfactiveProfile = {
  /** 2-4 dominant olfactive families ranked from strongest. */
  dominant_families: string[];
  /** Composed accord names ("boisé ambré chaud") — not bare families. */
  dominant_accords: string[];
  /** 5-10 specific notes the client is drawn to. */
  key_notes: string[];
  /** Notes the client explicitly rejected, or that clash with the pattern. */
  avoid_notes: string[];
  /** One-sentence personality capture. */
  personality: string;
  /** "discret" | "modéré" | "puissant" — narrative label, also a 1-5 score. */
  intensity_label: string;
  intensity_score: number;
  /** Best-fit occasions / moments to wear. */
  wear_context: string[];
};

export type OlfactiveReport = {
  /** 2-3 sentences for the boutique to read at a glance. */
  summary: string;
  /** Concrete directions the seller can explore in store. */
  recommended_directions: string[];
  /** 1-2 sentences on what to avoid pitching. */
  avoid_pitch: string;
  /** Optional small talk / coaching hooks. */
  coaching_notes: string;
};

type QuestionRef = { id: string; label: string; kind: string };

const SYSTEM_PROMPT = `Tu es un parfumeur expert en analyse olfactive et en conseil boutique de parfumerie de niche.

Tu reçois les réponses d'un client à un questionnaire qui lui a été soumis en boutique (ou via l'app). Tes deux missions :

1. Extraire son ADN olfactif en JSON strict, exploitable par un moteur de recommandation.
2. Rédiger un mini-rapport pour le vendeur en boutique, court et actionnable.

CONTRAINTES :
- Familles olfactives possibles : Floral, Boisé, Oriental, Fruité, Gourmand, Hespéridé, Fougère, Chypré, Aromatique, Cuir, Ambré, Aquatique, Vert, Poudré, Iodé.
- Accords : noms COMPOSÉS et précis (ex : "boisé ambré chaud", "floral poudré frais", "gourmand fumé"). JAMAIS un simple "Woody".
- Notes : SPÉCIFIQUES (ex : "bergamote de Calabre", "iris pallida", "encens d'oliban", "vanille de Madagascar"). PAS des familles.
- intensity_score : 1 (sillage très discret) à 5 (sillage enveloppant / longue tenue).
- Si le client n'a pas répondu à une question, infère prudemment depuis les autres ; si vraiment rien, utilise des valeurs neutres / vides.

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
    "recommended_directions": [],
    "avoid_pitch": "",
    "coaching_notes": ""
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

Questionnaire boutique :
${transcript}

Génère le JSON.`;

  const out = await chatJSON<{ profile: OlfactiveProfile; report: OlfactiveReport }>(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    { temperature: 0.5, maxTokens: 1500 },
  );

  return out;
}
