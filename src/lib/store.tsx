"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { BodyZone, Fragrance } from "@/lib/fragrances";

export type WishlistStatus = "liked" | "disliked";
export type WishlistOrigin = "search" | "scan" | "balade" | "manual";

export type WishlistEntry = {
  fragranceId: string;
  status: WishlistStatus;
  addedAt: number;
  origin: WishlistOrigin;
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

type StoreState = {
  wishlist: WishlistEntry[];
  activeBalade: ActiveBalade | null;
  history: FinishedBalade[];
};

type StoreActions = {
  // Wishlist
  addToWishlist: (
    fragranceId: string,
    status: WishlistStatus,
    origin: WishlistOrigin,
  ) => void;
  removeFromWishlist: (fragranceId: string) => void;
  isWishlisted: (fragranceId: string) => WishlistStatus | null;

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
  /** Replace any existing placement at this zone with the new fragrance.
   *  Same fragrance is allowed at multiple zones. Optional `position` stores
   *  the exact 3D hit point on the body (for drawing a precise marker). */
  placeOnBody: (
    zone: BodyZone,
    fragranceId: string,
    position?: [number, number, number],
  ) => void;
  /** Add a fragrance on top of existing placements at the same zone (layering).
   *  No-op if the same (zone, fragranceId) tuple already exists. */
  layerOnBody: (
    zone: BodyZone,
    fragranceId: string,
    position?: [number, number, number],
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
};

type StoreContextValue = StoreState & StoreActions;

const StoreContext = createContext<StoreContextValue | null>(null);

const STORAGE_KEY = "la-niche.store.v1";

function readStorage(): StoreState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoreState;
  } catch {
    return null;
  }
}

function writeStorage(state: StoreState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

const initialState: StoreState = {
  wishlist: [],
  activeBalade: null,
  history: [],
};

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StoreState>(initialState);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on first client render only.
  useEffect(() => {
    const fromStorage = readStorage();
    if (fromStorage) setState(fromStorage);
    setHydrated(true);
  }, []);

  // Persist on every state change after hydration.
  useEffect(() => {
    if (!hydrated) return;
    writeStorage(state);
  }, [state, hydrated]);

  const addToWishlist = useCallback<StoreActions["addToWishlist"]>(
    (fragranceId, status, origin) => {
      setState((s) => {
        const existing = s.wishlist.find((w) => w.fragranceId === fragranceId);
        if (existing) {
          return {
            ...s,
            wishlist: s.wishlist.map((w) =>
              w.fragranceId === fragranceId
                ? { ...w, status, addedAt: Date.now(), origin }
                : w,
            ),
          };
        }
        return {
          ...s,
          wishlist: [
            { fragranceId, status, addedAt: Date.now(), origin },
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
    (zone, fragranceId, position) => {
      setState((s) => {
        if (!s.activeBalade) return s;
        const keep = s.activeBalade.placements.filter((p) => p.zone !== zone);
        return {
          ...s,
          activeBalade: {
            ...s.activeBalade,
            placements: [...keep, { zone, fragranceId, position }],
          },
        };
      });
    },
    [],
  );

  const layerOnBody = useCallback<StoreActions["layerOnBody"]>(
    (zone, fragranceId, position) => {
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
              { zone, fragranceId, position },
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

  const value = useMemo<StoreContextValue>(
    () => ({
      ...state,
      addToWishlist,
      removeFromWishlist,
      isWishlisted,
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
    }),
    [
      state,
      addToWishlist,
      removeFromWishlist,
      isWishlisted,
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
