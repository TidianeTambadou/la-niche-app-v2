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
  type PerfumeCardData,
  type RecommendationCandidate,
  type SearchCandidate,
} from "@/lib/agent";
import {
  BOUTIQUE_DOMAINS,
  BOUTIQUE_IDS,
  findBoutiqueByUrl,
} from "@/lib/boutiques";
import {
  hasPerfumeData,
  runFragranticaAgent,
  type PerfumeJson,
} from "@/lib/fragrantica-agent";
import {
  getFragellaPerfume,
  searchFragella,
  type FragellaPerfume,
} from "@/lib/fragella";
import {
  checkQuota,
  consumeQuota,
  refundQuota,
  requireUserId,
} from "@/lib/quota";

// The recommend pipeline runs 4 LLM rounds + Tavily searches and routinely
// exceeds Vercel's default 10 s timeout. Without this, /api/agent returns a
// 504 HTML page whose body the client can't parse as JSON ("the string did
// not match the expected pattern" on iOS Safari). 60 s is the Hobby cap; Pro
// can go higher if needed.
export const maxDuration = 60;
export const runtime = "nodejs";

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

/** Fragrance knowledge base — generalist note/pyramid/review databases
 *  PLUS niche perfumery editorial sites and retailers that frequently ship
 *  the kind of detailed olfactive data the concierge needs to surface
 *  rare/independent maisons. */
const FRAGRANCE_KB_DOMAINS = [
  // Generalist databases
  "fragrantica.com",
  "fragrantica.fr",
  "basenotes.com",
  "parfumo.net",
  "parfumo.de",
  "fragrancex.com",
  "nstperfume.com",
  // Editorial / critic blogs
  "auparfum.com",
  "nezvrogue.com",
  "persolaise.com",
  "fragranceguy.com",
  "jasminandginja.com",
  "perfumeposse.com",
  "thedryowndown.com",
  "olfactif.com",
  "scenthurdle.com",
  "monsieur-de-france.com",
  // Niche retailers / curated catalogues
  "luckyscent.com",
  "twistedlily.com",
  "bloomperfumery.com",
  "scentbar.com",
  "scentbird.com",
  "nicheofficial.com",
  "fragrancesline.com",
  "essenza-nobile.com",
  "first-in-fragrance.com",
  "scentsplit.com",
  // Maison directs (frequently the most authoritative source)
  "amouage.com",
  "diptyqueparis.com",
  "fredericmalle.com",
  "byredo.com",
  "lartisanparfumeur.com",
  "serge-lutens.com",
  "guerlain.com",
  "tomford.com",
];

type TavilyResult = {
  title: string;
  url: string;
  content: string;
  /** Full page HTML when `include_raw_content` is true. Lets us extract
   *  reliable bottle image URLs (`fimgs.net/mdimg/...`) downstream. */
  raw_content?: string;
};

async function tavilySearchRaw(
  query: string,
  domains: string[],
  maxResults = 5,
  opts: { rawContent?: boolean } = {},
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
      include_raw_content: opts.rawContent ?? false,
    }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: TavilyResult[] };
  return data.results ?? [];
}

/* ─── Image URL allowlist ──────────────────────────────────────────────── */

const IMAGE_HOSTS = [
  "fimgs.net",
  "fragrantica.fr",
  "fragrantica.com",
  "www.fragrantica.fr",
  "www.fragrantica.com",
];

/** Strict allowlist of hosts the LLM is allowed to return as `image_url`.
 *  Filters out garbage like ad-tracker pixels or hallucinated CDNs. */
function isValidPerfumeImageUrl(url: unknown): url is string {
  if (typeof url !== "string" || !url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return IMAGE_HOSTS.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    );
  } catch {
    return false;
  }
}

/** Build a short ≤50 char `notes_brief` from a Fragella perfume — picks
 *  the most distinctive notes per layer and trims. */
function buildBriefFromFragella(p: FragellaPerfume): string {
  const noteNames = [
    ...p.notes.top.map((n) => n.name),
    ...p.notes.middle.map((n) => n.name),
    ...p.notes.base.map((n) => n.name),
  ];
  const accordNames = p.accords.map((a) => a.name);
  const all = [...noteNames, ...accordNames];
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const v of all) {
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(v);
    if (unique.length >= 5) break;
  }
  const joined = unique.join(", ");
  return joined.length <= 50 ? joined : joined.slice(0, 47) + "…";
}

/** Public PerfumeCardData payload — what the "Carte signée La Niche" modal
 *  consumes. Same shape as FragellaPerfume but typed in the shared agent
 *  module so it can travel over the wire. */
function fragellaToCardData(p: FragellaPerfume): PerfumeCardData {
  const mapNotes = (ns: typeof p.notes.top) =>
    ns.map((n) => (n.imageUrl ? { name: n.name, imageUrl: n.imageUrl } : { name: n.name }));
  return {
    name: p.name,
    brand: p.brand,
    image_url: p.image_url,
    description: p.description,
    gender: p.gender,
    family: p.family,
    notes: {
      top: mapNotes(p.notes.top),
      middle: mapNotes(p.notes.middle),
      base: mapNotes(p.notes.base),
    },
    accords: p.accords.map((a) => ({
      name: a.name,
      ...(a.weight !== undefined ? { weight: a.weight } : {}),
    })),
    longevity: p.longevity,
    sillage: p.sillage,
    seasons: p.seasons,
    day_time: p.day_time,
    rating: p.rating,
    reviews_count: p.reviews_count,
    source_url: p.source_url,
  };
}

/** Map a Fragella perfume into the SearchCandidate shape the front-end
 *  expects. Embeds the full `card` payload so the "Carte signée La Niche"
 *  modal can open instantly without a second fetch. */
function fragellaToSearchCandidate(p: FragellaPerfume): SearchCandidate {
  return {
    name: p.name,
    brand: p.brand,
    notes_brief: buildBriefFromFragella(p),
    family: p.family ?? undefined,
    image_url: p.image_url ?? undefined,
    source_url:
      p.source_url ??
      `https://www.fragrantica.com/search/?query=${encodeURIComponent(`${p.brand} ${p.name}`)}`,
    card: fragellaToCardData(p),
  };
}

/** Flatten the agent's pyramid + accords into a short ≤80 char human string
 *  for `IdentifyResult.notes_brief`. */
function buildNotesBriefFromPyramid(p: PerfumeJson): string {
  const parts: string[] = [];
  for (const list of [p.notes.top, p.notes.middle, p.notes.base, p.accords]) {
    if (Array.isArray(list)) parts.push(...list);
  }
  // Dedupe while preserving order, then trim to 80 chars.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const v of parts) {
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(v);
  }
  const joined = unique.join(", ");
  return joined.length <= 80 ? joined : joined.slice(0, 77) + "…";
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

    // Auth + quota gate. Even autocomplete burns tokens (Fragella + Tavily
    // fallback) — anonymous users get redirected to signup, free users have
    // a hard monthly cap.
    const userId = await requireUserId(req);
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "auth_required", detail: "Crée un compte pour rechercher." } satisfies AgentResponse,
        { status: 401 },
      );
    }

    const cacheKey = query.toLowerCase();
    const cached = cachedSearch(cacheKey);
    // Cache hits don't bump the quota — only outbound API calls cost tokens.
    if (cached) return NextResponse.json({ ok: true, mode: "search", candidates: cached } satisfies AgentResponse);

    const gate = await checkQuota(userId, "searches");
    if (!gate.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "quota_exceeded",
          detail: `Tu as utilisé tes ${gate.limit} recherches ce mois-ci. Passe à un palier supérieur pour continuer.`,
        } satisfies AgentResponse,
        { status: 402 },
      );
    }

    // PRIMARY — Fragella (single round trip, no LLM, real images).
    // Three outcomes drive different paths:
    //   - hits[]   (length > 0) → return them, done
    //   - hits[]   (length 0)   → Fragella reached, no match → return empty
    //                              so the UI shows the concierge CTA
    //   - null                  → Fragella unreachable / quota'd → fall
    //                              through to Tavily scrape pipeline below
    let fragellaHits: Awaited<ReturnType<typeof searchFragella>> = null;
    try {
      fragellaHits = await searchFragella(query, 5);
    } catch (e) {
      console.error("[search] Fragella threw:", e);
      fragellaHits = null;
    }
    if (fragellaHits !== null) {
      const candidates = fragellaHits.map(fragellaToSearchCandidate);
      rememberSearch(cacheKey, candidates);
      // Compte 1 search seulement quand on a effectivement appelé Fragella
      // (pas en cache hit). On ne refund pas en cas d'empty-result : Fragella
      // a quand même consommé du quota côté provider.
      void consumeQuota(userId, "searches").catch(() => {});
      return NextResponse.json({
        ok: true,
        mode: "search",
        candidates,
      } satisfies AgentResponse);
    }
    // fragellaHits === null → Fragella down/quota → continue to Tavily.

    try {
      // Tavily with raw_content → we get the actual Fragrantica HTML, which
      // contains the real fimgs.net bottle image URLs. The LLM is asked to
      // pull image_url out of the matching <img itemprop="image"> tag.
      const rawResults = await tavilySearchRaw(
        `parfum ${query} site:fragrantica.fr`,
        ["fragrantica.fr", "www.fragrantica.fr"],
        6,
        { rawContent: true },
      );
      const userPrompt = rawResults.length
        ? (() => {
            const webResults = rawResults
              .map((r) => {
                const body = r.raw_content
                  ? r.raw_content.slice(0, 6000)
                  : r.content;
                return `URL: ${r.url}\nTitle: ${r.title}\n\n${body}`;
              })
              .join("\n\n---\n\n");
            return `Requête autocomplete: "${query}"

Résultats fragrantica.fr (HTML brut tronqué) :
${webResults}

Extrait jusqu'à 4 parfums correspondant à la requête. Pour CHAQUE parfum :
- name, brand, family (≤ 30 char), notes_brief (≤ 50 char)
- image_url : URL exacte de l'image principale du flacon trouvée dans le HTML.
  - Cherche le tag <img itemprop="image" src="..."> ou un <img> dans <picture>
  - Format attendu : https://fimgs.net/mdimg/perfume-thumbs/375x500.<ID>.jpg
  - Utilise UNIQUEMENT l'URL exacte trouvée dans le HTML, ne l'invente jamais.
  - Si introuvable, mets null.
- source_url : URL fragrantica.fr du parfum (depuis "URL:" dans les résultats)

JSON STRICT, sans markdown :
{"candidates":[{"name":"","brand":"","notes_brief":"","family":"","image_url":null,"source_url":""}]}`;
          })()
        : `Requête: "${query}"

Aucune donnée web disponible. Utilise tes connaissances sur les parfums (fragrantica.com, basenotes.com) pour proposer jusqu'à 4 parfums correspondant à cette requête.

Pour CHAQUE parfum :
- name : nom exact du parfum
- brand : marque exacte
- family : famille olfactive (≤ 30 char, ex: Woody, Floral, Citrus…)
- notes_brief : notes principales (≤ 50 char, ex: "Bergamote, Cèdre, Vétiver")
- image_url : null (pas de données HTML disponibles)
- source_url : URL fragrantica.com si tu la connais avec certitude, sinon https://www.fragrantica.com/search/?query=${encodeURIComponent(query)}

JSON STRICT, sans markdown :
{"candidates":[{"name":"","brand":"","notes_brief":"","family":"","image_url":null,"source_url":""}]}`;

      const text = await openRouterCall(
        apiKey,
        [
          { role: "system", content: SEARCH_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        900,
      );

      const parsed = extractJson(text) as {
        candidates?: Array<Partial<SearchCandidate> & { source_url?: string }>;
      };
      const candidates: SearchCandidate[] = (parsed.candidates ?? [])
        .filter((c) => c.name && c.brand)
        .slice(0, 4)
        .map((c) => {
          // Trust the LLM-supplied source_url only if it points to a real
          // perfume page on fragrantica; otherwise fall back to URL-picker.
          const llmSource =
            typeof c.source_url === "string" &&
            /fragrantica\.[a-z]+\/perfume\//i.test(c.source_url)
              ? c.source_url
              : undefined;
          const sourceUrl =
            llmSource ?? pickSourceUrl(c.brand!, c.name!, rawResults);
          return {
            name: c.name!,
            brand: c.brand!,
            notes_brief: c.notes_brief ?? "",
            source_url: sourceUrl,
            family: c.family,
            image_url: isValidPerfumeImageUrl(c.image_url)
              ? c.image_url
              : undefined,
          } satisfies SearchCandidate;
        });

      rememberSearch(cacheKey, candidates);
      // Tavily fallback = ~$0.01 par appel. On compte aussi.
      void consumeQuota(userId, "searches").catch(() => {});
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

    // Auth + quota gate (scan = vision Claude + Tavily ≈ $0.02-0.04/appel).
    const userId = await requireUserId(req);
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "auth_required", detail: "Crée un compte pour scanner un parfum." } satisfies AgentResponse,
        { status: 401 },
      );
    }
    const scanGate = await checkQuota(userId, "scans");
    if (!scanGate.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "quota_exceeded",
          detail: `Tu as utilisé tes ${scanGate.limit} scans ce mois-ci. Passe à un palier supérieur pour continuer.`,
        } satisfies AgentResponse,
        { status: 402 },
      );
    }
    let scanConsumed = false;
    try {
      await consumeQuota(userId, "scans");
      scanConsumed = true;
    } catch (e) {
      console.warn("[scan] consumeQuota failed:", e);
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

      // Scan = agent Fragrantica direct (sans passer par Fragella). L'agent
      // scrape le HTML brut depuis Tavily et extrait pyramide + image_url —
      // plus fiable sur les noms confidentiels que la lookup Fragella, qui
      // confondait parfois les variantes (Aventus / Aventus Cologne / etc.).
      const enriched: PerfumeJson = await runFragranticaAgent({
        query: `${vision.brand} ${vision.name}`,
      });

      const enrichedNotesBrief = buildNotesBriefFromPyramid(enriched);
      const result: IdentifyResult = {
        name: enriched.name ?? vision.name,
        brand: enriched.brand ?? vision.brand,
        confidence: vision.confidence ?? 0.7,
        notes_brief:
          enrichedNotesBrief ||
          enriched.description?.slice(0, 80) ||
          vision.notes_brief ||
          "",
        source_url: hasPerfumeData(enriched)
          ? `https://www.fragrantica.fr/recherche.php?q=${encodeURIComponent(`${vision.brand} ${vision.name}`)}`
          : `https://www.fragrantica.com/search/?query=${encodeURIComponent(`${vision.brand} ${vision.name}`)}`,
        ...(isValidPerfumeImageUrl(enriched.image_url)
          ? { image_url: enriched.image_url }
          : {}),
      };

      return NextResponse.json({ ok: true, mode: "identify", result } satisfies AgentResponse);
    } catch (e) {
      // Refund le scan si le pipeline a planté (l'utilisateur ne doit pas
      // perdre un crédit pour une erreur upstream).
      if (scanConsumed) {
        await refundQuota(userId, "scans").catch(() => {});
      }
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

    // Auth + quota gate (concierge IA = Tavily + LLM ≈ $0.012/appel).
    const askUserId = await requireUserId(req);
    if (!askUserId) {
      return NextResponse.json(
        { ok: false, error: "auth_required", detail: "Crée un compte pour parler au concierge." } satisfies AgentResponse,
        { status: 401 },
      );
    }
    const askGate = await checkQuota(askUserId, "asks");
    if (!askGate.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "quota_exceeded",
          detail: `Tu as utilisé tes ${askGate.limit} questions au concierge ce mois-ci. Passe à un palier supérieur.`,
        } satisfies AgentResponse,
        { status: 402 },
      );
    }
    let askConsumed = false;
    try {
      await consumeQuota(askUserId, "asks");
      askConsumed = true;
    } catch (e) {
      console.warn("[ask] consumeQuota failed:", e);
    }

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
      if (askConsumed) {
        await refundQuota(askUserId, "asks").catch(() => {});
      }
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

    // ── Quota gate ──
    // The recommend pipeline is the most expensive call in the app
    // (~$0.08-0.13). Require auth, deduct atomically before doing the work,
    // refund on upstream failure so a flaky API doesn't burn user credits.
    const userId = await requireUserId(req);
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "auth_required", detail: "Connecte-toi pour générer des recommandations." } satisfies AgentResponse,
        { status: 401 },
      );
    }
    const gate = await checkQuota(userId, "recos");
    if (!gate.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "quota_exceeded",
          detail: `Tu as utilisé tes ${gate.limit} recommandations ce mois-ci. Passe à un palier supérieur pour continuer.`,
        } satisfies AgentResponse,
        { status: 402 },
      );
    }
    let consumed = false;
    try {
      await consumeQuota(userId, "recos");
      consumed = true;
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
      // Refund the credit so a flaky upstream doesn't punish the user.
      if (consumed) {
        await refundQuota(userId, "recos").catch((err) =>
          console.warn("[recommend] refund failed:", err),
        );
      }
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

  /* ── CARD (rich perfume sheet for the "Carte signée La Niche" modal) ──
   * On-demand lookup used when a SearchCandidate doesn't already carry the
   * rich `card` payload (e.g. came from the legacy Tavily fallback or a
   * local catalog entry). Pure Fragella, no LLM. */
  if (body.mode === "card") {
    const { brand, name } = body.payload ?? { brand: "", name: "" };
    const trimmedBrand = brand.trim();
    const trimmedName = name.trim();
    if (!trimmedBrand || !trimmedName) {
      return NextResponse.json({
        ok: false,
        error: "missing_perfume",
      } satisfies AgentResponse, { status: 400 });
    }
    try {
      const fragella = await getFragellaPerfume(trimmedBrand, trimmedName);
      const perfume: PerfumeCardData | null = fragella
        ? fragellaToCardData(fragella)
        : null;
      return NextResponse.json({
        ok: true,
        mode: "card",
        perfume,
      } satisfies AgentResponse);
    } catch (e) {
      return NextResponse.json({
        ok: false,
        error: "upstream_error",
        detail: e instanceof Error ? e.message : String(e),
      } satisfies AgentResponse, { status: 502 });
    }
  }

  return NextResponse.json({ ok: false, error: "invalid_mode" } satisfies AgentResponse, { status: 400 });
}
