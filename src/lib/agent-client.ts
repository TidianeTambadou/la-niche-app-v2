/**
 * Frontend wrapper around POST /api/agent.
 * Safe to import from any Client Component — never touches the API key.
 */

import type {
  AgentResponse,
  FriendReport,
  IdentifyResult,
  OlfactiveDNA,
  RecommendationCandidate,
  SearchCandidate,
} from "@/lib/agent";

async function call(body: unknown, signal?: AbortSignal): Promise<AgentResponse> {
  async function once(): Promise<AgentResponse> {
    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    return (await res.json()) as AgentResponse;
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
 * LRU cache for search results.
 *
 * The default Anthropic Tier 1 plan is 10K input tokens / minute. Each web-
 * search call burns 3-8K tokens (system + prompt + scraped page content).
 * Without a cache, 2-3 quick searches blow the rate limit. Same query within
 * 5 minutes hits the cache instead.
 * --------------------------------------------------------------------- */

const SEARCH_CACHE = new Map<string, { ts: number; value: SearchCandidate[] }>();
const SEARCH_CACHE_MAX = 40;
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;

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

  const cached = cachedSearchResults(key);
  if (cached) return cached;

  const res = await call(
    { mode: "search", payload: { query: key } },
    signal,
  );
  if (res.ok && res.mode === "search") {
    rememberSearchResults(key, res.candidates);
    return res.candidates;
  }
  if (!res.ok) {
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
  return [];
}

export async function agentIdentify(
  imageBase64: string,
  imageMediaType: string,
): Promise<IdentifyResult | null> {
  const res = await call({
    mode: "identify",
    payload: { imageBase64, imageMediaType },
  });
  if (res.ok && res.mode === "identify") return res.result;
  if (!res.ok) {
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
  );
  if (res.ok && res.mode === "recommend") {
    return { recommendations: res.recommendations, dna: res.dna };
  }
  if (!res.ok) {
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
  );
  if (res.ok && res.mode === "ask") return res.answer;
  if (!res.ok) {
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
