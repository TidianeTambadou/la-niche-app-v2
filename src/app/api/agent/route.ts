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
import {
  BOUTIQUE_DOMAINS,
  BOUTIQUE_IDS,
  findBoutiqueByUrl,
} from "@/lib/boutiques";

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

/** Fragrance knowledge base — notes, pyramid, reviews. */
const FRAGRANCE_KB_DOMAINS = [
  "fragrantica.com",
  "fragrantica.fr",
  "basenotes.com",
  "parfumo.net",
  "fragrancex.com",
  "nstperfume.com",
];

type TavilyResult = { title: string; url: string; content: string };

async function tavilySearchRaw(
  query: string,
  domains: string[],
  maxResults = 5,
): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      include_domains: domains,
      search_depth: "advanced",
      max_results: maxResults,
    }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: TavilyResult[] };
  return data.results ?? [];
}

/* ─── Source-URL picker ──────────────────────────────────────────────────
 * Image scraping was removed: results were unreliable (wrong perfumes,
 * 404s) and the UI now displays a logo-watermarked placeholder instead.
 * We still want the *source* URL to point at the real Fragrantica perfume
 * page when possible, so the user can open the right page if they want.
 * ---------------------------------------------------------------------- */

/** Pick the best Fragrantica perfume URL for a (brand, name) candidate from
 *  a pool of Tavily results. Falls back to the search query URL. */
function pickSourceUrl(
  brand: string,
  name: string,
  results: TavilyResult[],
): string {
  const brandSlug = brand.toLowerCase().replace(/\s+/g, "-");
  const nameSlug = name.toLowerCase().replace(/\s+/g, "-");
  const perfumeHit = results.find((r) => {
    const url = r.url.toLowerCase();
    if (!url.includes("fragrantica") || !url.includes("/perfume/")) return false;
    return url.includes(brandSlug) && url.includes(nameSlug);
  });
  if (perfumeHit) return perfumeHit.url;
  return `https://www.fragrantica.com/search/?query=${encodeURIComponent(`${brand} ${name}`)}`;
}

/** Pretty-formatted string of results — used by search/identify/ask modes. */
async function tavilySearch(
  query: string,
  domains: string[] = FRAGRANCE_KB_DOMAINS,
): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return "[Tavily non configuré]";
  const results = await tavilySearchRaw(query, domains);
  if (results.length === 0) return "[Tavily: aucun résultat]";
  return results
    .map((r) => `## ${r.title}\nSource: ${r.url}\n${r.content}`)
    .join("\n\n---\n\n");
}

/* ─── Boutique catalog discovery ─────────────────────────────────────────
 * Run parallel Tavily searches scoped to the 4 partner boutique domains so
 * the Curator can prioritise parfums the user can actually walk in and
 * smell. Results are tagged with the boutique shortLabel and city.
 * ---------------------------------------------------------------------- */

type BoutiqueHit = {
  boutiqueId: string;
  boutiqueLabel: string;
  city: string;
  title: string;
  url: string;
  content: string;
};

function buildBoutiqueQueries(
  dna: OlfactiveDNA,
  liked: Array<{ brand: string; name: string }>,
): string[] {
  const queries: string[] = [];
  const keyNotes = dna.key_notes.slice(0, 3).filter(Boolean);
  const accord = dna.dominant_accords[0];
  if (keyNotes.length > 0) {
    queries.push(`parfum niche ${keyNotes.join(" ")}`);
  }
  if (accord) {
    queries.push(`parfum ${accord}`);
  }
  if (liked.length > 0) {
    queries.push(`parfum similaire ${liked[0].brand} ${liked[0].name}`);
  }
  if (queries.length === 0) {
    queries.push("parfum niche");
  }
  return queries.slice(0, 3);
}

async function searchBoutiques(
  dna: OlfactiveDNA,
  liked: Array<{ brand: string; name: string }>,
): Promise<BoutiqueHit[]> {
  const queries = buildBoutiqueQueries(dna, liked);
  const raw = await Promise.all(
    queries.map((q) =>
      tavilySearchRaw(q, BOUTIQUE_DOMAINS, 6).catch(() => []),
    ),
  );
  const hits: BoutiqueHit[] = [];
  const seen = new Set<string>();
  for (const results of raw) {
    for (const r of results) {
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      const b = findBoutiqueByUrl(r.url);
      if (!b) continue;
      hits.push({
        boutiqueId: b.id,
        boutiqueLabel: b.shortLabel,
        city: b.city,
        title: r.title,
        url: r.url,
        content: r.content,
      });
    }
  }
  return hits;
}

function formatBoutiqueHits(hits: BoutiqueHit[]): string {
  if (hits.length === 0) {
    return "(Aucun résultat boutique — pipeline Tavily sans match. Propose quand même des parfums cohérents et renseigne available_at: [].)";
  }
  // Group by boutique so the Curator sees a clear catalog per shop.
  const byShop = new Map<string, BoutiqueHit[]>();
  for (const h of hits) {
    const list = byShop.get(h.boutiqueId) ?? [];
    list.push(h);
    byShop.set(h.boutiqueId, list);
  }
  const blocks: string[] = [];
  for (const [id, items] of byShop) {
    const label = items[0].boutiqueLabel;
    const city = items[0].city;
    const lines = items
      .map(
        (h) =>
          `  • ${h.title}\n    URL: ${h.url}\n    Extrait: ${h.content.slice(0, 180)}`,
      )
      .join("\n");
    blocks.push(`=== BOUTIQUE id="${id}" — ${label} (${city}) ===\n${lines}`);
  }
  return blocks.join("\n\n");
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
      // Keep the raw Tavily results around so we can map each candidate to
      // its actual Fragrantica perfume page URL (needed for og:image scrape).
      const rawResults = await tavilySearchRaw(
        `parfum ${query} site:fragrantica.com`,
        FRAGRANCE_KB_DOMAINS,
        6,
      );
      const webResults = rawResults.length
        ? rawResults
            .map((r) => `## ${r.title}\nSource: ${r.url}\n${r.content}`)
            .join("\n\n---\n\n")
        : "[Tavily: aucun résultat]";

      const text = await openRouterCall(
        apiKey,
        [
          { role: "system", content: SEARCH_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Requête autocomplete: "${query}"\n\nRésultats web:\n${webResults}\n\nJSON STRICT, max 4 candidats:\n{"candidates":[{"name":"...","brand":"...","notes_brief":"≤50 char","family":"≤30 char"}]}`,
          },
        ],
        600,
      );

      const parsed = extractJson(text) as { candidates?: Partial<SearchCandidate>[] };
      const baseCandidates = (parsed.candidates ?? [])
        .filter((c) => c.name && c.brand)
        .slice(0, 4)
        .map((c) => {
          const sourceUrl = pickSourceUrl(c.brand!, c.name!, rawResults);
          return {
            name: c.name!,
            brand: c.brand!,
            notes_brief: c.notes_brief ?? "",
            source_url: sourceUrl,
            family: c.family,
          } satisfies Omit<SearchCandidate, "image_url">;
        });

      // Image scraping was removed (unreliable). The frontend now renders a
      // logo-watermarked placeholder card with brand + name + notes.
      const candidates: SearchCandidate[] = baseCandidates.map((c) => ({
        ...c,
        image_url: undefined,
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

      /* Stage 3 — Researcher does parallel targeted searches (knowledge base
         + boutique catalogs in parallel). Boutique hits let the Curator
         prioritise parfums the user can actually smell in-store. */
      const [candidateResults, boutiqueHits] = await Promise.all([
        Promise.all(
          searchQueries.slice(0, 4).map((q) =>
            tavilySearch(q, FRAGRANCE_KB_DOMAINS).catch(() => ""),
          ),
        ),
        searchBoutiques(dna, likedFragrances),
      ]);
      const combinedCandidates = candidateResults
        .map((r, i) => `=== Recherche ${i + 1}: "${searchQueries[i]}" ===\n${r}`)
        .join("\n\n");
      const boutiqueSection = formatBoutiqueHits(boutiqueHits);

      /* Stage 4 — Curator ranks candidates strictly against the DNA */
      const exclusionList = [...likedFragrances, ...dislikedFragrances]
        .map((f) => `${f.brand} ${f.name}`)
        .join(" | ");

      // Scale the token budget with count: curator output is ~220 tok/rec
      const curatorMaxTokens = Math.max(1800, safeCount * 240);

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

=== RÉSULTATS BOUTIQUES PARTENAIRES ★ PRIORISE CES PARFUMS ★ ===
Ce sont les parfums réellement en stock chez nos 4 boutiques partenaires que l'utilisateur peut aller sentir. Au moins 70% de tes recommandations doivent venir de cette liste. Remplis \`available_at\` avec les IDs des boutiques où chaque parfum apparaît.

${boutiqueSection}

=== RÉSULTATS FRAGRANTICA (connaissance des notes/pyramides) ===
${combinedCandidates}

Sélectionne EXACTEMENT ${safeCount} parfums DIFFÉRENTS des parfums aimés/rejetés. Règles absolues du system prompt + priorité forte aux parfums boutiques. Chaque \`reason\` DOIT citer 1-2 notes spécifiques qui correspondent à key_notes.`,
          },
        ],
        curatorMaxTokens,
      );

      const curatorParsed = extractJson(curatorRaw) as {
        recommendations?: Partial<RecommendationCandidate>[];
      };
      const baseRecommendations = (curatorParsed.recommendations ?? [])
        .filter((r) => r.name && r.brand)
        .slice(0, safeCount)
        .map((r) => {
          // Tolerate both array and comma-separated-string shapes. LLMs
          // occasionally drift from the schema; we coerce back to arrays.
          const toArray = (v: unknown): string[] => {
            if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
            if (typeof v === "string")
              return v
                .split(/[,;·]/)
                .map((s) => s.trim())
                .filter(Boolean);
            return [];
          };
          // LLM-claimed availability, clamped to known boutique IDs.
          const claimedAvailable = toArray(
            (r as Partial<RecommendationCandidate>).available_at,
          ).filter((id) => BOUTIQUE_IDS.includes(id));

          // Post-hoc enrichment: some models forget to fill available_at
          // even when the parfum clearly appears in a boutique result.
          // Scan boutique hits for the brand+name substring.
          const needle = `${r.brand} ${r.name}`.toLowerCase();
          const brandOnly = (r.brand ?? "").toLowerCase();
          const nameOnly = (r.name ?? "").toLowerCase();
          const inferred = new Set<string>(claimedAvailable);
          for (const hit of boutiqueHits) {
            const hay = `${hit.title} ${hit.content}`.toLowerCase();
            const matchesBoth =
              hay.includes(brandOnly) && hay.includes(nameOnly);
            const matchesFull = hay.includes(needle);
            if (matchesBoth || matchesFull) inferred.add(hit.boutiqueId);
          }

          return {
            name: r.name!,
            brand: r.brand!,
            family: r.family ?? "—",
            notes_brief: r.notes_brief ?? "",
            notes_top: toArray(r.notes_top).slice(0, 5),
            notes_heart: toArray(r.notes_heart).slice(0, 5),
            notes_base: toArray(r.notes_base).slice(0, 5),
            price_range:
              typeof r.price_range === "string" && r.price_range.trim()
                ? r.price_range.trim()
                : "—",
            reason: r.reason ?? "",
            projection: r.projection ?? "",
            match_score: Math.min(
              99,
              Math.max(50, Math.round(r.match_score ?? 75)),
            ),
            available_at: Array.from(inferred),
            // Image scraping disabled — UI renders a logo placeholder.
            image_url: undefined,
            source_url:
              r.source_url ??
              `https://www.fragrantica.com/search/?query=${encodeURIComponent(`${r.brand} ${r.name}`)}`,
          } satisfies RecommendationCandidate;
        });

      const recommendations: RecommendationCandidate[] = baseRecommendations;

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
