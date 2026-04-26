/**
 * Recommendation engine for La Niche.
 *
 * Two layers:
 *
 *  1. DETERMINISTIC SCORING  (`recommendBaladeRoute`) — pure function, runs
 *     client-side, no API call. Always works, even offline / without LLM key.
 *     Consumes EVERY per-user signal we have: profile (families, intensity,
 *     moments, occasions, budget), wishlist (liked + disliked × brand + family),
 *     past balade history (tested liked + disliked), wishlist saturation,
 *     price sweet spot, diversification.
 *
 *  2. LLM PROMPT  (`buildRecommendationPrompt`) — produces a single string
 *     ready to send to Claude / GPT / any chat-completion endpoint. The LLM
 *     enriches reasons with sensory storytelling and smell-invitations.
 *
 * Rule: deterministic result is authoritative. LLM output is enrichment. Never
 * trust the LLM to invent fragrance keys that don't exist in the stock.
 *
 * Each user gets a personalized ordering — the same stock reshuffles per user.
 */

import type { Fragrance } from "@/lib/data";
import type {
  Budget,
  IntensityPref,
  Moment,
  Occasion,
  OlfactiveProfile,
} from "@/lib/profile";
import { MOMENT_VULGAR, OCCASION_VULGAR } from "@/lib/profile";
import type { FinishedBalade, WishlistEntry } from "@/lib/store";
import type { ScentFamily } from "@/lib/fragrances";

/* -------------------------------------------------------------------------
 * Public types
 * --------------------------------------------------------------------- */

export type RecommendationReason = {
  kind:
    // Profile
    | "family_match"
    | "intensity_match"
    | "moment_match"
    | "occasion_match"
    | "in_budget"
    | "over_budget"
    | "price_sweet_spot"
    // Wishlist
    | "brand_liked"
    | "family_liked"
    | "family_saturation"
    | "brand_disliked"
    | "family_disliked"
    | "wishlist_liked_already"
    | "wishlist_disliked"
    | "shared_notes"
    | "disliked_notes"
    // History
    | "history_brand_liked"
    | "history_family_liked"
    | "history_tested"
    | "history_brand_disliked"
    | "history_family_disliked"
    // Misc
    | "diversification";
  /** Score contribution (positive or negative). */
  weight: number;
  /** Short user-facing French sentence. Tutoie, no jargon. */
  label: string;
};

export type Recommendation = {
  fragrance: Fragrance;
  score: number;
  /** 0..1 relative to the top-scored candidate (for UI %). */
  matchScore: number;
  reasons: RecommendationReason[];
  /** Filled by `mergeLlm` when the LLM has enriched the result; null otherwise. */
  llm: {
    reason: string;
    smellInvitation: string;
  } | null;
};

export type RecommendationInput = {
  shopFragrances: Fragrance[];
  profile: OlfactiveProfile | null;
  wishlist: WishlistEntry[];
  /** Finished balades from the user's store (for history-based signals). */
  history?: FinishedBalade[];
  /** Time budget in minutes — drives the count of recommended perfumes. */
  timeBudgetMin: number;
  /** Full catalog so we can cross-reference wishlist + history items that
   *  aren't in the current shop's stock (to extract brand/family signals). */
  allFragrances?: Fragrance[];
  /** Shop name (used in the LLM prompt, not in scoring). */
  shopName?: string;
  /** Stable per-user seed for jitter (prevents two users seeing identical
   *  orderings on ties). Pass the user id if available. */
  userSeed?: string;
};

/* -------------------------------------------------------------------------
 * Configuration
 * --------------------------------------------------------------------- */

const PER_PERFUME_MIN = 5; // ~5 minutes per sniff cycle
const MAX_PER_BRAND = 2; // diversification cap in the final route

const WEIGHTS = {
  // Profile
  family_match: 30,
  intensity_match: 20,
  moment_match_each: 8, // per overlapping moment, max 2 overlaps count
  occasion_match_each: 8, // per overlapping occasion, max 2 overlaps count
  in_budget: 15,
  in_budget_stretch: 5, // within 20% over the cap
  over_budget: -25,
  price_sweet_spot: 12,

  // Wishlist
  brand_liked: 15,
  family_liked: 10,
  family_saturation: 12, // additional when user has 3+ likes in this family
  brand_disliked: -25,
  family_disliked: -20,
  wishlist_liked_already: -30,
  wishlist_disliked: -100,
  shared_notes_each: 6, // per overlapping note with a liked fragrance, capped
  shared_notes_cap: 4, // max notes counted (avoid runaway when 10+ overlap)
  disliked_notes_each: -7, // per overlapping note with a disliked fragrance
  disliked_notes_cap: 3,

  // History
  history_brand_liked_each: 4, // per past like in same brand, capped at 3
  history_family_liked_each: 3, // per past like in same family, capped at 3
  history_tested: -18, // already tested recently — try new things
  history_brand_disliked: -18,
  history_family_disliked: -12,
} as const;

/* -------------------------------------------------------------------------
 * Heuristic tables — derive moments/occasions from family + intensity
 *
 * The CRM's shop_stock rows don't tag perfumes with moments/occasions, so we
 * infer from family and intensity metadata. Industry-standard mappings.
 * --------------------------------------------------------------------- */

const FAMILY_MOMENT_HINTS: Record<ScentFamily, Moment[]> = {
  Citrus: ["morning", "day"],
  Fresh: ["morning", "day"],
  Floral: ["day", "evening"],
  Woody: ["evening", "night"],
  Amber: ["evening", "night"],
  Smoky: ["night"],
  Spicy: ["evening", "night"],
  Fruity: ["day", "evening"],
};

const FAMILY_OCCASION_HINTS: Record<ScentFamily, Occasion[]> = {
  Citrus: ["work", "sport", "casual"],
  Fresh: ["work", "sport", "casual"],
  Floral: ["casual", "date"],
  Woody: ["work", "date", "going_out"],
  Amber: ["date", "going_out"],
  Smoky: ["going_out"],
  Spicy: ["date", "going_out"],
  Fruity: ["casual", "date"],
};

const INTENSITY_MOMENT_HINTS: Record<IntensityPref, Moment[]> = {
  subtle: ["morning", "day"],
  moderate: ["day", "evening"],
  projective: ["evening", "night"],
};

const INTENSITY_OCCASION_HINTS: Record<IntensityPref, Occasion[]> = {
  subtle: ["work", "casual"],
  moderate: ["casual", "date"],
  projective: ["date", "going_out"],
};

function deriveMoments(f: Fragrance): Moment[] {
  const set = new Set<Moment>();
  if (f.family && FAMILY_MOMENT_HINTS[f.family as ScentFamily]) {
    for (const m of FAMILY_MOMENT_HINTS[f.family as ScentFamily]) set.add(m);
  }
  if (f.intensity && INTENSITY_MOMENT_HINTS[f.intensity]) {
    for (const m of INTENSITY_MOMENT_HINTS[f.intensity]) set.add(m);
  }
  return [...set];
}

function deriveOccasions(f: Fragrance): Occasion[] {
  const set = new Set<Occasion>();
  if (f.family && FAMILY_OCCASION_HINTS[f.family as ScentFamily]) {
    for (const o of FAMILY_OCCASION_HINTS[f.family as ScentFamily]) set.add(o);
  }
  if (f.intensity && INTENSITY_OCCASION_HINTS[f.intensity]) {
    for (const o of INTENSITY_OCCASION_HINTS[f.intensity]) set.add(o);
  }
  return [...set];
}

/* -------------------------------------------------------------------------
 * Main entry point
 * --------------------------------------------------------------------- */

export function recommendBaladeRoute(
  input: RecommendationInput,
): Recommendation[] {
  const { shopFragrances, timeBudgetMin } = input;
  if (shopFragrances.length === 0) return [];

  const desiredCount = Math.max(
    1,
    Math.min(shopFragrances.length, Math.floor(timeBudgetMin / PER_PERFUME_MIN)),
  );

  const ctx = buildContext(input);

  // Score every candidate.
  const scored = shopFragrances.map((f) => scoreFragrance(f, ctx));

  // Sort by score desc, ties broken by deterministic user-seeded jitter
  // (already folded into the score in `scoreFragrance`).
  scored.sort((a, b) => b.score - a.score);

  // Diversify by brand: keep top picks but cap MAX_PER_BRAND per brand.
  const picked: Recommendation[] = [];
  const brandCount = new Map<string, number>();
  for (const r of scored) {
    if (picked.length >= desiredCount) break;
    const used = brandCount.get(r.fragrance.brand) ?? 0;
    if (used >= MAX_PER_BRAND) continue;
    picked.push(r);
    brandCount.set(r.fragrance.brand, used + 1);
  }

  // Backfill if brand cap prevented reaching the desired count.
  if (picked.length < desiredCount) {
    for (const r of scored) {
      if (picked.length >= desiredCount) break;
      if (picked.includes(r)) continue;
      picked.push(r);
    }
  }

  // Mark a diversification reason if the final route spans multiple brands.
  const brandsInPick = new Set(picked.map((r) => r.fragrance.brand));
  if (brandsInPick.size > 1) {
    for (const r of picked) {
      r.reasons.push({
        kind: "diversification",
        weight: 0,
        label: "Sélection diversifiée pour élargir ton palais",
      });
    }
  }

  // Compute match% (0..1) relative to the top score for UI display.
  const top = Math.max(picked[0]?.score ?? 1, 1);
  for (const r of picked) {
    r.matchScore = Math.max(0, Math.min(1, r.score / top));
  }

  return picked;
}

/* -------------------------------------------------------------------------
 * Context building — pre-compute sets/maps we'll consult per-candidate.
 * --------------------------------------------------------------------- */

type Context = {
  profile: OlfactiveProfile | null;
  likedBrands: Set<string>;
  dislikedBrands: Set<string>;
  likedFamilies: Set<string>;
  dislikedFamilies: Set<string>;
  /** family → number of liked items in that family (for saturation). */
  familyLikeCount: Map<string, number>;
  /** avg liked wishlist price, or null if no liked items with a price. */
  avgLikedPrice: number | null;
  wishlistedKeys: Set<string>;
  wishlistStatus: Map<string, "liked" | "disliked">;
  /** Lower-cased note names accumulated from liked / disliked fragrances —
   *  drives the "shared_notes" / "disliked_notes" reasons. */
  likedNotes: Set<string>;
  dislikedNotes: Set<string>;
  // History
  historyTestedKeys: Set<string>;
  historyLikedBrands: Map<string, number>; // brand → count
  historyLikedFamilies: Map<string, number>;
  historyDislikedBrands: Set<string>;
  historyDislikedFamilies: Set<string>;
  // Seed
  userSeed: string;
};

function buildContext(input: RecommendationInput): Context {
  const {
    profile,
    wishlist,
    allFragrances = [],
    history = [],
    userSeed = "anon",
  } = input;

  const lookup = new Map(allFragrances.map((f) => [f.key, f]));

  const wishlistStatus = new Map<string, "liked" | "disliked">();
  for (const w of wishlist) wishlistStatus.set(w.fragranceId, w.status);

  const likedBrands = new Set<string>();
  const dislikedBrands = new Set<string>();
  const likedFamilies = new Set<string>();
  const dislikedFamilies = new Set<string>();
  const familyLikeCount = new Map<string, number>();
  const likedPrices: number[] = [];
  const likedNotes = new Set<string>();
  const dislikedNotes = new Set<string>();

  for (const w of wishlist) {
    const f = lookup.get(w.fragranceId);
    if (!f) continue;
    const noteNames = (f.notes ?? []).map((n) => n.name.trim().toLowerCase());
    if (w.status === "liked") {
      likedBrands.add(f.brand);
      if (f.family) {
        likedFamilies.add(f.family);
        familyLikeCount.set(
          f.family,
          (familyLikeCount.get(f.family) ?? 0) + 1,
        );
      }
      if (f.bestPrice != null) likedPrices.push(f.bestPrice);
      for (const n of noteNames) if (n) likedNotes.add(n);
    } else {
      dislikedBrands.add(f.brand);
      if (f.family) dislikedFamilies.add(f.family);
      for (const n of noteNames) if (n) dislikedNotes.add(n);
    }
  }

  // History signals
  const historyTestedKeys = new Set<string>();
  const historyLikedBrands = new Map<string, number>();
  const historyLikedFamilies = new Map<string, number>();
  const historyDislikedBrands = new Set<string>();
  const historyDislikedFamilies = new Set<string>();

  for (const balade of history) {
    for (const tested of balade.tested) {
      historyTestedKeys.add(tested.fragranceId);
      const f = lookup.get(tested.fragranceId);
      if (!f) continue;
      if (tested.feedback === "liked") {
        historyLikedBrands.set(
          f.brand,
          (historyLikedBrands.get(f.brand) ?? 0) + 1,
        );
        if (f.family) {
          historyLikedFamilies.set(
            f.family,
            (historyLikedFamilies.get(f.family) ?? 0) + 1,
          );
        }
      } else if (tested.feedback === "disliked") {
        historyDislikedBrands.add(f.brand);
        if (f.family) historyDislikedFamilies.add(f.family);
      }
    }
  }

  const avgLikedPrice =
    likedPrices.length > 0
      ? likedPrices.reduce((a, b) => a + b, 0) / likedPrices.length
      : null;

  return {
    profile,
    likedBrands,
    dislikedBrands,
    likedFamilies,
    dislikedFamilies,
    familyLikeCount,
    avgLikedPrice,
    wishlistedKeys: new Set(wishlistStatus.keys()),
    wishlistStatus,
    likedNotes,
    dislikedNotes,
    historyTestedKeys,
    historyLikedBrands,
    historyLikedFamilies,
    historyDislikedBrands,
    historyDislikedFamilies,
    userSeed,
  };
}

/* -------------------------------------------------------------------------
 * Per-fragrance scoring
 * --------------------------------------------------------------------- */

function scoreFragrance(f: Fragrance, ctx: Context): Recommendation {
  const reasons: RecommendationReason[] = [];
  let score = 100;

  function add(
    kind: RecommendationReason["kind"],
    label: string,
    weight: number,
  ) {
    score += weight;
    reasons.push({ kind, weight, label });
  }

  /* ---- Profile-driven ---- */
  if (ctx.profile) {
    // Family
    if (
      f.family &&
      (ctx.profile.preferred_families as readonly string[]).includes(f.family)
    ) {
      add(
        "family_match",
        `Univers ${f.family.toLowerCase()} qui te touche`,
        WEIGHTS.family_match,
      );
    }

    // Intensity
    if (f.intensity && f.intensity === ctx.profile.intensity_preference) {
      add(
        "intensity_match",
        `Sillage ${f.intensity} comme tu aimes`,
        WEIGHTS.intensity_match,
      );
    }

    // Moments (derived from family + intensity)
    const fragMoments = deriveMoments(f);
    const momentsOverlap = fragMoments.filter((m) =>
      ctx.profile!.moments.includes(m),
    );
    const momentsCount = Math.min(2, momentsOverlap.length);
    if (momentsCount > 0) {
      const label = `Adapté à ${momentsOverlap
        .slice(0, 2)
        .map((m) => MOMENT_VULGAR[m].title.toLowerCase())
        .join(" & ")}`;
      add(
        "moment_match",
        label,
        momentsCount * WEIGHTS.moment_match_each,
      );
    }

    // Occasions (derived)
    const fragOccasions = deriveOccasions(f);
    const occasionsOverlap = fragOccasions.filter((o) =>
      ctx.profile!.occasions.includes(o),
    );
    const occCount = Math.min(2, occasionsOverlap.length);
    if (occCount > 0) {
      const label = `Bien pour ${occasionsOverlap
        .slice(0, 2)
        .map((o) => OCCASION_VULGAR[o].title.toLowerCase())
        .join(" & ")}`;
      add(
        "occasion_match",
        label,
        occCount * WEIGHTS.occasion_match_each,
      );
    }

    // Budget — gradient
    const cap = budgetCap(ctx.profile.budget);
    if (cap !== null && f.bestPrice !== null) {
      if (f.bestPrice <= cap) {
        add(
          "in_budget",
          `Dans ton budget (≤ ${cap} €)`,
          WEIGHTS.in_budget,
        );
      } else if (f.bestPrice <= cap * 1.2) {
        add(
          "in_budget",
          `Léger stretch sur ton budget`,
          WEIGHTS.in_budget_stretch,
        );
      } else if (f.bestPrice > cap * 1.5) {
        add(
          "over_budget",
          `Sensiblement au-dessus de ton budget`,
          WEIGHTS.over_budget,
        );
      }
    }
  }

  /* ---- Wishlist-driven ---- */
  if (ctx.likedBrands.has(f.brand)) {
    add(
      "brand_liked",
      `Tu aimes déjà cette maison (${f.brand})`,
      WEIGHTS.brand_liked,
    );
  }
  if (f.family && ctx.likedFamilies.has(f.family)) {
    add(
      "family_liked",
      "Famille présente dans tes coups de cœur",
      WEIGHTS.family_liked,
    );
    // Saturation bonus
    const count = ctx.familyLikeCount.get(f.family) ?? 0;
    if (count >= 3) {
      add(
        "family_saturation",
        `Tu raffoles de cette famille (${count} likes)`,
        WEIGHTS.family_saturation,
      );
    }
  }
  if (ctx.dislikedBrands.has(f.brand)) {
    add(
      "brand_disliked",
      `Tu as rejeté un parfum de cette maison`,
      WEIGHTS.brand_disliked,
    );
  }
  if (f.family && ctx.dislikedFamilies.has(f.family)) {
    add(
      "family_disliked",
      `Famille que tu as rejetée`,
      WEIGHTS.family_disliked,
    );
  }

  // Price sweet spot (vs average liked wishlist price)
  if (ctx.avgLikedPrice !== null && f.bestPrice != null) {
    const ratio = f.bestPrice / ctx.avgLikedPrice;
    if (ratio >= 0.7 && ratio <= 1.3) {
      add(
        "price_sweet_spot",
        `Prix dans ton sweet spot (~${Math.round(ctx.avgLikedPrice)}€)`,
        WEIGHTS.price_sweet_spot,
      );
    }
  }

  // Note overlap with liked / disliked wishlist items. The boutique stock
  // is enriched with a note pyramid at import time (see /api/boutique/stock),
  // so this is what makes the balade-guidée pull "from the notes of the
  // boutique perfumes" the user has signalled affinity for.
  const candidateNotes = (f.notes ?? []).map((n) =>
    n.name.trim().toLowerCase(),
  );
  if (candidateNotes.length > 0) {
    const sharedLiked = candidateNotes.filter((n) => ctx.likedNotes.has(n));
    if (sharedLiked.length > 0) {
      const counted = Math.min(WEIGHTS.shared_notes_cap, sharedLiked.length);
      const sample = sharedLiked.slice(0, 2).join(", ");
      add(
        "shared_notes",
        `Notes en commun avec tes coups de cœur (${sample})`,
        counted * WEIGHTS.shared_notes_each,
      );
    }
    const sharedDisliked = candidateNotes.filter((n) =>
      ctx.dislikedNotes.has(n),
    );
    if (sharedDisliked.length > 0) {
      const counted = Math.min(
        WEIGHTS.disliked_notes_cap,
        sharedDisliked.length,
      );
      add(
        "disliked_notes",
        `Note présente dans un parfum que tu as rejeté`,
        counted * WEIGHTS.disliked_notes_each,
      );
    }
  }

  // Already in wishlist
  if (ctx.wishlistedKeys.has(f.key)) {
    const status = ctx.wishlistStatus.get(f.key);
    if (status === "liked") {
      add(
        "wishlist_liked_already",
        `Déjà dans ta wishlist — tu le connais`,
        WEIGHTS.wishlist_liked_already,
      );
    } else if (status === "disliked") {
      add(
        "wishlist_disliked",
        `Tu as déjà dit non à ce parfum`,
        WEIGHTS.wishlist_disliked,
      );
    }
  }

  /* ---- History-driven ---- */
  if (ctx.historyTestedKeys.has(f.key)) {
    add(
      "history_tested",
      `Déjà testé en balade`,
      WEIGHTS.history_tested,
    );
  }
  const histLikedBrandCount = ctx.historyLikedBrands.get(f.brand) ?? 0;
  if (histLikedBrandCount > 0) {
    const bonus =
      Math.min(3, histLikedBrandCount) * WEIGHTS.history_brand_liked_each;
    add(
      "history_brand_liked",
      `Marque qui t'a plu en balade (×${histLikedBrandCount})`,
      bonus,
    );
  }
  if (f.family) {
    const histLikedFamilyCount = ctx.historyLikedFamilies.get(f.family) ?? 0;
    if (histLikedFamilyCount > 0) {
      const bonus =
        Math.min(3, histLikedFamilyCount) * WEIGHTS.history_family_liked_each;
      add(
        "history_family_liked",
        `Famille appréciée en balade (×${histLikedFamilyCount})`,
        bonus,
      );
    }
  }
  if (ctx.historyDislikedBrands.has(f.brand)) {
    add(
      "history_brand_disliked",
      `Marque rejetée en balade`,
      WEIGHTS.history_brand_disliked,
    );
  }
  if (f.family && ctx.historyDislikedFamilies.has(f.family)) {
    add(
      "history_family_disliked",
      `Famille rejetée en balade`,
      WEIGHTS.history_family_disliked,
    );
  }

  // Deterministic jitter per (user, fragrance) — stable across renders for the
  // same user but different between users, so ties don't create identical
  // orderings.
  score += pseudoRandom(`${ctx.userSeed}::${f.key}`) * 4;

  return {
    fragrance: f,
    score,
    matchScore: 0, // computed later
    reasons,
    llm: null,
  };
}

function budgetCap(budget: Budget): number | null {
  switch (budget) {
    case "u100":
      return 100;
    case "100_200":
      return 200;
    case "o200":
      // User is OK with high-end, so no cap — but we still reward "in budget"
      // at a high threshold so cheaper perfumes get the bonus and don't lose.
      return 500;
    case "any":
      return null; // skip budget scoring entirely
  }
}

function pseudoRandom(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/** Top N most-impactful (by |weight|) reasons for compact UI display. */
export function topReasons(
  rec: Recommendation,
  n = 2,
): RecommendationReason[] {
  return [...rec.reasons]
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, n);
}

/* -------------------------------------------------------------------------
 * LLM prompt builder
 *
 * Build server-side, send to your provider, parse with `parseLlmResponse`,
 * merge onto the deterministic results via `mergeLlm`.
 *
 * Target models: Claude Sonnet 4.6 or GPT-4. Temperature 0.3-0.5.
 * --------------------------------------------------------------------- */

export function buildRecommendationPrompt(
  input: RecommendationInput,
): string {
  const {
    shopFragrances,
    profile,
    wishlist,
    history = [],
    timeBudgetMin,
    allFragrances = [],
    shopName,
  } = input;

  const count = Math.max(
    1,
    Math.min(shopFragrances.length, Math.floor(timeBudgetMin / PER_PERFUME_MIN)),
  );

  const profileBlock = profile
    ? [
        `- Univers olfactifs préférés : ${profile.preferred_families.join(", ") || "non précisé"}`,
        `- Sillage souhaité : ${profile.intensity_preference}`,
        `- Moments de port : ${profile.moments.join(", ") || "non précisé"}`,
        `- Occasions : ${profile.occasions.join(", ") || "non précisé"}`,
        `- Budget par flacon : ${profile.budget}`,
      ].join("\n")
    : "Aucun profil renseigné — base-toi uniquement sur la wishlist, l'historique et la diversification.";

  const lookup = new Map(allFragrances.map((f) => [f.key, f]));

  const liked = wishlist
    .filter((w) => w.status === "liked")
    .map((w) => lookup.get(w.fragranceId))
    .filter((f): f is Fragrance => Boolean(f));
  const disliked = wishlist
    .filter((w) => w.status === "disliked")
    .map((w) => lookup.get(w.fragranceId))
    .filter((f): f is Fragrance => Boolean(f));

  const fmtFrag = (f: Fragrance) =>
    `- ${f.name} — ${f.brand}${f.family ? ` (${f.family})` : ""}${
      f.bestPrice != null ? ` · ${f.bestPrice}€` : ""
    }`;

  const likedBlock =
    liked.length > 0 ? liked.map(fmtFrag).join("\n") : "Aucun pour l'instant.";
  const dislikedBlock =
    disliked.length > 0
      ? disliked.map(fmtFrag).join("\n")
      : "Aucun pour l'instant.";

  // History block — aggregate tested items grouped by feedback
  const historyTests: {
    frag: Fragrance;
    feedback: "liked" | "disliked" | null;
  }[] = [];
  for (const balade of history) {
    for (const t of balade.tested) {
      const f = lookup.get(t.fragranceId);
      if (f) historyTests.push({ frag: f, feedback: t.feedback });
    }
  }
  const historyLiked = historyTests.filter((t) => t.feedback === "liked");
  const historyDisliked = historyTests.filter(
    (t) => t.feedback === "disliked",
  );
  const historyBlock =
    historyTests.length > 0
      ? [
          historyLiked.length > 0
            ? `Parfums TESTÉS et AIMÉS en balade :\n${historyLiked.map((t) => fmtFrag(t.frag)).join("\n")}`
            : "",
          historyDisliked.length > 0
            ? `Parfums TESTÉS et REJETÉS en balade :\n${historyDisliked.map((t) => fmtFrag(t.frag)).join("\n")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n")
      : "Aucune balade précédente.";

  const stockBlock = shopFragrances
    .map((f) => {
      const price = f.bestPrice != null ? `${f.bestPrice}€` : "prix n/c";
      const fam = f.family ? ` · ${f.family}` : "";
      const intensity = f.intensity ? ` · ${f.intensity}` : "";
      const notesByLayer = (layer: "top" | "heart" | "base") =>
        (f.notes ?? [])
          .filter((n) => n.layer === layer)
          .map((n) => n.name)
          .join(", ");
      const top = notesByLayer("top");
      const heart = notesByLayer("heart");
      const base = notesByLayer("base");
      const pyramid =
        top || heart || base
          ? `\n      tête: ${top || "—"}\n      cœur: ${heart || "—"}\n      fond: ${base || "—"}`
          : "";
      return `  - key="${f.key}" | ${f.name} — ${f.brand} (${price}${fam}${intensity})${pyramid}`;
    })
    .join("\n");

  return `Tu es le concierge olfactif de La Niche, application mobile dédiée aux parfums de niche.
Tu connais les familles olfactives, les ingrédients (iris pallida, vétiver d'Haïti, oud de Laos, géosmine, labdanum, cachemeran…), les nez européens du moment (Dominique Ropion, Mathilde Laurent, Bertrand Duchaufour, Daniela Andrier…), et tu articules une recommandation comme un sommelier le ferait pour un vin.

Règles de ton :
- Tu tutoies l'utilisateur.
- Tu évoques des matières ET des sensations concrètes, pas des étiquettes génériques.
- Tu restes factuel : si tu n'es pas sûr d'un détail sur un parfum, ne l'invente pas.
- Chaque recommandation doit être PERSONNALISÉE — un autre utilisateur avec d'autres goûts recevrait un autre parcours.

# PROFIL UTILISATEUR

${profileBlock}

## WISHLIST — parfums AIMÉS
${likedBlock}

## WISHLIST — parfums REJETÉS (signatures à éviter)
${dislikedBlock}

## HISTORIQUE DES BALADES
${historyBlock}

# STOCK DISPONIBLE — boutique « ${shopName ?? "non précisée"} »

${stockBlock}

# TÂCHE

L'utilisateur a ${timeBudgetMin} minutes pour cette balade en boutique, soit environ ${count} parfums à sentir.

Sélectionne EXACTEMENT ${count} parfums dans le stock ci-dessus en appliquant cette priorité :

1. PERTINENCE — croise toutes ces données :
   - Univers olfactifs préférés (poids fort)
   - Sillage souhaité (poids moyen)
   - Moments & occasions de port (poids moyen)
   - Marques/familles déjà aimées dans la wishlist (poids fort)
   - Marques/familles aimées en balade passée (poids moyen — signal validé IRL)
   - Budget utilisateur (respecté à ±30%, jamais au-delà)

2. ÉVICTION DURE — n'affiche JAMAIS :
   - Un parfum disliked
   - Un parfum déjà testé et disliked en balade
   - Un parfum de la MÊME MAISON qu'un parfum disliked
   - Un parfum dont la famille a été rejetée de façon répétée

3. DIVERSIFICATION — la balade doit former un arc :
   - Un CŒUR de cible (le plus sûr, en plein dans l'univers préféré)
   - Une EXPLORATION LATÉRALE (adjacent à ses goûts, pour élargir)
   - Un WILDCARD MAÎTRISÉ (contraste volontaire, mais jamais un disliked)
   Pas 3 parfums de la même marque ni 3 parfums de la même famille.

4. REDONDANCE — évite les parfums déjà liked (il les connaît) sauf si utile comme référence comparative.

Pour chaque parfum recommandé, écris :
- une RAISON (≤ 100 caractères) qui cite un ingrédient ou une sensation, et fait explicitement le lien avec UN signal du profil (ex: "L'iris pallida résonne avec ta préférence pour les bois poudrés et ton côté Atelier Materi")
- une INVITATION À SENTIR (≤ 80 caractères) : conseil pratique (poignet / mouillette / temps de pose / ordre dans le parcours)

# OUTPUT

Réponds UNIQUEMENT en JSON strict, aucun texte avant ou après, aucun code-fence. Schéma :

{
  "summary": "string ≤ 140 car — phrase résumant l'intention du parcours pour CE user",
  "recommendations": [
    {
      "fragrance_key": "string — key EXACT du stock (ne jamais inventer)",
      "rank": 1,
      "match_score": 0.95,
      "reason": "string ≤ 100 car",
      "smell_invitation": "string ≤ 80 car"
    }
  ]
}`;
}

/* -------------------------------------------------------------------------
 * LLM response parsing + merge
 * --------------------------------------------------------------------- */

export type LlmRecommendationResponse = {
  summary: string;
  recommendations: {
    fragrance_key: string;
    rank: number;
    match_score: number;
    reason: string;
    smell_invitation: string;
  }[];
};

export function parseLlmResponse(raw: string): LlmRecommendationResponse {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const parsed: unknown = JSON.parse(cleaned);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("recommendations" in parsed) ||
    !Array.isArray((parsed as LlmRecommendationResponse).recommendations)
  ) {
    throw new Error("LLM response missing `recommendations` array");
  }
  return parsed as LlmRecommendationResponse;
}

export function mergeLlm(
  base: Recommendation[],
  llm: LlmRecommendationResponse,
): Recommendation[] {
  const byKey = new Map(base.map((r) => [r.fragrance.key, r]));
  for (const item of llm.recommendations) {
    const target = byKey.get(item.fragrance_key);
    if (!target) continue; // never trust invented keys
    target.llm = {
      reason: item.reason,
      smellInvitation: item.smell_invitation,
    };
  }
  return [...base].sort((a, b) => {
    const ai = llm.recommendations.find(
      (r) => r.fragrance_key === a.fragrance.key,
    );
    const bi = llm.recommendations.find(
      (r) => r.fragrance_key === b.fragrance.key,
    );
    if (ai && bi) return ai.rank - bi.rank;
    if (ai) return -1;
    if (bi) return 1;
    return b.score - a.score;
  });
}
