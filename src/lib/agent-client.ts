/**
 * Frontend wrapper around POST /api/agent.
 * Safe to import from any Client Component — never touches the API key.
 */

import type {
  AgentResponse,
  FriendReport,
  IdentifyResult,
  OlfactiveDNA,
  PerfumeCardData,
  RecommendationCandidate,
  SearchCandidate,
} from "@/lib/agent";
import { supabase } from "@/lib/supabase";

/** Reads the current Supabase session token. Returned undefined for
 *  anonymous users — the API decides whether the mode requires auth. */
async function authHeader(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function call(
  body: unknown,
  signal?: AbortSignal,
  options?: { auth?: boolean },
): Promise<AgentResponse> {
  async function once(): Promise<AgentResponse> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (options?.auth) {
      Object.assign(headers, await authHeader());
    }
    let res: Response;
    try {
      res = await fetch("/api/agent", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      return {
        ok: false,
        error: "network_error",
        detail:
          e instanceof Error
            ? e.message
            : "Connexion impossible au service.",
      };
    }
    // Read as text first so a non-JSON body (Vercel 504 HTML page, proxy
    // error, etc.) doesn't surface as a cryptic native parse error
    // ("the string did not match the expected pattern" on iOS Safari).
    const text = await res.text();
    try {
      return JSON.parse(text) as AgentResponse;
    } catch {
      const detail =
        res.status === 504
          ? "Le service met trop de temps à répondre. Réessaie dans un instant."
          : res.status >= 500
            ? `Service indisponible (HTTP ${res.status}). Réessaie dans un instant.`
            : res.status >= 400
              ? `Erreur ${res.status}.`
              : "Réponse non-JSON du service.";
      return { ok: false, error: "upstream_error", detail };
    }
  }
  // Single retry on 429s: every model in the fallback chain can be throttled
  // at once; waiting a couple seconds often unblocks at least one.
  const first = await once();
  if (
    !first.ok &&
    first.error === "upstream_error" &&
    first.detail?.startsWith("OpenRouter 429")
  ) {
    await new Promise((r) => setTimeout(r, 2500));
    return once();
  }
  return first;
}

/* -------------------------------------------------------------------------
 * Search cache + cost-saving prefix dedup.
 *
 * Fragella has per-day quotas. To minimise calls:
 *   1. 30-minute TTL — same exact query hits the in-memory cache.
 *   2. Prefix dedup — when the user types "Sauvage" then deletes back to
 *      "Sauv", we don't re-fetch: we filter the cached "Sauvage" results
 *      client-side (any candidate whose brand+name contains the new query).
 *      This cuts per-keystroke calls to ZERO once the LLM has produced the
 *      "right" set for a longer prefix.
 *   3. The page-side debounce (1500 ms + min 4 chars) prevents most calls
 *      altogether.
 * --------------------------------------------------------------------- */

const SEARCH_CACHE = new Map<string, { ts: number; value: SearchCandidate[] }>();
const SEARCH_CACHE_MAX = 80;
const SEARCH_CACHE_TTL_MS = 30 * 60 * 1000;

function cachedSearchResults(key: string): SearchCandidate[] | null {
  const hit = SEARCH_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > SEARCH_CACHE_TTL_MS) {
    SEARCH_CACHE.delete(key);
    return null;
  }
  // Touch (re-insert) so this becomes the most-recent for LRU eviction.
  SEARCH_CACHE.delete(key);
  SEARCH_CACHE.set(key, hit);
  return hit.value;
}

/** Look for any cached entry whose key STARTS WITH the current query OR
 *  for which the current query is a substring. Returns filtered candidates
 *  (only those that still match the current query in brand or name).
 *
 *  Example: cache has "sauvage" → ["Dior Sauvage", "Eau Sauvage", …].
 *  User types "sauv" → we return the same list filtered (all match).
 *  No new API call. */
function cachedPrefixResults(key: string): SearchCandidate[] | null {
  // Try every cached key — small N (≤80), cheap.
  for (const [cachedKey, entry] of SEARCH_CACHE) {
    if (Date.now() - entry.ts > SEARCH_CACHE_TTL_MS) continue;
    if (cachedKey.startsWith(key) || cachedKey.includes(key)) {
      const filtered = entry.value.filter((c) => {
        const hay = `${c.brand} ${c.name}`.toLowerCase();
        return hay.includes(key);
      });
      if (filtered.length > 0) return filtered;
    }
  }
  return null;
}

function rememberSearchResults(key: string, value: SearchCandidate[]): void {
  SEARCH_CACHE.set(key, { ts: Date.now(), value });
  while (SEARCH_CACHE.size > SEARCH_CACHE_MAX) {
    // Map preserves insertion order — first key is the oldest.
    const firstKey = SEARCH_CACHE.keys().next().value;
    if (firstKey === undefined) break;
    SEARCH_CACHE.delete(firstKey);
  }
}

export async function agentSearch(
  query: string,
  signal?: AbortSignal,
): Promise<SearchCandidate[]> {
  const key = query.trim().toLowerCase();
  if (key.length < 3) return [];

  // 1) exact cache hit
  const cached = cachedSearchResults(key);
  if (cached) return cached;

  // 2) prefix/substring of a previous cache entry → reuse, no API call
  const reused = cachedPrefixResults(key);
  if (reused) {
    // Memoise under the new key too so subsequent identical queries are
    // instant without re-scanning the cache.
    rememberSearchResults(key, reused);
    return reused;
  }

  // 3) actually call the API
  const res = await call(
    { mode: "search", payload: { query: key } },
    signal,
    { auth: true },
  );
  if (res.ok && res.mode === "search") {
    rememberSearchResults(key, res.candidates);
    return res.candidates;
  }
  if (!res.ok) {
    if (res.error === "quota_exceeded") {
      throw new QuotaExceededError(
        res.detail ?? "Quota de recherches atteint. Passe à un palier supérieur.",
      );
    }
    if (res.error === "auth_required") {
      throw new AuthRequiredError(
        res.detail ?? "Crée un compte pour rechercher.",
      );
    }
    const msg =
      res.error === "agent_disabled"
        ? "Service indisponible"
        : res.error === "upstream_error" && res.detail?.startsWith("429")
          ? "Trop de requêtes. Patiente une minute."
          : res.error === "upstream_error"
            ? `Erreur du service : ${res.detail ?? "?"}`
            : `${res.error}${res.detail ? ` — ${res.detail}` : ""}`;
    throw new Error(msg);
  }
  return [];
}

export async function agentIdentify(
  imageBase64: string,
  imageMediaType: string,
): Promise<IdentifyResult | null> {
  const res = await call(
    {
      mode: "identify",
      payload: { imageBase64, imageMediaType },
    },
    undefined,
    { auth: true },
  );
  if (res.ok && res.mode === "identify") return res.result;
  if (!res.ok) {
    if (res.error === "quota_exceeded") {
      throw new QuotaExceededError(
        res.detail ?? "Quota de scans atteint. Passe à un palier supérieur.",
      );
    }
    if (res.error === "auth_required") {
      throw new AuthRequiredError(
        res.detail ?? "Crée un compte pour scanner un parfum.",
      );
    }
    const msg =
      res.error === "agent_disabled"
        ? "Agent IA désactivé (OPENROUTER_API_KEY non configurée)"
        : res.error === "upstream_error" && res.detail?.startsWith("429")
          ? "Limite de débit atteinte. Patiente une minute."
          : res.error === "upstream_error"
            ? `Erreur IA : ${res.detail ?? "?"}`
            : `${res.error}${res.detail ? ` — ${res.detail}` : ""}`;
    throw new Error(msg);
  }
  return null;
}

export type RecommendResult = {
  recommendations: RecommendationCandidate[];
  dna: OlfactiveDNA;
};

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export class AuthRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export async function agentRecommend(
  count: number,
  profileContext: string,
  likedFragrances: Array<{ name: string; brand: string }>,
  dislikedFragrances: Array<{ name: string; brand: string }>,
  signal?: AbortSignal,
): Promise<RecommendResult> {
  const res = await call(
    {
      mode: "recommend",
      payload: { count, profileContext, likedFragrances, dislikedFragrances },
    },
    signal,
    { auth: true },
  );
  if (res.ok && res.mode === "recommend") {
    return { recommendations: res.recommendations, dna: res.dna };
  }
  if (!res.ok) {
    if (res.error === "quota_exceeded") {
      throw new QuotaExceededError(
        res.detail ?? "Quota mensuel atteint. Passe à un palier supérieur.",
      );
    }
    if (res.error === "auth_required") {
      throw new AuthRequiredError(
        res.detail ?? "Connecte-toi pour utiliser cette fonctionnalité.",
      );
    }
    const msg =
      res.error === "agent_disabled"
        ? "Agent IA désactivé (OPENROUTER_API_KEY non configurée)"
        : res.error === "upstream_error" && res.detail?.startsWith("429")
          ? "Limite de débit atteinte. Patiente une minute."
          : res.error === "upstream_error"
            ? `Erreur IA : ${res.detail ?? "?"}`
            : `${res.error}${res.detail ? ` — ${res.detail}` : ""}`;
    throw new Error(msg);
  }
  return {
    recommendations: [],
    dna: {
      dominant_accords: [],
      key_notes: [],
      avoid_notes: [],
      personality: "",
      intensity_signature: "",
      wear_context: "",
    },
  };
}

export async function agentFriendReport(
  profileContext: string,
  dna: OlfactiveDNA,
  matchedCards: RecommendationCandidate[],
  dislikedCards: RecommendationCandidate[],
  signal?: AbortSignal,
): Promise<FriendReport> {
  const trim = (cards: RecommendationCandidate[]) =>
    cards.map((c) => ({
      name: c.name,
      brand: c.brand,
      family: c.family,
      notes_brief: c.notes_brief,
      reason: c.reason,
      projection: c.projection,
    }));
  const res = await call({
    mode: "friend_report",
    payload: {
      profileContext,
      dna,
      matchedCards: trim(matchedCards),
      dislikedCards: trim(dislikedCards),
    },
  }, signal);
  if (res.ok && res.mode === "friend_report") return res.report;
  if (!res.ok) {
    throw new Error(
      res.error === "agent_disabled"
        ? "Agent IA désactivé"
        : `Erreur rapport : ${res.detail ?? res.error}`,
    );
  }
  throw new Error("Réponse rapport invalide");
}

export type AskHistoryTurn = { role: "user" | "assistant"; content: string };

export async function agentAsk(
  question: string,
  history?: AskHistoryTurn[],
  signal?: AbortSignal,
  profileContext?: string,
): Promise<string> {
  const res = await call(
    { mode: "ask", payload: { question, history, profileContext } },
    signal,
    { auth: true },
  );
  if (res.ok && res.mode === "ask") return res.answer;
  if (!res.ok) {
    if (res.error === "quota_exceeded") {
      throw new QuotaExceededError(
        res.detail ?? "Quota concierge atteint. Passe à un palier supérieur.",
      );
    }
    if (res.error === "auth_required") {
      throw new AuthRequiredError(
        res.detail ?? "Crée un compte pour parler au concierge.",
      );
    }
    if (res.error === "agent_disabled") {
      return `Agent désactivé — ${res.detail ?? "OPENROUTER_API_KEY manquante"}`;
    }
    const msg =
      res.error === "upstream_error" && res.detail?.startsWith("429")
        ? "Limite de débit Anthropic atteinte. Patiente une minute."
        : res.error === "upstream_error"
          ? `Erreur Anthropic : ${res.detail ?? "?"}`
          : `${res.error}${res.detail ? ` — ${res.detail}` : ""}`;
    throw new Error(msg);
  }
  throw new Error("Réponse invalide");
}

/* -------------------------------------------------------------------------
 * agentCard — on-demand rich perfume sheet for the "Carte signée La Niche"
 * modal. Returns `null` when neither Fragella nor the fallback know the
 * perfume — UI then falls back to a "demande à la conciergerie" CTA.
 * --------------------------------------------------------------------- */

const CARD_CACHE = new Map<string, { ts: number; value: PerfumeCardData | null }>();
const CARD_CACHE_TTL_MS = 10 * 60 * 1000;

function cardCacheKey(brand: string, name: string): string {
  return `${brand.toLowerCase().trim()}::${name.toLowerCase().trim()}`;
}

export async function agentCard(
  brand: string,
  name: string,
  signal?: AbortSignal,
): Promise<PerfumeCardData | null> {
  const key = cardCacheKey(brand, name);
  const hit = CARD_CACHE.get(key);
  if (hit && Date.now() - hit.ts < CARD_CACHE_TTL_MS) return hit.value;

  const res = await call(
    { mode: "card", payload: { brand, name } },
    signal,
  );
  if (res.ok && res.mode === "card") {
    CARD_CACHE.set(key, { ts: Date.now(), value: res.perfume });
    return res.perfume;
  }
  if (!res.ok) {
    // Treat unknown / disabled / upstream errors as "no card" — the UI
    // falls back to the concierge CTA gracefully.
    if (res.error === "agent_disabled" || res.error === "upstream_error") {
      return null;
    }
    throw new Error(`${res.error}${res.detail ? ` — ${res.detail}` : ""}`);
  }
  return null;
}
