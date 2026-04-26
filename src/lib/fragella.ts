/**
 * Fragella API client — primary fragrance lookup source.
 *
 * https://api.fragella.com/api/v1/* — authenticated via the `x-api-key`
 * header. Used by /api/agent (search + identify) BEFORE falling back to the
 * slow Tavily + Fragrantica scraping pipeline. When Fragella has the
 * perfume, the response is fast (one HTTP round trip, no LLM); when it
 * doesn't, the caller receives `null` and the UI can prompt the user to
 * ask the concierge.
 *
 * Server-side only — keeps `process.env.FRAGELLA_API_KEY` out of the bundle.
 */

const FRAGELLA_BASE_URL =
  process.env.FRAGELLA_BASE_URL ?? "https://api.fragella.com/api/v1";

/** Accord with its weight (0..100). Fragella sometimes ships accords as
 *  bare strings, sometimes as `{name, percent}` — the normaliser unifies
 *  both into this shape. */
export type FragellaAccord = {
  name: string;
  weight?: number;
};

/** A single olfactive note with its small icon URL (Fragella ships a
 *  thumbnail per note: sugar cube for "Sugar", vanilla flower for
 *  "Vanilla", etc.). UI consumers use it as inline thumbnail. */
export type FragellaNote = {
  name: string;
  imageUrl?: string;
};

/** Normalised perfume shape — what every consumer in the app expects.
 *  We keep field names tolerant since Fragella's actual schema isn't fully
 *  documented yet; the normaliser falls through several common keys. */
export type FragellaPerfume = {
  /** Stable identifier — Fragella's own when present, otherwise derived. */
  id: string;
  name: string;
  brand: string;
  /** Bottle photo — already a CDN URL, no scraping needed. */
  image_url: string | null;
  /** Marketing/editorial blurb if Fragella ships one. */
  description: string | null;
  /** Gender label (men / women / unisex). */
  gender: string | null;
  /** Olfactive family (single string). */
  family: string | null;
  notes: {
    top: FragellaNote[];
    middle: FragellaNote[];
    base: FragellaNote[];
  };
  accords: FragellaAccord[];
  /** Free-form longevity (e.g. "7h", "Long lasting"). */
  longevity: string | null;
  /** Free-form sillage (e.g. "Strong", "Moderate"). */
  sillage: string | null;
  /** Subset of "winter" / "spring" / "summer" / "autumn". */
  seasons: string[];
  /** Subset of "day" / "night". */
  day_time: string[];
  /** Average rating 0..5. */
  rating: number | null;
  reviews_count: number | null;
  /** Concentration / oil type ("Eau de Toilette", "Extrait de Parfum", …). */
  oil_type: string | null;
  /** Year of release. */
  year: string | null;
  /** Country of origin. */
  country: string | null;
  /** Popularity tier from Fragella ("Very high", "High", "Medium", "Low"). */
  popularity: string | null;
  /** Identification confidence ("high" / "medium" / "low"). */
  confidence: string | null;
  /** Top occasion (e.g. "night out", "professional"), used for "Best Moment". */
  best_occasion: string | null;
  /** Best-effort canonical URL (Fragella public page or Fragrantica). */
  source_url: string | null;
};

/** ─── Network helper ──────────────────────────────────────────────────── */

async function fragellaFetch(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response | null> {
  const apiKey = process.env.FRAGELLA_API_KEY;
  if (!apiKey) {
    console.warn("[fragella] FRAGELLA_API_KEY not set — skipping");
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    init?.timeoutMs ?? 5000,
  );

  try {
    const res = await fetch(`${FRAGELLA_BASE_URL}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        "x-api-key": apiKey,
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
    return res;
  } catch (e) {
    console.warn("[fragella] fetch failed:", e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** ─── Normalisation helpers ───────────────────────────────────────────── */

function toStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

/** Coerce a value into a string[] — tolerates arrays of strings or arrays
 *  of objects shaped like `{name: string}` (common for accords/notes APIs). */
function toArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (typeof x === "string") return x.trim();
      if (x && typeof x === "object") {
        const o = x as Record<string, unknown>;
        const candidate =
          (typeof o.name === "string" && o.name) ||
          (typeof o.label === "string" && o.label) ||
          (typeof o.note === "string" && o.note) ||
          (typeof o.accord === "string" && o.accord);
        return typeof candidate === "string" ? candidate.trim() : "";
      }
      return "";
    })
    .filter((s): s is string => s.length > 0);
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    if (isFinite(n)) return n;
  }
  return null;
}

/** Normalise accords — accepts strings, `{name, percent}`, `{name, weight}`,
 *  `{accord, score}`, etc. */
function toAccords(v: unknown): FragellaAccord[] {
  if (!Array.isArray(v)) return [];
  const out: FragellaAccord[] = [];
  for (const item of v) {
    if (typeof item === "string") {
      const t = item.trim();
      if (t) out.push({ name: t });
      continue;
    }
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const name =
        toStr(o.name) ?? toStr(o.label) ?? toStr(o.accord) ?? toStr(o.title);
      if (!name) continue;
      const weight =
        toNum(o.weight) ??
        toNum(o.percent) ??
        toNum(o.score) ??
        toNum(o.percentage);
      out.push(weight !== null ? { name, weight } : { name });
    }
  }
  return out;
}

/** Sub-set of `["winter","spring","summer","autumn"]` parsed from whatever
 *  shape Fragella ships. Tolerates booleans (`{winter: true, …}`),
 *  string arrays, or comma-separated strings. */
function toSeasons(raw: unknown): string[] {
  const allowed = new Set(["winter", "spring", "summer", "autumn"]);
  const out: string[] = [];
  if (Array.isArray(raw)) {
    for (const v of raw) {
      const s = typeof v === "string" ? v.trim().toLowerCase() : "";
      if (allowed.has(s)) out.push(s);
    }
  } else if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    for (const k of allowed) if (o[k]) out.push(k);
  } else if (typeof raw === "string") {
    for (const part of raw.split(/[,;]/)) {
      const s = part.trim().toLowerCase();
      if (allowed.has(s)) out.push(s);
    }
  }
  return [...new Set(out)];
}

/** Notes are shipped as `[{name, imageUrl}, …]` per layer. We preserve the
 *  imageUrl so the modal can render Fragella's note thumbnails inline. */
function toNotes(v: unknown): FragellaNote[] {
  if (!Array.isArray(v)) return [];
  const out: FragellaNote[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    if (typeof item === "string") {
      const t = item.trim();
      if (!t) continue;
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ name: t });
      continue;
    }
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const name =
        toStr(o.name) ?? toStr(o.label) ?? toStr(o.note) ?? toStr(o.title);
      if (!name) continue;
      const k = name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const imageUrl = toStr(o.imageUrl) ?? toStr(o.image_url) ?? toStr(o.image);
      out.push(imageUrl ? { name, imageUrl } : { name });
    }
  }
  return out;
}

function toDayTime(raw: unknown): string[] {
  const allowed = new Set(["day", "night"]);
  const out: string[] = [];
  if (Array.isArray(raw)) {
    for (const v of raw) {
      const s = typeof v === "string" ? v.trim().toLowerCase() : "";
      if (allowed.has(s)) out.push(s);
    }
  } else if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    for (const k of allowed) if (o[k]) out.push(k);
  } else if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (s === "both" || s === "any") return ["day", "night"];
    for (const part of s.split(/[,;]/)) {
      const v = part.trim();
      if (allowed.has(v)) out.push(v);
    }
  }
  return [...new Set(out)];
}

/** Fragella ranks accords with vague labels — convert to a 0..100 weight
 *  so the UI can render bar widths consistently. */
const ACCORD_LABEL_TO_WEIGHT: Record<string, number> = {
  dominant: 100,
  prominent: 78,
  moderate: 55,
  subtle: 35,
  mild: 25,
  trace: 15,
};

function normalizeOne(raw: unknown): FragellaPerfume | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  // Fragella's actual schema uses PascalCase keys with spaces. Snake/camel
  // fallbacks kept for safety in case the API ships an alt shape.
  const name = toStr(r.Name) ?? toStr(r.name) ?? toStr(r.fragrance);
  const brand = toStr(r.Brand) ?? toStr(r.brand) ?? toStr(r.house);
  if (!name || !brand) return null;

  // Notes: { Top: [{name, imageUrl}, …], Middle: …, Base: … }. We keep the
  // imageUrl per note so the card can render the small Fragella icons.
  const notesRaw = r.Notes ?? r.notes;
  let top: FragellaNote[] = [];
  let middle: FragellaNote[] = [];
  let base: FragellaNote[] = [];
  if (notesRaw && typeof notesRaw === "object" && !Array.isArray(notesRaw)) {
    const n = notesRaw as Record<string, unknown>;
    top = toNotes(n.Top ?? n.top);
    middle = toNotes(n.Middle ?? n.middle ?? n.heart);
    base = toNotes(n.Base ?? n.base);
  } else if (Array.isArray(notesRaw)) {
    middle = toNotes(notesRaw);
  }

  // Image — primary "Image URL", fall back to first "Image Fallbacks" entry.
  let image_url =
    toStr(r["Image URL"]) ??
    toStr(r.image_url) ??
    toStr(r.imageUrl) ??
    toStr(r.image) ??
    null;
  if (!image_url) {
    const fb = r["Image Fallbacks"] ?? r.image_fallbacks;
    if (Array.isArray(fb)) {
      for (const v of fb) {
        if (typeof v === "string" && v.trim()) {
          image_url = v.trim();
          break;
        }
      }
    }
  }

  // Accords: fuse `Main Accords` (string[]) with `Main Accords Percentage`
  // (record of label strings) so each accord carries a numeric weight.
  const mainAccords = r["Main Accords"] ?? r.accords;
  const percentMap = (r["Main Accords Percentage"] ?? {}) as Record<string, unknown>;
  let accords: FragellaAccord[] = [];
  if (Array.isArray(mainAccords)) {
    for (const a of mainAccords) {
      const acc =
        typeof a === "string"
          ? a.trim()
          : a && typeof a === "object"
            ? toStr((a as Record<string, unknown>).name)
            : null;
      if (!acc) continue;
      const labelOrNum = percentMap[acc];
      let weight: number | undefined;
      if (typeof labelOrNum === "string") {
        weight = ACCORD_LABEL_TO_WEIGHT[labelOrNum.toLowerCase().trim()];
      } else if (typeof labelOrNum === "number" && isFinite(labelOrNum)) {
        weight = Math.max(0, Math.min(100, labelOrNum));
      }
      accords.push(weight !== undefined ? { name: acc, weight } : { name: acc });
    }
  } else {
    // Fallback for the {name, percent} array shape supported earlier.
    accords = toAccords(r.accords);
  }

  // Family: no dedicated field on Fragella — the dominant accord is the
  // closest equivalent and reads naturally in the UI ("Vanilla", "Woody"…).
  const dominantAccord =
    accords.find((a) => (a.weight ?? 0) >= 90)?.name ??
    accords[0]?.name ??
    null;
  const family =
    toStr(r.family) ?? toStr(r.olfactive_family) ?? dominantAccord;

  // Seasons: pick the entries from `Season Ranking` with score >= 1. Map
  // Fragella's "fall" to the canonical "autumn" used in PerfumeCardData.
  const seasons: string[] = [];
  const seasonRanking = r["Season Ranking"] ?? r.seasons;
  if (Array.isArray(seasonRanking)) {
    for (const s of seasonRanking) {
      if (!s || typeof s !== "object") continue;
      const o = s as Record<string, unknown>;
      const sname = typeof o.name === "string" ? o.name.toLowerCase() : "";
      const score = typeof o.score === "number" ? o.score : 0;
      if (score < 1) continue;
      const mapped = sname === "fall" ? "autumn" : sname;
      if (["winter", "spring", "summer", "autumn"].includes(mapped) && !seasons.includes(mapped)) {
        seasons.push(mapped);
      }
    }
  } else {
    seasons.push(...toSeasons(seasonRanking));
  }

  // Day/Night — Fragella has no direct field, derive from occasions:
  //   "night out" / "evening" → night
  //   "professional" / "casual" / "daily" / "office" → day
  const day_time: string[] = [];
  const occasionRanking = r["Occasion Ranking"] ?? r.occasions;
  if (Array.isArray(occasionRanking)) {
    for (const o of occasionRanking) {
      if (!o || typeof o !== "object") continue;
      const obj = o as Record<string, unknown>;
      const oname = typeof obj.name === "string" ? obj.name.toLowerCase() : "";
      const score = typeof obj.score === "number" ? obj.score : 0;
      if (score < 1) continue;
      if (
        (oname.includes("night") || oname.includes("evening")) &&
        !day_time.includes("night")
      ) {
        day_time.push("night");
      }
      if (
        (oname === "professional" ||
          oname === "casual" ||
          oname === "daily" ||
          oname === "office" ||
          oname === "work") &&
        !day_time.includes("day")
      ) {
        day_time.push("day");
      }
    }
  }

  // Description: Fragella doesn't ship one, so we synthesise a short editorial
  // tagline from the metadata when available. Reads naturally on the card.
  const oilType = toStr(r.OilType) ?? toStr(r.oilType);
  const year = toStr(r.Year) ?? toStr(r.year);
  const country = toStr(r.Country) ?? toStr(r.country);
  const taglineParts = [oilType, year, country].filter(Boolean);
  const description =
    toStr(r.description) ??
    toStr(r.summary) ??
    (taglineParts.length ? taglineParts.join(" · ") : null);

  const id =
    toStr(r.id) ??
    toStr(r.slug) ??
    `${brand}-${name}`.toLowerCase().replace(/\s+/g, "-");

  const ratingNum = toNum(r.rating) ?? toNum(r.Rating) ?? toNum(r.score);
  const reviewsRaw = toNum(r.reviews_count) ?? toNum(r.reviews);

  // Top occasion = highest-scoring entry from Occasion Ranking (used to
  // derive a "Best Moment" insight on the card).
  let bestOccasion: string | null = null;
  if (Array.isArray(occasionRanking)) {
    let bestScore = 0;
    for (const o of occasionRanking) {
      if (!o || typeof o !== "object") continue;
      const obj = o as Record<string, unknown>;
      const oname = typeof obj.name === "string" ? obj.name : "";
      const score = typeof obj.score === "number" ? obj.score : 0;
      if (score > bestScore && oname) {
        bestScore = score;
        bestOccasion = oname;
      }
    }
  }

  return {
    id,
    name,
    brand,
    image_url,
    description,
    gender: toStr(r.Gender) ?? toStr(r.gender) ?? toStr(r.sex) ?? null,
    family,
    notes: { top, middle, base },
    accords,
    longevity: toStr(r.Longevity) ?? toStr(r.longevity) ?? null,
    sillage: toStr(r.Sillage) ?? toStr(r.sillage) ?? null,
    seasons,
    day_time,
    rating: ratingNum,
    reviews_count: reviewsRaw !== null ? Math.round(reviewsRaw) : null,
    oil_type: oilType,
    year,
    country,
    popularity: toStr(r.Popularity) ?? toStr(r.popularity) ?? null,
    confidence: toStr(r.Confidence) ?? toStr(r.confidence) ?? null,
    best_occasion: bestOccasion,
    source_url:
      toStr(r["Purchase URL"]) ??
      toStr(r.source_url) ??
      toStr(r.url) ??
      null,
  };
}

/** Pull the array of perfumes from whichever field Fragella ships them in.
 *  Tolerates `{ data: [] }`, `{ results: [] }`, `{ fragrances: [] }`, or a
 *  bare array. */
function extractList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  for (const key of ["data", "results", "fragrances", "items"]) {
    const v = o[key];
    if (Array.isArray(v)) return v;
  }
  return [];
}

/** ─── Public API ──────────────────────────────────────────────────────── */

/**
 * Multi-candidate search — used by the autocomplete + search page.
 *
 * Return values are MEANINGFUL:
 *   - `FragellaPerfume[]` (length > 0) : matches found
 *   - `[]` (empty array)               : Fragella reached, NO match (404, or
 *                                        empty response). Caller should show
 *                                        the concierge CTA.
 *   - `null`                           : Fragella unreachable / unconfigured
 *                                        / quota'd / 5xx. Caller should fall
 *                                        back to the Tavily pipeline so the
 *                                        user still gets results.
 */
export async function searchFragella(
  query: string,
  limit = 5,
): Promise<FragellaPerfume[] | null> {
  const q = query.trim();
  if (!q) return [];

  const path = `/fragrances?search=${encodeURIComponent(q)}&limit=${limit}`;
  const res = await fragellaFetch(path);
  if (!res) return null; // network / no API key

  if (res.status === 404) return []; // reached, no match for this query
  if (res.status === 429) {
    console.warn("[fragella] 429 — quota exhausted, falling back");
    return null;
  }
  if (res.status === 401 || res.status === 403) {
    console.warn(`[fragella] ${res.status} — auth issue, falling back`);
    return null;
  }
  if (!res.ok) {
    console.warn(`[fragella] search ${res.status} — falling back`);
    return null;
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return null; // garbage response → treat as outage
  }

  const list = extractList(data);
  const normalised = list
    .map(normalizeOne)
    .filter((p): p is FragellaPerfume => p !== null)
    .slice(0, limit);

  // Reached + parseable response, even if empty → return [] so the caller
  // distinguishes "no match" from "API down".
  return normalised;
}

/** Single-perfume lookup by brand + name — used by /scan after the vision
 *  step has identified a candidate. Just a search restricted to limit=1. */
export async function getFragellaPerfume(
  brand: string,
  name: string,
): Promise<FragellaPerfume | null> {
  const matches = await searchFragella(`${brand} ${name}`, 1);
  return matches?.[0] ?? null;
}

/**
 * "Similar to" lookup — useful for the recommendation flow when the user
 * has wishlisted some perfumes and we want quick same-vibe alternatives
 * without spinning up the heavy Tavily/Curator pipeline.
 *
 * GET /fragrances/similar?name=<name>&limit=<n>
 */
export async function getSimilarFragella(
  name: string,
  limit = 5,
): Promise<FragellaPerfume[] | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const path = `/fragrances/similar?name=${encodeURIComponent(trimmed)}&limit=${limit}`;
  const res = await fragellaFetch(path);
  if (!res || !res.ok) return null;
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return null;
  }
  const list = extractList(data)
    .map(normalizeOne)
    .filter((p): p is FragellaPerfume => p !== null);
  return list.length > 0 ? list.slice(0, limit) : null;
}

/**
 * Profile-driven match — finds perfumes from the user's olfactive
 * preferences expressed as accords (with weights) and notes per layer.
 *
 * GET /fragrances/match?accords=floral:100,fruity:90&top=Pear,Bergamot
 *     &middle=Freesia&base=Iso%20E%20Super&limit=3
 *
 * `accords` is a record of `{ accordName: weight 0..100 }`.
 */
export async function matchFragella(input: {
  accords?: Record<string, number>;
  top?: string[];
  middle?: string[];
  base?: string[];
  limit?: number;
}): Promise<FragellaPerfume[] | null> {
  const params: string[] = [];
  if (input.accords) {
    const accordsStr = Object.entries(input.accords)
      .map(([k, w]) => `${k}:${Math.round(w)}`)
      .join(",");
    if (accordsStr) params.push(`accords=${encodeURIComponent(accordsStr)}`);
  }
  if (input.top?.length)
    params.push(`top=${encodeURIComponent(input.top.join(","))}`);
  if (input.middle?.length)
    params.push(`middle=${encodeURIComponent(input.middle.join(","))}`);
  if (input.base?.length)
    params.push(`base=${encodeURIComponent(input.base.join(","))}`);
  params.push(`limit=${input.limit ?? 5}`);

  const res = await fragellaFetch(`/fragrances/match?${params.join("&")}`);
  if (!res || !res.ok) return null;
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return null;
  }
  const list = extractList(data)
    .map(normalizeOne)
    .filter((p): p is FragellaPerfume => p !== null);
  return list.length > 0 ? list : null;
}
