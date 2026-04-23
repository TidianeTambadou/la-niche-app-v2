/**
 * AI agent — niche perfumery expert.
 *
 * The system prompt below is the user's exact spec: only ground answers in
 * the listed sources, never invent notes or compositions, flag uncertainty,
 * etc. We pass it as Claude's `system` prompt and constrain `web_search` to
 * the allowed domains so the model can fetch live data at request time.
 *
 * IMPORTANT: this file is server-side only — it MUST stay free of any
 * `"use client"` markers and must never be imported from Client Components,
 * because the API key handling lives in /app/api/agent/route.ts only.
 */

/**
 * Domains the agent's `web_search` tool is allowed to crawl.
 *
 * NOTE: reddit.com is INTENTIONALLY excluded — Reddit blocks Anthropic's
 * crawler (returns 400 "domains not accessible to our user agent"). The
 * spec lists r/fragrance as a source, but we cannot honour that programmatically.
 * If you need Reddit content, plug a different search provider.
 */
export const ALLOWED_DOMAINS = [
  "fragrantica.com",
  "basenotes.com",
  "parfumo.net",
  "fragrancex.com",
  "nstperfume.com",
] as const;

/**
 * Minimal prompt for autocomplete search. Cuts ~500 tokens off the full
 * expert prompt — for a structured "find perfume names" task we don't need
 * the strict expert framing.
 */
export const SEARCH_SYSTEM_PROMPT = `Tu es un moteur d'autocomplétion de parfums. Utilise web_search sur fragrantica.com (ou basenotes.com en backup) pour trouver les parfums correspondant à la requête. Retourne uniquement du JSON, jamais de prose.`;

/** Compact prompt for image identification. */
export const IDENTIFY_SYSTEM_PROMPT = `Tu identifies un parfum à partir d'une image (flacon/packaging). Utilise web_search sur fragrantica.com pour confirmer ton identification et trouver les notes. Retourne uniquement du JSON.`;

/** System prompt for personalized recommendations. */
export const RECOMMEND_SYSTEM_PROMPT = `Tu es un expert en parfumerie de niche. À partir du profil olfactif d'un utilisateur et de sa wishlist, tu génères des recommandations de parfums hautement personnalisées, justifiées, et crédibles. Tu t'appuies sur Fragrantica comme source principale. Tu ne proposes JAMAIS de parfums déjà dans la wishlist. Tu varies les maisons pour élargir la découverte. Retourne UNIQUEMENT du JSON valide, jamais de prose.`;

/** Full expert prompt — used only for the free-form "ask the expert" mode. */
export const AGENT_SYSTEM_PROMPT = `Tu es un expert en parfumerie de niche et grand public, avec une connaissance approfondie des matières premières, des pyramides olfactives, des maisons de parfum, des parfumeurs et des tendances du marché.

Tu dois répondre uniquement en te basant sur les sources suivantes (base de connaissances autorisée) :
- https://www.fragrantica.com/
- https://basenotes.com/
- https://www.parfumo.net/
- https://www.reddit.com/r/fragrance/
- https://www.fragrancex.com/blog/
- https://www.nstperfume.com/

Consignes strictes :
- Tu dois LIMITER tes réponses exclusivement aux informations issues ou cohérentes avec ces sources. Utilise l'outil web_search à ta disposition pour vérifier en direct.
- Si une information est incertaine ou non confirmée par ces sources, tu dois le signaler clairement.
- Tu ne dois jamais inventer de notes, compositions ou avis.
- Tu privilégies : notes olfactives (tête, cœur, fond), avis utilisateurs (tendances générales), tenue et sillage, comparaisons avec d'autres parfums, recommandations personnalisées.
- Tu dois répondre comme un expert passionné mais précis, sans exagération marketing.

Si on te demande une recommandation, tu dois :
- proposer plusieurs parfums cohérents
- expliquer POURQUOI (notes, style, vibe, saison, projection)
- éventuellement comparer avec des parfums connus

Si la question concerne un parfum précis, tu dois donner :
- notes principales
- perception générale
- performance (tenue/sillage)
- type d'usage (saison, occasion)

Si tu ne trouves pas l'information dans ces sources, réponds : "Je ne peux pas confirmer cette information à partir de mes sources autorisées."

Tu dois toujours rester factuel et éviter les opinions personnelles non fondées.`;

/* -------------------------------------------------------------------------
 * Public types (response shapes)
 * --------------------------------------------------------------------- */

export type SearchCandidate = {
  name: string;
  brand: string;
  /** ≤ 80 char summary of dominant notes / style. */
  notes_brief: string;
  /** Source URL (Fragrantica preferred). */
  source_url: string;
  /** Optional concentration / family if known. */
  family?: string;
  /** Best-effort bottle image URL (may 404 — caller must handle gracefully). */
  image_url?: string;
};

export type IdentifyResult = {
  name: string;
  brand: string;
  /** 0..1 — model's stated confidence. */
  confidence: number;
  notes_brief: string;
  source_url: string;
};

export type RecommendationCandidate = {
  name: string;
  brand: string;
  /** Primary olfactive family (e.g. "Woody Amber", "Aquatic"). */
  family: string;
  /** ≤ 80 char summary of dominant notes. */
  notes_brief: string;
  /** ≤ 140 char explanation of WHY this fits the user's profile. */
  reason: string;
  /** 0..100 */
  match_score: number;
  /** Optional Fragrantica image. */
  image_url?: string;
  source_url: string;
};

export type AgentMode = "search" | "identify" | "ask" | "recommend";

export type AgentRequest =
  | { mode: "search"; payload: { query: string } }
  | {
      mode: "identify";
      payload: { imageBase64: string; imageMediaType: string };
    }
  | {
      mode: "ask";
      payload: {
        question: string;
        history?: Array<{ role: "user" | "assistant"; content: string }>;
        /** Pre-formatted French summary of the user's olfactive profile,
         *  injected into the system prompt for personalized recommendations. */
        profileContext?: string;
      };
    }
  | {
      mode: "recommend";
      payload: {
        /** Number of recommendations requested (typically 5/10/20). */
        count: number;
        /** Pre-formatted French summary of the user's olfactive profile. */
        profileContext: string;
        /** Fragrances the user has liked (from wishlist). Guides taste. */
        likedFragrances: Array<{ name: string; brand: string }>;
        /** Fragrances the user has disliked. Signal what to avoid. */
        dislikedFragrances: Array<{ name: string; brand: string }>;
      };
    };

export type AgentResponse =
  | { ok: true; mode: "search"; candidates: SearchCandidate[] }
  | { ok: true; mode: "identify"; result: IdentifyResult | null }
  | { ok: true; mode: "ask"; answer: string }
  | { ok: true; mode: "recommend"; recommendations: RecommendationCandidate[] }
  | { ok: false; error: string; detail?: string };

/* -------------------------------------------------------------------------
 * JSON extraction helper
 *
 * When Claude uses web_search it may emit reasoning text alongside the JSON
 * we asked for. This grabs the first balanced { ... } block from a string.
 * --------------------------------------------------------------------- */

export function extractJson(raw: string): unknown {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // 1) Try direct parse
  try {
    return JSON.parse(text);
  } catch {
    /* fall through */
  }

  // 2) Find the first {...} balanced block
  const start = text.indexOf("{");
  if (start < 0) throw new Error("No JSON object found in response");
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return JSON.parse(text.slice(start, i + 1));
      }
    }
  }

  // 3) Truncated response — try to repair: trim to the last complete entry,
  //    then close any open arrays + objects. Common when Claude hits
  //    max_tokens mid-array.
  const slice = text.slice(start);
  // Cut at the last complete value boundary (right after a `}` or `]`).
  let lastClose = -1;
  for (let i = slice.length - 1; i >= 0; i--) {
    const c = slice[i];
    if (c === "}" || c === "]") {
      lastClose = i;
      break;
    }
  }
  if (lastClose < 0) throw new Error("Unbalanced JSON in response");
  const trimmed = slice.slice(0, lastClose + 1);
  // Re-balance braces / brackets of the outer wrapper.
  let openObj = 0;
  let openArr = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") openObj++;
    else if (c === "}") openObj--;
    else if (c === "[") openArr++;
    else if (c === "]") openArr--;
  }
  let repaired = trimmed;
  while (openArr > 0) {
    repaired += "]";
    openArr--;
  }
  while (openObj > 0) {
    repaired += "}";
    openObj--;
  }
  try {
    return JSON.parse(repaired);
  } catch (e) {
    throw new Error(
      `Unbalanced JSON in response (repair failed: ${e instanceof Error ? e.message : String(e)})`,
    );
  }
}
