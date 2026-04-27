"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { BodyZone, Fragrance } from "@/lib/fragrances";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export type WishlistStatus = "liked" | "disliked";
export type WishlistOrigin = "search" | "scan" | "balade" | "manual";

/** User-assigned bucket inside the wishlist. `null` = uncategorised. */
export type WishlistCategory =
  | "to_smell"
  | "to_buy"
  | "favorite"
  | "already_tested"
  | "seen_in_shop";

export const WISHLIST_CATEGORY_LABELS: Record<WishlistCategory, string> = {
  to_smell: "À sentir",
  to_buy: "À acheter",
  favorite: "Favori",
  already_tested: "Déjà testé",
  seen_in_shop: "Vu en boutique",
};

export const WISHLIST_CATEGORY_ORDER: WishlistCategory[] = [
  "favorite",
  "to_smell",
  "to_buy",
  "already_tested",
  "seen_in_shop",
];

export type WishlistEntry = {
  fragranceId: string;
  status: WishlistStatus;
  addedAt: number;
  origin: WishlistOrigin;
  /** Optional user-assigned classification. Lets the wishlist be sorted into
   *  collections (à sentir, à acheter…). `undefined` = uncategorised. */
  category?: WishlistCategory;
  /** Snapshot of fragrance data captured at wishlist time — lets the wishlist
   *  page render even when the Supabase catalog hasn't loaded yet. */
  fragranceMeta?: { name: string; brand: string; imageUrl?: string | null };
};

export type BaladeMode = "free" | "guided";

export type BodyPlacement = {
  /** Anatomical region used for labeling, recommendation, and summary stats.
   *  Derived from `position` (closest predefined region) when the user places
   *  by clicking an arbitrary point on the 3D body. */
  zone: BodyZone;
  fragranceId: string;
  /** Exact world-space point on the body where the perfume was placed. When
   *  absent, the marker falls back to the predefined anchor for `zone`. */
  position?: [number, number, number];
  /** Snapshot of the fragrance metadata captured AT placement time. Used for
   *  display when the fragrance isn't in the local catalog (e.g. picked from
   *  the agent's Fragrantica search → not in `shop_stock`). */
  fragranceMeta?: {
    name: string;
    brand: string;
    imageUrl?: string | null;
    notesBrief?: string;
    sourceUrl?: string;
  };
};

export type TestedFragrance = {
  fragranceId: string;
  feedback: WishlistStatus | null;
};

export type ActiveBalade = {
  id: string;
  mode: BaladeMode;
  shopId: string | null;
  startedAt: number;
  /** Generated guided route: ordered fragrance IDs */
  route: string[];
  /** Index of currently testing perfume in `route` (guided only) */
  routeIndex: number;
  /** Time budget in minutes (guided only) */
  timeBudget: number | null;
  /** Perfumes the user has placed on the body (free + guided) */
  placements: BodyPlacement[];
  /** Perfumes the user has tested + their feedback (during balade) */
  tested: TestedFragrance[];
};

export type FinishedBalade = ActiveBalade & { finishedAt: number };

/* -------------------------------------------------------------------------
 * Subscription + usage metering.
 *
 * Each recommendation session costs ~3 ¢ (tokens + Tavily), each guided
 * balade route ~1 ¢. We gate usage on the client for MVP — when real Stripe
 * lands, mirror the same state on the server and keep this as a local cache.
 * ----------------------------------------------------------------------- */

export type SubscriptionTier = "free" | "curieux" | "initie" | "mecene";

export type BillingCycle = "monthly" | "annual";

export type UsageState = {
  /** Sessions consumed in the current billing window. */
  recommendations: number;
  guidedBalades: number;
  /** Unix ms — when the 30-day window rolls over and counters reset. */
  resetAt: number;
};

export type TierLimits = {
  recommendations: number;
  guidedBalades: number;
};

export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  // Infinity encodes "unlimited" — checked as `count < limit` so it never trips.
  // Free = portail d'évaluation strict : 2 recos pour goûter, 0 balade
  // guidée, scan/recherche très limités. L'utilisateur doit upgrader pour
  // tout usage récurrent — chaque appel coûte des tokens IA.
  free: { recommendations: 2, guidedBalades: 0 },
  curieux: { recommendations: 25, guidedBalades: 10 },
  initie: { recommendations: 60, guidedBalades: 25 },
  // Mécène = fair-use illimité ; le cap 200/50 sert de garde-fou anti-abus
  // côté serveur.
  mecene: { recommendations: 200, guidedBalades: 50 },
};

export const TIER_PRICE_EUR: Record<SubscriptionTier, number> = {
  free: 0,
  curieux: 4.99,
  initie: 12.99,
  mecene: 24.99,
};

/** Annual price (full year, ~2 months free vs monthly billing). */
export const TIER_PRICE_EUR_ANNUAL: Record<SubscriptionTier, number> = {
  free: 0,
  curieux: 49.9,
  initie: 129,
  mecene: 249,
};

export const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: "Découverte",
  curieux: "Curieux",
  initie: "Initié",
  mecene: "Mécène",
};

/** Whether the tier participates in the monthly contest ("concours du mois"). */
export const TIER_HAS_CONTEST: Record<SubscriptionTier, boolean> = {
  free: false,
  curieux: false,
  initie: true,
  mecene: true,
};

/** Migration of legacy tier names persisted in localStorage from MVP-v1. */
function migrateTier(raw: unknown): SubscriptionTier {
  if (raw === "basic") return "curieux";
  if (raw === "premium") return "initie";
  if (raw === "free" || raw === "curieux" || raw === "initie" || raw === "mecene") {
    return raw;
  }
  return "free";
}

type StoreState = {
  wishlist: WishlistEntry[];
  activeBalade: ActiveBalade | null;
  history: FinishedBalade[];
  subscription: SubscriptionTier;
  /** "monthly" or "annual" — drives the price label and (later) the Stripe /
   *  PayPal recurrence interval. Free users default to "monthly" cosmetically. */
  billingCycle: BillingCycle;
  /** Unix ms of the most recent subscription upgrade — shown as "Membre
   *  depuis" on the profile. `null` for free users. */
  subscribedAt: number | null;
  usage: UsageState;
};

type StoreActions = {
  // Wishlist
  addToWishlist: (
    fragranceId: string,
    status: WishlistStatus,
    origin: WishlistOrigin,
    fragranceMeta?: { name: string; brand: string; imageUrl?: string | null },
  ) => void;
  removeFromWishlist: (fragranceId: string) => void;
  isWishlisted: (fragranceId: string) => WishlistStatus | null;
  /** Set or clear the user-assigned category on a wishlist entry. */
  setWishlistCategory: (
    fragranceId: string,
    category: WishlistCategory | null,
  ) => void;

  // Balade lifecycle
  startBalade: (input: {
    mode: BaladeMode;
    shopId?: string | null;
    route?: string[];
    timeBudget?: number | null;
  }) => void;
  endBalade: () => void;
  cancelBalade: () => void;

  // Balade interactions
  /** Replace any existing placement at this zone with the new fragrance. */
  placeOnBody: (
    zone: BodyZone,
    fragranceId: string,
    position?: [number, number, number],
    fragranceMeta?: BodyPlacement["fragranceMeta"],
  ) => void;
  /** Add a fragrance on top of existing placements at the same zone (layering). */
  layerOnBody: (
    zone: BodyZone,
    fragranceId: string,
    position?: [number, number, number],
    fragranceMeta?: BodyPlacement["fragranceMeta"],
  ) => void;
  /** Move the FIRST placement of `fragranceId` to a new zone. */
  movePlacement: (
    fragranceId: string,
    newZone: BodyZone,
    position?: [number, number, number],
  ) => void;
  /** Remove ALL placements of `fragranceId` (useful when a fragrance is
   *  cleared). When you want per-tuple removal, use `removePlacementAt`. */
  removePlacement: (fragranceId: string) => void;
  /** Remove a single placement matching exactly (zone, fragranceId). */
  removePlacementAt: (zone: BodyZone, fragranceId: string) => void;

  recordTest: (fragranceId: string, feedback: WishlistStatus | null) => void;
  advanceRoute: () => void;

  // Subscription / usage metering
  canUseRecommendation: () => boolean;
  consumeRecommendation: () => void;
  canUseGuidedBalade: () => boolean;
  consumeGuidedBalade: () => void;
  /** Fake "subscribe" — flips the local tier. Real PayPal plugs in later.
   *  Cycle defaults to "monthly" if omitted. */
  setSubscription: (tier: SubscriptionTier, cycle?: BillingCycle) => void;
  /** Remaining count for the current tier; Infinity if unlimited. */
  remaining: (kind: "recommendations" | "guidedBalades") => number;
  /** Pulls /api/usage and reconciles tier + counters with the server.
   *  No-op for anonymous users (no Bearer token). Call after any metered
   *  agent call so the displayed remaining quota matches reality. */
  refreshUsage: () => Promise<void>;
};

type StoreContextValue = StoreState & StoreActions;

const StoreContext = createContext<StoreContextValue | null>(null);

/**
 * Per-user storage keys. Previously the store used a single global
 * `la-niche.store.v1` key, which caused user A's wishlist / balade history
 * to leak into user B's fresh account after signout → signup on the same
 * device. We now namespace by auth user id. Anonymous browsing gets its
 * own `anon` slot so logging in doesn't silently destroy that session.
 */
const STORAGE_PREFIX = "la-niche.store.v2";
const LEGACY_STORAGE_KEY = "la-niche.store.v1";

function storageKeyFor(userId: string | null): string {
  return userId ? `${STORAGE_PREFIX}.${userId}` : `${STORAGE_PREFIX}.anon`;
}

function readStorage(userId: string | null): StoreState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKeyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoreState>;
    // Forward-migrate: blobs from before subscription landed don't have
    // these fields. Backfill with safe defaults.
    return {
      wishlist: parsed.wishlist ?? [],
      activeBalade: parsed.activeBalade ?? null,
      history: parsed.history ?? [],
      subscription: migrateTier(parsed.subscription),
      billingCycle:
        parsed.billingCycle === "annual" ? "annual" : "monthly",
      subscribedAt: parsed.subscribedAt ?? null,
      usage: rolloverUsage(parsed.usage ?? freshUsage()),
    };
  } catch {
    return null;
  }
}

function writeStorage(userId: string | null, state: StoreState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKeyFor(userId), JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function freshUsage(): UsageState {
  return {
    recommendations: 0,
    guidedBalades: 0,
    resetAt: Date.now() + MONTH_MS,
  };
}

/** Rolls the 30-day window forward if expired. Pure — returns a new state. */
function rolloverUsage(usage: UsageState): UsageState {
  if (Date.now() > usage.resetAt) return freshUsage();
  return usage;
}

const initialState: StoreState = {
  wishlist: [],
  activeBalade: null,
  history: [],
  subscription: "free",
  billingCycle: "monthly",
  subscribedAt: null,
  usage: freshUsage(),
};

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  const [state, setState] = useState<StoreState>(initialState);
  // Tracks which userId the current `state` was hydrated from, so the
  // persist effect never writes user A's state into user B's storage slot
  // during the transitional render between auth change and re-hydrate.
  const hydratedForRef = useRef<string | null | undefined>(undefined);

  // Re-hydrate whenever the signed-in user changes (sign in, sign out,
  // account switch). Resets to `initialState` when the new user has no
  // stored data yet — that's the "fresh account = empty data" behaviour.
  useEffect(() => {
    if (authLoading) return;

    // One-time cleanup: remove the legacy global key so its data (which
    // can no longer be attributed to any specific user) doesn't linger.
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }

    const fromStorage = readStorage(userId);
    setState((prev) => {
      const base = fromStorage ?? initialState;
      // Preserve items added before auth resolved (race: user acted while
      // getSession() was still in-flight — those items were never persisted).
      if (hydratedForRef.current === undefined && prev.wishlist.length > 0) {
        const storedIds = new Set(base.wishlist.map((w) => w.fragranceId));
        const pending = prev.wishlist.filter((w) => !storedIds.has(w.fragranceId));
        if (pending.length > 0) {
          return { ...base, wishlist: [...pending, ...base.wishlist] };
        }
      }
      return base;
    });
    hydratedForRef.current = userId;
  }, [userId, authLoading]);

  // Persist on every state change — but only after we've hydrated for
  // this specific userId, to avoid writing stale state to the wrong slot.
  useEffect(() => {
    if (authLoading) return;
    if (hydratedForRef.current !== userId) return;
    writeStorage(userId, state);
  }, [state, userId, authLoading]);

  const addToWishlist = useCallback<StoreActions["addToWishlist"]>(
    (fragranceId, status, origin, fragranceMeta) => {
      setState((s) => {
        const existing = s.wishlist.find((w) => w.fragranceId === fragranceId);
        if (existing) {
          return {
            ...s,
            wishlist: s.wishlist.map((w) =>
              w.fragranceId === fragranceId
                ? { ...w, status, addedAt: Date.now(), origin, ...(fragranceMeta ? { fragranceMeta } : {}) }
                : w,
            ),
          };
        }
        return {
          ...s,
          wishlist: [
            { fragranceId, status, addedAt: Date.now(), origin, fragranceMeta },
            ...s.wishlist,
          ],
        };
      });
    },
    [],
  );

  const removeFromWishlist = useCallback<StoreActions["removeFromWishlist"]>(
    (fragranceId) => {
      setState((s) => ({
        ...s,
        wishlist: s.wishlist.filter((w) => w.fragranceId !== fragranceId),
      }));
    },
    [],
  );

  const isWishlisted = useCallback<StoreActions["isWishlisted"]>(
    (fragranceId) =>
      state.wishlist.find((w) => w.fragranceId === fragranceId)?.status ?? null,
    [state.wishlist],
  );

  const setWishlistCategory = useCallback<
    StoreActions["setWishlistCategory"]
  >((fragranceId, category) => {
    setState((s) => ({
      ...s,
      wishlist: s.wishlist.map((w) =>
        w.fragranceId === fragranceId
          ? { ...w, category: category ?? undefined }
          : w,
      ),
    }));
  }, []);

  const startBalade = useCallback<StoreActions["startBalade"]>((input) => {
    setState((s) => ({
      ...s,
      activeBalade: {
        id: `b_${Date.now()}`,
        mode: input.mode,
        shopId: input.shopId ?? null,
        startedAt: Date.now(),
        route: input.route ?? [],
        routeIndex: 0,
        timeBudget: input.timeBudget ?? null,
        placements: [],
        tested: [],
      },
    }));
  }, []);

  const endBalade = useCallback<StoreActions["endBalade"]>(() => {
    setState((s) => {
      if (!s.activeBalade) return s;
      const finished: FinishedBalade = {
        ...s.activeBalade,
        finishedAt: Date.now(),
      };
      return {
        ...s,
        activeBalade: null,
        history: [finished, ...s.history],
      };
    });
  }, []);

  const cancelBalade = useCallback<StoreActions["cancelBalade"]>(() => {
    setState((s) => ({ ...s, activeBalade: null }));
  }, []);

  const placeOnBody = useCallback<StoreActions["placeOnBody"]>(
    (zone, fragranceId, position, fragranceMeta) => {
      setState((s) => {
        if (!s.activeBalade) return s;
        const keep = s.activeBalade.placements.filter((p) => p.zone !== zone);
        return {
          ...s,
          activeBalade: {
            ...s.activeBalade,
            placements: [
              ...keep,
              { zone, fragranceId, position, fragranceMeta },
            ],
          },
        };
      });
    },
    [],
  );

  const layerOnBody = useCallback<StoreActions["layerOnBody"]>(
    (zone, fragranceId, position, fragranceMeta) => {
      setState((s) => {
        if (!s.activeBalade) return s;
        const exists = s.activeBalade.placements.some(
          (p) => p.zone === zone && p.fragranceId === fragranceId,
        );
        if (exists) return s;
        return {
          ...s,
          activeBalade: {
            ...s.activeBalade,
            placements: [
              ...s.activeBalade.placements,
              { zone, fragranceId, position, fragranceMeta },
            ],
          },
        };
      });
    },
    [],
  );

  const movePlacement = useCallback<StoreActions["movePlacement"]>(
    (fragranceId, newZone, position) => {
      setState((s) => {
        if (!s.activeBalade) return s;
        const placements = s.activeBalade.placements;
        const idx = placements.findIndex((p) => p.fragranceId === fragranceId);
        if (idx < 0) return s;
        const next = placements.map((p, i) =>
          i === idx ? { ...p, zone: newZone, position } : p,
        );
        return {
          ...s,
          activeBalade: { ...s.activeBalade, placements: next },
        };
      });
    },
    [],
  );

  const removePlacement = useCallback<StoreActions["removePlacement"]>(
    (fragranceId) => {
      setState((s) => {
        if (!s.activeBalade) return s;
        return {
          ...s,
          activeBalade: {
            ...s.activeBalade,
            placements: s.activeBalade.placements.filter(
              (p) => p.fragranceId !== fragranceId,
            ),
          },
        };
      });
    },
    [],
  );

  const removePlacementAt = useCallback<StoreActions["removePlacementAt"]>(
    (zone, fragranceId) => {
      setState((s) => {
        if (!s.activeBalade) return s;
        return {
          ...s,
          activeBalade: {
            ...s.activeBalade,
            placements: s.activeBalade.placements.filter(
              (p) => !(p.zone === zone && p.fragranceId === fragranceId),
            ),
          },
        };
      });
    },
    [],
  );

  const recordTest = useCallback<StoreActions["recordTest"]>(
    (fragranceId, feedback) => {
      setState((s) => {
        if (!s.activeBalade) return s;
        const others = s.activeBalade.tested.filter(
          (t) => t.fragranceId !== fragranceId,
        );
        return {
          ...s,
          activeBalade: {
            ...s.activeBalade,
            tested: [...others, { fragranceId, feedback }],
          },
        };
      });
    },
    [],
  );

  const advanceRoute = useCallback<StoreActions["advanceRoute"]>(() => {
    setState((s) => {
      if (!s.activeBalade) return s;
      return {
        ...s,
        activeBalade: {
          ...s.activeBalade,
          routeIndex: Math.min(
            s.activeBalade.route.length - 1,
            s.activeBalade.routeIndex + 1,
          ),
        },
      };
    });
  }, []);

  const canUseRecommendation = useCallback<StoreActions["canUseRecommendation"]>(
    () => {
      const usage = rolloverUsage(state.usage);
      const limit = TIER_LIMITS[state.subscription].recommendations;
      return usage.recommendations < limit;
    },
    [state.usage, state.subscription],
  );

  const consumeRecommendation = useCallback<
    StoreActions["consumeRecommendation"]
  >(() => {
    setState((s) => {
      const usage = rolloverUsage(s.usage);
      return {
        ...s,
        usage: { ...usage, recommendations: usage.recommendations + 1 },
      };
    });
  }, []);

  const canUseGuidedBalade = useCallback<StoreActions["canUseGuidedBalade"]>(
    () => {
      const usage = rolloverUsage(state.usage);
      const limit = TIER_LIMITS[state.subscription].guidedBalades;
      return usage.guidedBalades < limit;
    },
    [state.usage, state.subscription],
  );

  const consumeGuidedBalade = useCallback<
    StoreActions["consumeGuidedBalade"]
  >(() => {
    setState((s) => {
      const usage = rolloverUsage(s.usage);
      return {
        ...s,
        usage: { ...usage, guidedBalades: usage.guidedBalades + 1 },
      };
    });
  }, []);

  const setSubscription = useCallback<StoreActions["setSubscription"]>(
    (tier, cycle) => {
      const nextCycle: BillingCycle =
        tier === "free" ? "monthly" : (cycle ?? "monthly");
      setState((s) => ({
        ...s,
        subscription: tier,
        billingCycle: nextCycle,
        subscribedAt: tier === "free" ? null : Date.now(),
        // Reset counters on upgrade so a user who just maxed out free
        // immediately benefits from their new plan.
        usage: freshUsage(),
      }));
      // Notify referral system to grant points (best-effort, fire-and-forget)
      if (tier !== "free") {
        supabase.auth.getSession().then(({ data }) => {
          const token = data.session?.access_token;
          if (!token) return;
          fetch("/api/referral", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ action: "subscribe", tier, cycle: nextCycle }),
          }).catch(() => { /* best effort */ });
        });
      }
    },
    [],
  );

  const remaining = useCallback<StoreActions["remaining"]>(
    (kind) => {
      const usage = rolloverUsage(state.usage);
      const limit = TIER_LIMITS[state.subscription][kind];
      if (limit === Infinity) return Infinity;
      return Math.max(0, limit - usage[kind]);
    },
    [state.usage, state.subscription],
  );

  const refreshUsage = useCallback<StoreActions["refreshUsage"]>(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/usage", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const payload = (await res.json()) as {
        tier: SubscriptionTier;
        billing_cycle: BillingCycle;
        usage: {
          recos: { used: number; limit: number | null };
          balades: { used: number; limit: number | null };
        };
      };
      setState((s) => ({
        ...s,
        // Server is the truth for tier + cycle.
        subscription: payload.tier,
        billingCycle: payload.billing_cycle,
        // Mirror server counters into the client shape used by the UI.
        usage: {
          recommendations: payload.usage.recos.used,
          guidedBalades: payload.usage.balades.used,
          // Keep the local rolloverAt — server has its own monthly window
          // (date_trunc('month', now()::date)). Both eventually agree.
          resetAt: rolloverUsage(s.usage).resetAt,
        },
      }));
    } catch {
      // Silent fail — UX falls back on the local cache.
    }
  }, []);

  // Sync from server whenever the signed-in user changes (login, switch).
  useEffect(() => {
    if (authLoading || !userId) return;
    refreshUsage();
  }, [userId, authLoading, refreshUsage]);

  const value = useMemo<StoreContextValue>(
    () => ({
      ...state,
      addToWishlist,
      removeFromWishlist,
      isWishlisted,
      setWishlistCategory,
      startBalade,
      endBalade,
      cancelBalade,
      placeOnBody,
      layerOnBody,
      movePlacement,
      removePlacement,
      removePlacementAt,
      recordTest,
      advanceRoute,
      canUseRecommendation,
      consumeRecommendation,
      canUseGuidedBalade,
      consumeGuidedBalade,
      setSubscription,
      remaining,
      refreshUsage,
    }),
    [
      state,
      addToWishlist,
      removeFromWishlist,
      isWishlisted,
      setWishlistCategory,
      startBalade,
      endBalade,
      cancelBalade,
      placeOnBody,
      layerOnBody,
      movePlacement,
      removePlacement,
      removePlacementAt,
      recordTest,
      advanceRoute,
      canUseRecommendation,
      consumeRecommendation,
      canUseGuidedBalade,
      consumeGuidedBalade,
      setSubscription,
      remaining,
      refreshUsage,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}

// Types — re-export for convenience
export type { Fragrance, BodyZone };
