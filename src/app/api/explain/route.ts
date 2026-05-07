/**
 * /api/explain
 *
 *   GET ?term=Chypré&context=family
 *
 *   Returns a 1-2 sentence simple-language explanation of an olfactive
 *   term, in the context of helping a non-expert client fill the
 *   questionnaire. `context` can be "family" (olfactive family),
 *   "accord" (composite accord), or "note" (raw ingredient).
 *
 *   Server caches in-memory per (term, context) so repeated taps don't
 *   re-bill the LLM. Soft cap of 50 distinct terms per process.
 */

import type { NextRequest } from "next/server";
import { chat } from "@/lib/llm";
import { jsonError, jsonOk } from "@/lib/auth-server";

export const runtime = "nodejs";

const cache = new Map<string, string>();
const MAX_CACHE = 80;

const SYSTEM_PROMPT = `Tu expliques un terme de parfumerie à quelqu'un qui n'y connaît rien.

Règles :
- 2 phrases maximum, ~25 mots.
- Décris une SENSATION ou une AMBIANCE concrète, pas une définition technique.
- Si possible, cite 1-2 ingrédients ou objets familiers ("comme une orange écrasée", "comme un cuir de vieux fauteuil").
- Pas de jargon, pas de mots compliqués pour expliquer un mot compliqué.
- Pas de "c'est-à-dire", pas de "en effet", aucun préambule.
- Réponds en français, ton chaleureux, direct.`;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const term = (url.searchParams.get("term") ?? "").trim();
  const context = url.searchParams.get("context") ?? "family";

  if (!term) return jsonError("missing_term", 400);
  if (term.length > 80) return jsonError("term_too_long", 400);

  const key = `${context}::${term.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached) return jsonOk({ term, explanation: cached, cached: true });

  let userPrompt: string;
  switch (context) {
    case "accord":
      userPrompt = `Explique l'accord olfactif "${term}" en parfumerie.`;
      break;
    case "note":
      userPrompt = `Explique la note olfactive "${term}" en parfumerie.`;
      break;
    default:
      userPrompt = `Explique la famille olfactive "${term}" en parfumerie.`;
  }

  try {
    const explanation = (
      await chat(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        { temperature: 0.5, maxTokens: 120 },
      )
    ).trim();

    if (cache.size >= MAX_CACHE) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
    cache.set(key, explanation);

    return jsonOk({ term, explanation, cached: false });
  } catch (e) {
    return jsonError("llm_error", 500, e instanceof Error ? e.message : String(e));
  }
}
