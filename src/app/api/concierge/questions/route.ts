/**
 * /api/concierge/questions
 *
 *   POST { transcript: string, questions: ShopQuestion[] }
 *
 *   Receives the boutique's natural-language instruction (typed or voice
 *   transcribed) plus the current list of shop_questions, and returns a
 *   list of operations the UI can apply :
 *     - update   : modify a question's label/kind/options/required
 *     - create   : add a new question (positioned at the end ; UI can
 *                  drag-drop afterwards)
 *     - delete   : remove a question
 *     - reorder  : rewrite full positions order
 *
 *   The route is read-only — it never touches the DB itself. Application
 *   is left to the client which calls the existing CRUD endpoints with
 *   the user's credentials. That keeps the LLM out of the security loop.
 */

import type { NextRequest } from "next/server";
import { chatJSON } from "@/lib/llm";
import { getOwnerShopId, jsonError, jsonOk } from "@/lib/auth-server";

export const runtime = "nodejs";
export const maxDuration = 60;

type IncomingQuestion = {
  id: string;
  position: number;
  label: string;
  kind: string;
  options: unknown;
  required: boolean;
};

type Body = {
  transcript: string;
  questions: IncomingQuestion[];
};

const SYSTEM_PROMPT = `Tu es la "Conciergerie La Niche", une assistante experte qui aide un boutiquier de parfumerie de niche à concevoir le questionnaire que ses clients remplissent en boutique.

Tu reçois :
1. La LISTE des questions actuelles (id, position, label, kind, options, required).
2. Une INSTRUCTION en langage naturel du boutiquier (texte tapé ou retranscription vocale). Ex : "reformule la question 2 pour qu'elle soit plus simple", "ajoute une question sur le budget", "supprime la dernière", "rends la question 5 obligatoire".

Ton rôle : traduire son intention en TABLEAU d'opérations strictement structuré.

CHAQUE opération a un seul des shapes suivants :

  • { "type": "update",
      "questionId": "<uuid existant>",
      "patch": { "label"?: string, "kind"?: "text|single|multi|scale|email|phone", "options"?: <voir ci-dessous>, "required"?: boolean },
      "rationale": "<une phrase courte qui explique au boutiquier ce que tu as fait>"
    }

  • { "type": "create",
      "afterPosition": <int — position après laquelle insérer, 0 = en première>,
      "question": { "label": string, "kind": "...", "options"?: ..., "required": boolean },
      "rationale": "..."
    }

  • { "type": "delete", "questionId": "<uuid>", "rationale": "..." }

OPTIONS :
- "single" / "multi" : array de strings (les choix)
- "scale" : objet { "min": 1, "max": 5, "minLabel": "<label gauche>", "maxLabel": "<label droite>" }
- "text" / "email" / "phone" : null

RÈGLES :
- N'invente PAS d'identifiant. Pour "update" et "delete", tu DOIS utiliser un id qui figure dans la liste fournie.
- Si l'instruction est ambiguë, choisis l'interprétation la plus probable et reflète-la dans le rationale.
- Pour reformuler, garde l'esprit de la question. Reste accessible à un client qui n'y connaît rien sans devenir simpliste.
- Le rationale est UNE phrase courte (≤ 25 mots) en français, ton chaleureux.
- Si la demande ne nécessite aucun changement, renvoie un tableau vide.

Réponds UNIQUEMENT en JSON valide, sans préambule :
{"operations":[ ... ]}`;

export async function POST(req: NextRequest) {
  const shopId = await getOwnerShopId(req);
  if (!shopId) return jsonError("auth_required", 401);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonError("invalid_json", 400);
  }

  const transcript = (body.transcript ?? "").trim();
  if (!transcript) return jsonError("missing_transcript", 400);
  if (transcript.length > 2000) return jsonError("transcript_too_long", 400);

  const questions = Array.isArray(body.questions) ? body.questions : [];

  const userPrompt = `QUESTIONS ACTUELLES :
${
    questions.length === 0
      ? "(aucune)"
      : questions
          .map(
            (q) =>
              `[${q.position}] id=${q.id} | kind=${q.kind} | required=${q.required} | label="${q.label}"\n   options=${JSON.stringify(q.options)}`,
          )
          .join("\n")
  }

INSTRUCTION DU BOUTIQUIER :
${transcript}

Génère le JSON.`;

  try {
    const out = await chatJSON<{ operations: unknown[] }>(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.4, maxTokens: 1500 },
    );
    return jsonOk({ operations: Array.isArray(out.operations) ? out.operations : [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("llm_error", 500, msg.slice(0, 400));
  }
}
