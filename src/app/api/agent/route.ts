import { NextResponse } from "next/server";
import {
  AGENT_SYSTEM_PROMPT,
  IDENTIFY_SYSTEM_PROMPT,
  RECOMMEND_SYSTEM_PROMPT,
  SEARCH_SYSTEM_PROMPT,
  extractJson,
  type AgentRequest,
  type AgentResponse,
  type IdentifyResult,
  type RecommendationCandidate,
  type SearchCandidate,
} from "@/lib/agent";

/* ─── In-memory search cache (per Vercel instance) ─────────────────────── */

type CachedSearch = { ts: number; candidates: SearchCandidate[] };
const SEARCH_CACHE = new Map<string, CachedSearch>();
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;

function cachedSearch(key: string): SearchCandidate[] | null {
  const hit = SEARCH_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > SEARCH_CACHE_TTL_MS) { SEARCH_CACHE.delete(key); return null; }
  SEARCH_CACHE.delete(key);
  SEARCH_CACHE.set(key, hit);
  return hit.candidates;
}

function rememberSearch(key: string, candidates: SearchCandidate[]) {
  SEARCH_CACHE.set(key, { ts: Date.now(), candidates });
  if (SEARCH_CACHE.size > 100) {
    const first = SEARCH_CACHE.keys().next().value;
    if (first !== undefined) SEARCH_CACHE.delete(first);
  }
}

/* ─── Tavily web search ─────────────────────────────────────────────────── */

const ALLOWED_DOMAINS = [
  "fragrantica.com",
  "fragrantica.fr",
  "basenotes.com",
  "parfumo.net",
  "fragrancex.com",
  "nstperfume.com",
];

async function tavilySearch(query: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return "[Tavily non configuré]";
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      include_domains: ALLOWED_DOMAINS,
      search_depth: "advanced",
      max_results: 5,
    }),
  });
  if (!res.ok) return `[Tavily erreur ${res.status}]`;
  const data = (await res.json()) as {
    results?: Array<{ title: string; url: string; content: string }>;
  };
  return (data.results ?? [])
    .map((r) => `## ${r.title}\nSource: ${r.url}\n${r.content}`)
    .join("\n\n---\n\n");
}

/* ─── OpenRouter call (OpenAI-compatible) ───────────────────────────────── */

/**
 * Model fallback chain — OpenRouter tries each in order if the previous one
 * is rate-limited (429) or fails. All entries must be vision-capable so the
 * `identify` mode keeps working when Gemini is throttled upstream.
 */
const OPENROUTER_MODELS = [
  "google/gemini-2.0-flash-001",
  "google/gemini-flash-1.5",
  "openai/gpt-4o-mini",
];

type ORMessage = { role: "system" | "user" | "assistant"; content: unknown };

async function openRouterCall(
  apiKey: string,
  messages: ORMessage[],
  maxTokens: number,
): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      "http-referer": "https://laniche.app",
      "x-title": "La Niche",
    },
    body: JSON.stringify({
      // `models` (array) instead of `model` (string) → OpenRouter tries each
      // in order on failure; auto-falls-back when Gemini is rate-limited.
      models: OPENROUTER_MODELS,
      route: "fallback",
      max_tokens: maxTokens,
      temperature: 0.3,
      messages,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

/* ─── Route handler ─────────────────────────────────────────────────────── */

export async function POST(req: Request) {
  let body: AgentRequest;
  try {
    body = (await req.json()) as AgentRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" } satisfies AgentResponse,
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "agent_disabled", detail: "OPENROUTER_API_KEY not set." } satisfies AgentResponse,
      { status: 503 },
    );
  }

  /* ── SEARCH ── */
  if (body.mode === "search") {
    const query = (body.payload?.query ?? "").trim();
    if (!query) return NextResponse.json({ ok: true, mode: "search", candidates: [] } satisfies AgentResponse);

    const cacheKey = query.toLowerCase();
    const cached = cachedSearch(cacheKey);
    if (cached) return NextResponse.json({ ok: true, mode: "search", candidates: cached } satisfies AgentResponse);

    try {
      const webResults = await tavilySearch(`parfum ${query} site:fragrantica.com`);
      const text = await openRouterCall(
        apiKey,
        [
          { role: "system", content: SEARCH_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Requête autocomplete: "${query}"\n\nRésultats web:\n${webResults}\n\nJSON STRICT, max 4 candidats:\n{"candidates":[{"name":"...","brand":"...","notes_brief":"≤50 char","family":"≤30 char","image_url":"https://fimgs.net/... (optionnel)"}]}`,
          },
        ],
        600,
      );

      const parsed = extractJson(text) as { candidates?: Partial<SearchCandidate>[] };
      const candidates: SearchCandidate[] = (parsed.candidates ?? [])
        .filter((c) => c.name && c.brand)
        .map((c) => ({
          name: c.name!,
          brand: c.brand!,
          notes_brief: c.notes_brief ?? "",
          source_url: `https://www.fragrantica.com/search/?query=${encodeURIComponent(`${c.brand} ${c.name}`)}`,
          family: c.family,
          image_url:
            c.image_url && /^https?:\/\/.+\.(jpe?g|png|webp)(\?.*)?$/i.test(c.image_url)
              ? c.image_url
              : `https://placehold.co/300x400/0a0a0a/e2e2e2?font=montserrat&text=${encodeURIComponent(c.name!)}`,
        }));

      rememberSearch(cacheKey, candidates);
      return NextResponse.json({ ok: true, mode: "search", candidates } satisfies AgentResponse);
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: "upstream_error", detail: e instanceof Error ? e.message : String(e) } satisfies AgentResponse,
        { status: 502 },
      );
    }
  }

  /* ── IDENTIFY (scan) ── */
  if (body.mode === "identify") {
    const { imageBase64, imageMediaType } = body.payload ?? {};
    if (!imageBase64 || !imageMediaType) {
      return NextResponse.json({ ok: false, error: "missing_image" } satisfies AgentResponse, { status: 400 });
    }

    try {
      // Step 1 — vision identification
      const visionText = await openRouterCall(
        apiKey,
        [
          { role: "system", content: IDENTIFY_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${imageMediaType};base64,${imageBase64}` } },
              { type: "text", text: `Identifie ce parfum. Réponds UNIQUEMENT en JSON:\n{"name":"...","brand":"...","confidence":0.0_to_1.0,"notes_brief":"≤80 chars"}` },
            ],
          },
        ],
        400,
      );

      const vision = extractJson(visionText) as Partial<IdentifyResult & { error?: string }>;
      if (vision.error === "unidentified" || !vision.name || !vision.brand) {
        return NextResponse.json({ ok: true, mode: "identify", result: null } satisfies AgentResponse);
      }

      // Step 2 — Fragrantica enrichment via Tavily
      const webResults = await tavilySearch(`${vision.brand} ${vision.name} fragrantica.com notes`);
      const enrichText = await openRouterCall(
        apiKey,
        [
          { role: "system", content: IDENTIFY_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Parfum identifié: ${vision.brand} - ${vision.name}\n\nDonnées web:\n${webResults}\n\nJSON:\n{"name":"...","brand":"...","confidence":${vision.confidence ?? 0.7},"notes_brief":"≤80 chars","source_url":"URL fragrantica"}`,
          },
        ],
        400,
      );

      const enriched = extractJson(enrichText) as Partial<IdentifyResult>;
      const result: IdentifyResult = {
        name: enriched.name ?? vision.name,
        brand: enriched.brand ?? vision.brand,
        confidence: enriched.confidence ?? vision.confidence ?? 0.7,
        notes_brief: enriched.notes_brief ?? vision.notes_brief ?? "",
        source_url:
          enriched.source_url ??
          `https://www.fragrantica.com/search/?query=${encodeURIComponent(`${vision.brand} ${vision.name}`)}`,
      };

      return NextResponse.json({ ok: true, mode: "identify", result } satisfies AgentResponse);
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: "upstream_error", detail: e instanceof Error ? e.message : String(e) } satisfies AgentResponse,
        { status: 502 },
      );
    }
  }

  /* ── ASK (concierge) ── */
  if (body.mode === "ask") {
    const question = (body.payload?.question ?? "").trim();
    if (!question) return NextResponse.json({ ok: false, error: "missing_question" } satisfies AgentResponse, { status: 400 });

    try {
      // Web search to ground the answer
      const webResults = await tavilySearch(question);
      const history = (body.payload?.history ?? []).slice(-10);
      const profileContext = (body.payload as { profileContext?: string })?.profileContext ?? "";

      const systemContent = profileContext
        ? `${AGENT_SYSTEM_PROMPT}\n\n---\n${profileContext}`
        : AGENT_SYSTEM_PROMPT;

      const messages: ORMessage[] = [
        { role: "system", content: systemContent },
        ...history.map((t) => ({ role: t.role as "user" | "assistant", content: t.content })),
        {
          role: "user",
          content: `Question: ${question}\n\nSources web consultées:\n${webResults}`,
        },
      ];

      const answer = await openRouterCall(apiKey, messages, 1200);
      return NextResponse.json({ ok: true, mode: "ask", answer } satisfies AgentResponse);
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: "upstream_error", detail: e instanceof Error ? e.message : String(e) } satisfies AgentResponse,
        { status: 502 },
      );
    }
  }

  /* ── RECOMMEND (Tinder-style personalized picks) ── */
  if (body.mode === "recommend") {
    const { count, profileContext, likedFragrances, dislikedFragrances } = body.payload ?? {
      count: 10,
      profileContext: "",
      likedFragrances: [],
      dislikedFragrances: [],
    };
    const safeCount = Math.min(20, Math.max(3, Math.round(count)));

    try {
      // Ground the recs in Fragrantica via Tavily: prioritise parfums
      // similaires to the user's liked list; fall back to generic niche picks.
      const seed = likedFragrances
        .slice(0, 4)
        .map((f) => `${f.brand} ${f.name}`)
        .join(", ");
      const query = seed
        ? `parfums similaires à ${seed} recommandations niche fragrantica`
        : `meilleures recommandations parfums niche fragrantica`;
      const webResults = await tavilySearch(query);

      const likedList = likedFragrances.length
        ? likedFragrances.map((f) => `  • ${f.brand} — ${f.name}`).join("\n")
        : "  (aucun pour l'instant)";
      const dislikedList = dislikedFragrances.length
        ? dislikedFragrances.map((f) => `  • ${f.brand} — ${f.name}`).join("\n")
        : "  (aucun)";

      const wishlistAvoid = [...likedFragrances, ...dislikedFragrances]
        .map((f) => `${f.brand} ${f.name}`)
        .join(" | ");

      const text = await openRouterCall(
        apiKey,
        [
          { role: "system", content: RECOMMEND_SYSTEM_PROMPT },
          {
            role: "user",
            content: `${profileContext || "Aucun profil olfactif rempli — recommande des pièces polyvalentes et populaires."}\n\nParfums AIMÉS (wishlist) :\n${likedList}\n\nParfums REJETÉS :\n${dislikedList}\n\nÀ NE PAS SUGGÉRER (déjà connus) : ${wishlistAvoid || "—"}\n\nSources Fragrantica :\n${webResults}\n\nGénère EXACTEMENT ${safeCount} recommandations DIFFÉRENTES, variées en maisons. Chaque \`reason\` doit lier explicitement le parfum au profil de l'utilisateur. JSON STRICT :\n{"recommendations":[{"name":"...","brand":"...","family":"Woody Amber","notes_brief":"≤80 char","reason":"≤140 char pourquoi ce parfum pour ce profil","match_score":87,"image_url":"https://fimgs.net/...jpg (optionnel)","source_url":"https://www.fragrantica.com/perfume/...html"}]}`,
          },
        ],
        2500,
      );

      const parsed = extractJson(text) as {
        recommendations?: Partial<RecommendationCandidate>[];
      };
      const recommendations: RecommendationCandidate[] = (parsed.recommendations ?? [])
        .filter((r) => r.name && r.brand)
        .slice(0, safeCount)
        .map((r) => ({
          name: r.name!,
          brand: r.brand!,
          family: r.family ?? "—",
          notes_brief: r.notes_brief ?? "",
          reason: r.reason ?? "Correspond à ton profil olfactif.",
          match_score: Math.min(
            99,
            Math.max(50, Math.round(r.match_score ?? 75)),
          ),
          image_url:
            r.image_url && /^https?:\/\/.+\.(jpe?g|png|webp)(\?.*)?$/i.test(r.image_url)
              ? r.image_url
              : undefined,
          source_url:
            r.source_url ??
            `https://www.fragrantica.com/search/?query=${encodeURIComponent(`${r.brand} ${r.name}`)}`,
        }));

      return NextResponse.json({ ok: true, mode: "recommend", recommendations } satisfies AgentResponse);
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: "upstream_error", detail: e instanceof Error ? e.message : String(e) } satisfies AgentResponse,
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ ok: false, error: "invalid_mode" } satisfies AgentResponse, { status: 400 });
}
