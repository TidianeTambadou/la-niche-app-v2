/**
 * Fragrantica agent — agentic loop with Tavily tool-calling.
 *
 * Direct port of the Deno Edge Function used by our other app (the one that
 * "works well" per spec). The LLM is given a `search_web` tool and iterates
 * (up to MAX_LOOPS times) until it can return a complete PerfumeJson —
 * including the bottle's real `image_url` extracted from Fragrantica's raw
 * HTML (`fimgs.net/mdimg/...` URLs are validated against an allowlist).
 *
 * Server-side only. Never import from a Client Component — calls leak the
 * OpenRouter and Tavily API keys.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const TAVILY_URL = "https://api.tavily.com/search";
const ALLOWED_HOST = "www.fragrantica.fr";
const MAX_LOOPS = 4;

/** Vision-capable models with reliable tool-calling support, tried in order
 *  via OpenRouter's `route: "fallback"`. */
const FRAGRANTICA_AGENT_MODELS = [
  "google/gemini-2.0-flash-001",
  "google/gemini-flash-1.5",
  "openai/gpt-4o-mini",
];

/* -------------------------------------------------------------------------
 * Public types
 * --------------------------------------------------------------------- */

export interface PerfumeJson {
  name: string | null;
  brand: string | null;
  image_url: string | null;
  description: string | null;
  gender: string | null;
  concentration: string | null;
  notes: {
    top: string[] | null;
    middle: string[] | null;
    base: string[] | null;
  };
  accords: string[] | null;
  rating: number | null;
  reviews_count: number | null;
  longevity: string | null;
  sillage: string | null;
  season: string[] | null;
  occasion: string[] | null;
}

const FAILURE: PerfumeJson = {
  name: null,
  brand: null,
  image_url: null,
  description: null,
  gender: null,
  concentration: null,
  notes: { top: null, middle: null, base: null },
  accords: null,
  rating: null,
  reviews_count: null,
  longevity: null,
  sillage: null,
  season: null,
  occasion: null,
};

function failure(): PerfumeJson {
  return { ...FAILURE, notes: { top: null, middle: null, base: null } };
}

/* -------------------------------------------------------------------------
 * URL validation — strict allowlist for image hosts so the agent can never
 * smuggle in a bogus URL that would 404 (or worse).
 * --------------------------------------------------------------------- */

function isAllowedFragranticaUrl(url: unknown): url is string {
  if (typeof url !== "string" || !url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === ALLOWED_HOST;
  } catch {
    return false;
  }
}

function isAllowedImageUrl(url: unknown): boolean {
  if (typeof url !== "string" || !url) return false;
  try {
    const h = new URL(url).hostname.toLowerCase();
    return (
      h === ALLOWED_HOST ||
      h === "fragrantica.fr" ||
      h === "fragrantica.com" ||
      h === "fimgs.net" ||
      h.endsWith(".fragrantica.fr") ||
      h.endsWith(".fragrantica.com") ||
      h.endsWith(".fimgs.net")
    );
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------
 * Sanitisers — coerce LLM output back into the strict PerfumeJson schema.
 * --------------------------------------------------------------------- */

function toStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

function toArr(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.length ? out : null;
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    if (isFinite(n)) return n;
  }
  return null;
}

function sanitize(raw: unknown): PerfumeJson {
  if (!raw || typeof raw !== "object") return failure();
  const r = raw as Record<string, unknown>;
  const n =
    r.notes && typeof r.notes === "object"
      ? (r.notes as Record<string, unknown>)
      : {};
  const imgRaw = toStr(r.image_url);
  const reviewsRaw = toNum(r.reviews_count);
  return {
    name: toStr(r.name),
    brand: toStr(r.brand),
    image_url: isAllowedImageUrl(imgRaw) ? imgRaw : null,
    description: toStr(r.description),
    gender: toStr(r.gender),
    concentration: toStr(r.concentration),
    notes: {
      top: toArr(n.top),
      middle: toArr(n.middle),
      base: toArr(n.base),
    },
    accords: toArr(r.accords),
    rating: toNum(r.rating),
    reviews_count: reviewsRaw !== null ? Math.round(reviewsRaw) : null,
    longevity: toStr(r.longevity),
    sillage: toStr(r.sillage),
    season: toArr(r.season),
    occasion: toArr(r.occasion),
  };
}

export function hasPerfumeData(p: PerfumeJson): boolean {
  return !!(
    p.name ||
    p.brand ||
    p.description ||
    p.image_url ||
    p.accords ||
    p.notes.top ||
    p.notes.middle ||
    p.notes.base ||
    p.rating !== null ||
    p.reviews_count !== null
  );
}

function tryParse(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    /* fall through */
  }
  const m = t.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {
      /* fall through */
    }
  }
  return null;
}

/* -------------------------------------------------------------------------
 * Tavily web_search tool — returns formatted HTML excerpts (raw_content
 * preferred over the snippet so the agent sees the bottle <img> tag).
 * --------------------------------------------------------------------- */

async function searchTavily(query: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return "Search unavailable — Tavily not configured.";

  const res = await fetch(TAVILY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query: `${query} site:fragrantica.fr`,
      search_depth: "advanced",
      include_domains: ["fragrantica.fr", "www.fragrantica.fr"],
      max_results: 5,
      include_raw_content: true,
      include_answer: false,
    }),
  });

  if (!res.ok) {
    return "Search failed — no results available.";
  }

  const data = (await res.json()) as {
    results?: Array<{
      url: string;
      title: string;
      content: string;
      raw_content?: string;
    }>;
  };
  if (!data.results?.length) return "No results found on fragrantica.fr.";

  return data.results
    .map((r) => {
      const content = r.raw_content ? r.raw_content.slice(0, 8000) : r.content;
      return `URL: ${r.url}\nTitle: ${r.title}\n\n${content}`;
    })
    .join("\n\n---\n\n");
}

/* -------------------------------------------------------------------------
 * System prompt + tool schema — copy-equivalent of the Deno script.
 * --------------------------------------------------------------------- */

const SYSTEM_PROMPT = `You are a deterministic API-like agent designed to return structured perfume data in strict JSON format.

You ONLY return valid JSON. Never output explanations, comments, markdown, or text outside JSON.

You have access to a search_web tool. ALWAYS use it to find the perfume page on fragrantica.fr before answering. Never rely solely on your training data.

SOURCE RESTRICTION
- Extract data ONLY from pages on https://www.fragrantica.fr.
- If you cannot find the perfume on www.fragrantica.fr, return every field as null.
- NEVER use data from any other website.

EXTRACTION RULES
- name, brand, image_url, description, gender, rating, reviews_count: extract directly from the Fragrantica.fr page.
- concentration: only if the page explicitly mentions EDT, EDP, Extrait, Parfum, Cologne, etc. Otherwise null.
- notes.top / notes.middle / notes.base: fill only if the page shows those pyramid levels; otherwise null.
- accords: main accords listed on Fragrantica, no percentages, as JSON array of strings.
- longevity, sillage: dominant category if available; otherwise null.
- season: dominant seasons as JSON array of strings.
- occasion: explicit day/night/office/evening/daily signals only; otherwise null.
- image_url: look for the main perfume bottle image in the raw HTML. It follows this pattern: https://fimgs.net/mdimg/perfume-thumbs/375x500.<ID>.jpg — find the <img> tag with itemprop="image" or the one inside a <picture> element on the perfume page. Use ONLY this exact URL from the HTML, never construct or guess it.

REQUIRED JSON SCHEMA (return exactly this shape, no extra fields):
{"name":null,"brand":null,"image_url":null,"description":null,"gender":null,"concentration":null,"notes":{"top":null,"middle":null,"base":null},"accords":null,"rating":null,"reviews_count":null,"longevity":null,"sillage":null,"season":null,"occasion":null}

You are an API. Return JSON only. No markdown fences. No explanation.`;

const SEARCH_TOOL = {
  type: "function",
  function: {
    name: "search_web",
    description:
      "Search fragrantica.fr for perfume information. Always call this before answering.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query — include perfume name and brand.",
        },
      },
      required: ["query"],
    },
  },
};

type Message = {
  role: string;
  content: string | null;
  tool_calls?: unknown[];
  tool_call_id?: string;
  name?: string;
};

function buildInitialPrompt(input: { url?: string; query?: string }): string {
  if (input.url) {
    return `Find and extract perfume data from this Fragrantica.fr URL. Search for it if needed, then return the JSON.\n\nURL: ${input.url}`;
  }
  return `Find the perfume "${input.query}" on fragrantica.fr and extract all its data. Use the search_web tool first, then return the JSON.`;
}

/* -------------------------------------------------------------------------
 * OpenRouter call — supports two modes per loop iteration:
 *   - useTools=true  : LLM may call search_web. Final answer comes when it
 *                      stops calling tools.
 *   - useTools=false : forces JSON output, used on the final pass to make
 *                      sure we get a parseable answer.
 * --------------------------------------------------------------------- */

async function callOpenRouter(
  messages: Message[],
  useTools: boolean,
): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  async function once(tokens: number): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; body: string }> {
    const body: Record<string, unknown> = {
      models: FRAGRANTICA_AGENT_MODELS,
      route: "fallback",
      messages,
      temperature: 0,
      max_tokens: tokens,
    };
    if (useTools) {
      body.tools = [SEARCH_TOOL];
      body.tool_choice = "auto";
    } else {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "http-referer": "https://laniche.app",
        "x-title": "La Niche · Fragrantica Agent",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, status: res.status, body: txt };
    }
    return { ok: true, data: (await res.json()) as Record<string, unknown> };
  }

  // 800 tokens is enough for a JSON Fragrantica payload; lower than the old
  // 1500 keeps low-credit OpenRouter accounts under their hard cap.
  let attempt = await once(800);
  if (!attempt.ok && attempt.status === 402) {
    const m = /can only afford (\d+)/i.exec(attempt.body);
    if (m) {
      const afford = Math.max(64, Math.floor(Number(m[1]) * 0.9));
      if (afford < 800) {
        attempt = await once(afford);
      }
    }
  }
  if (!attempt.ok) {
    throw new Error(`OpenRouter ${attempt.status}: ${attempt.body.slice(0, 400)}`);
  }
  return attempt.data;
}

/* -------------------------------------------------------------------------
 * Main entry — runs the agentic loop and returns a strict PerfumeJson.
 * Never throws: all upstream failures collapse to `failure()` (all-null
 * fields), so callers can treat absence-of-data uniformly.
 * --------------------------------------------------------------------- */

export async function runFragranticaAgent(input: {
  url?: string;
  query?: string;
}): Promise<PerfumeJson> {
  if (input.url && !isAllowedFragranticaUrl(input.url)) return failure();
  if (!input.url && !input.query?.trim()) return failure();
  if (!process.env.OPENROUTER_API_KEY) return failure();
  if (!process.env.TAVILY_API_KEY) return failure();

  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildInitialPrompt(input) },
  ];

  try {
    for (let i = 0; i < MAX_LOOPS; i++) {
      const isFinalPass = i === MAX_LOOPS - 1;
      const data = await callOpenRouter(messages, !isFinalPass);
      const choices = data.choices as Array<Record<string, unknown>>;
      const choice = choices?.[0];
      const message = choice?.message as Record<string, unknown> | undefined;
      const finishReason = choice?.finish_reason as string | undefined;
      if (!message) return failure();

      const toolCalls = message.tool_calls as Array<Record<string, unknown>> | undefined;
      if (finishReason === "tool_calls" || (toolCalls && toolCalls.length)) {
        if (!toolCalls?.length) return failure();
        const toolCall = toolCalls[0];
        const toolCallId = toolCall.id as string;
        const fn = toolCall.function as Record<string, unknown>;
        let args: { query?: string } = {};
        try {
          args = JSON.parse(fn.arguments as string) as { query?: string };
        } catch {
          /* tolerate malformed args — agent will retry on next loop */
        }
        const searchResult = args.query
          ? await searchTavily(args.query)
          : "Missing query argument.";
        messages.push({
          role: "assistant",
          content: null,
          tool_calls: toolCalls,
        });
        messages.push({
          role: "tool",
          tool_call_id: toolCallId,
          name: "search_web",
          content: searchResult,
        });
        continue;
      }

      const text = typeof message.content === "string" ? message.content : "";
      const parsed = tryParse(text);
      const clean = sanitize(parsed);
      return hasPerfumeData(clean) ? clean : failure();
    }
  } catch (err) {
    console.error("[fragrantica-agent] loop error:", err);
    return failure();
  }
  return failure();
}
