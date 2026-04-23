import { NextResponse } from "next/server";
import {
  AGENT_SYSTEM_PROMPT,
  ANALYZER_SYSTEM_PROMPT,
  CURATOR_SYSTEM_PROMPT,
  IDENTIFY_SYSTEM_PROMPT,
  REPORT_SYSTEM_PROMPT,
  SEARCH_SYSTEM_PROMPT,
  extractJson,
  type AgentRequest,
  type AgentResponse,
  type FriendReport,
  type IdentifyResult,
  type OlfactiveDNA,
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

  /* ── RECOMMEND (multi-agent pipeline) ──────────────────────────────────
   * Stage 1 — Researcher  : Tavily lookup on the user's liked fragrances to
   *                         pull real note/pyramid data from Fragrantica.
   * Stage 2 — Analyst     : LLM extracts the user's olfactive DNA (dominant
   *                         accords, key notes, avoid notes, search queries).
   * Stage 3 — Researcher  : parallel Tavily searches from the Analyst's
   *                         queries to gather candidate parfums.
   * Stage 4 — Curator     : LLM scores & ranks candidates strictly against
   *                         the DNA. Each `reason` must cite notes from the
   *                         DNA — generic matches are rejected by the prompt.
   * ------------------------------------------------------------------- */
  if (body.mode === "recommend") {
    const { count, profileContext, likedFragrances, dislikedFragrances } =
      body.payload ?? {
        count: 10,
        profileContext: "",
        likedFragrances: [],
        dislikedFragrances: [],
      };
    const safeCount = Math.min(20, Math.max(3, Math.round(count)));

    try {
      /* Stage 1 — real Fragrantica data for the user's liked parfums */
      const topLiked = likedFragrances.slice(0, 3);
      const likedNotesWeb = topLiked.length
        ? await tavilySearch(
            `${topLiked.map((f) => `"${f.brand} ${f.name}"`).join(" ")} notes pyramide fragrantica`,
          )
        : "(Aucun parfum aimé pour l'instant — recommandations basées sur le profil déclaratif uniquement.)";

      const likedList = likedFragrances.length
        ? likedFragrances.map((f) => `  • ${f.brand} — ${f.name}`).join("\n")
        : "  (aucun)";
      const dislikedList = dislikedFragrances.length
        ? dislikedFragrances.map((f) => `  • ${f.brand} — ${f.name}`).join("\n")
        : "  (aucun)";

      /* Stage 2 — Analyst extracts olfactive DNA + targeted search queries */
      const analyzerRaw = await openRouterCall(
        apiKey,
        [
          { role: "system", content: ANALYZER_SYSTEM_PROMPT },
          {
            role: "user",
            content: `${profileContext || "(Aucun profil déclaratif rempli.)"}\n\nParfums AIMÉS :\n${likedList}\n\nParfums REJETÉS :\n${dislikedList}\n\nDonnées Fragrantica sur les parfums aimés :\n${likedNotesWeb}\n\nExtrait l'ADN olfactif de cet utilisateur et génère 3-5 requêtes Fragrantica ciblées. JSON uniquement.`,
          },
        ],
        1200,
      );

      const analyzerParsed = extractJson(analyzerRaw) as {
        dna?: Partial<OlfactiveDNA>;
        search_queries?: string[];
      };

      const dna: OlfactiveDNA = {
        dominant_accords: analyzerParsed.dna?.dominant_accords ?? [],
        key_notes: analyzerParsed.dna?.key_notes ?? [],
        avoid_notes: analyzerParsed.dna?.avoid_notes ?? [],
        personality: analyzerParsed.dna?.personality ?? "",
        intensity_signature: analyzerParsed.dna?.intensity_signature ?? "",
        wear_context: analyzerParsed.dna?.wear_context ?? "",
      };

      // Fallback queries if the analyst didn't produce any
      const searchQueries = (analyzerParsed.search_queries ?? []).slice(0, 5);
      if (searchQueries.length === 0) {
        if (dna.key_notes.length > 0) {
          searchQueries.push(
            `parfums ${dna.key_notes.slice(0, 3).join(" ")} niche fragrantica`,
          );
        }
        if (dna.dominant_accords.length > 0) {
          searchQueries.push(
            `parfums ${dna.dominant_accords[0]} recommandations fragrantica`,
          );
        }
        if (searchQueries.length === 0) {
          searchQueries.push("meilleurs parfums niche fragrantica 2024");
        }
      }

      /* Stage 3 — Researcher does parallel targeted searches */
      const candidateResults = await Promise.all(
        searchQueries.slice(0, 4).map((q) => tavilySearch(q).catch(() => "")),
      );
      const combinedCandidates = candidateResults
        .map((r, i) => `=== Recherche ${i + 1}: "${searchQueries[i]}" ===\n${r}`)
        .join("\n\n");

      /* Stage 4 — Curator ranks candidates strictly against the DNA */
      const exclusionList = [...likedFragrances, ...dislikedFragrances]
        .map((f) => `${f.brand} ${f.name}`)
        .join(" | ");

      // Scale the token budget with count: curator output is ~200 tok/rec
      const curatorMaxTokens = Math.max(1500, safeCount * 220);

      const curatorRaw = await openRouterCall(
        apiKey,
        [
          { role: "system", content: CURATOR_SYSTEM_PROMPT },
          {
            role: "user",
            content: `ADN OLFACTIF DE L'UTILISATEUR :
- Accords dominants : ${dna.dominant_accords.join(", ") || "—"}
- Notes clés : ${dna.key_notes.join(", ") || "—"}
- Notes à éviter : ${dna.avoid_notes.join(", ") || "—"}
- Personnalité : ${dna.personality || "—"}
- Sillage : ${dna.intensity_signature || "—"}
- Contexte : ${dna.wear_context || "—"}

PARFUMS AIMÉS (à citer dans les reasons quand pertinent) :
${likedList}

À EXCLURE (déjà connus) : ${exclusionList || "—"}

RÉSULTATS FRAGRANTICA (candidats) :
${combinedCandidates}

Sélectionne EXACTEMENT ${safeCount} parfums DIFFÉRENTS des parfums aimés/rejetés, qui respectent les contraintes absolues du system prompt. Chaque \`reason\` DOIT citer 1-2 notes spécifiques qui correspondent à key_notes.`,
          },
        ],
        curatorMaxTokens,
      );

      const curatorParsed = extractJson(curatorRaw) as {
        recommendations?: Partial<RecommendationCandidate>[];
      };
      const recommendations: RecommendationCandidate[] = (
        curatorParsed.recommendations ?? []
      )
        .filter((r) => r.name && r.brand)
        .slice(0, safeCount)
        .map((r) => ({
          name: r.name!,
          brand: r.brand!,
          family: r.family ?? "—",
          notes_brief: r.notes_brief ?? "",
          reason: r.reason ?? "",
          projection: r.projection ?? "",
          match_score: Math.min(
            99,
            Math.max(50, Math.round(r.match_score ?? 75)),
          ),
          image_url:
            r.image_url &&
            /^https?:\/\/.+\.(jpe?g|png|webp)(\?.*)?$/i.test(r.image_url)
              ? r.image_url
              : undefined,
          source_url:
            r.source_url ??
            `https://www.fragrantica.com/search/?query=${encodeURIComponent(`${r.brand} ${r.name}`)}`,
        }));

      return NextResponse.json({
        ok: true,
        mode: "recommend",
        recommendations,
        dna,
      } satisfies AgentResponse);
    } catch (e) {
      return NextResponse.json(
        {
          ok: false,
          error: "upstream_error",
          detail: e instanceof Error ? e.message : String(e),
        } satisfies AgentResponse,
        { status: 502 },
      );
    }
  }

  /* ── FRIEND_REPORT (sales-staff brief after "pour un ami" session) ── */
  if (body.mode === "friend_report") {
    const { profileContext, dna, matchedCards, dislikedCards } = body.payload;

    const fmt = (
      cards: typeof matchedCards,
    ): string =>
      cards.length
        ? cards
            .map(
              (c) =>
                `• ${c.brand} — ${c.name} [${c.family}] · notes : ${c.notes_brief} · raison match : ${c.reason}`,
            )
            .join("\n")
        : "(aucun)";

    try {
      const raw = await openRouterCall(
        apiKey,
        [
          { role: "system", content: REPORT_SYSTEM_PROMPT },
          {
            role: "user",
            content: `${profileContext}

ADN OLFACTIF extrait :
- Accords dominants : ${dna.dominant_accords.join(", ") || "—"}
- Notes clés : ${dna.key_notes.join(", ") || "—"}
- Notes à éviter : ${dna.avoid_notes.join(", ") || "—"}
- Personnalité : ${dna.personality || "—"}

Parfums MATCHÉS durant la session :
${fmt(matchedCards)}

Parfums REJETÉS :
${fmt(dislikedCards)}

Rédige le rapport JSON pour le vendeur.`,
          },
        ],
        1800,
      );

      const parsed = extractJson(raw) as Partial<FriendReport>;
      const report: FriendReport = {
        summary: parsed.summary ?? "",
        signature: parsed.signature ?? "",
        loved_references: (parsed.loved_references ?? []).slice(0, 3).map((r) => ({
          brand: r.brand ?? "",
          name: r.name ?? "",
          family: r.family ?? "",
          why: r.why ?? "",
        })),
        rejected_references: (parsed.rejected_references ?? [])
          .slice(0, 3)
          .map((r) => ({
            brand: r.brand ?? "",
            name: r.name ?? "",
            family: r.family ?? "",
            why: r.why ?? "",
          })),
        sales_advice: parsed.sales_advice ?? "",
      };

      return NextResponse.json({
        ok: true,
        mode: "friend_report",
        report,
      } satisfies AgentResponse);
    } catch (e) {
      return NextResponse.json(
        {
          ok: false,
          error: "upstream_error",
          detail: e instanceof Error ? e.message : String(e),
        } satisfies AgentResponse,
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ ok: false, error: "invalid_mode" } satisfies AgentResponse, { status: 400 });
}
