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
  zone: BodyZone;
  fragranceId: string;
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
  placeOnBody: (zone: BodyZone, fragranceId: string) => void;
  movePlacement: (fragranceId: string, newZone: BodyZone) => void;
  removePlacement: (fragranceId: string) => void;

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
    (zone, fragranceId) => {
      setState((s) => {
        if (!s.activeBalade) return s;
        const others = s.activeBalade.placements.filter(
          (p) => p.fragranceId !== fragranceId && p.zone !== zone,
        );
        return {
          ...s,
          activeBalade: {
            ...s.activeBalade,
            placements: [...others, { zone, fragranceId }],
          },
        };
      });
    },
    [],
  );

  const movePlacement = useCallback<StoreActions["movePlacement"]>(
    (fragranceId, newZone) => {
      setState((s) => {
        if (!s.activeBalade) return s;
        const others = s.activeBalade.placements.filter(
          (p) => p.fragranceId !== fragranceId && p.zone !== newZone,
        );
        return {
          ...s,
          activeBalade: {
            ...s.activeBalade,
            placements: [...others, { zone: newZone, fragranceId }],
          },
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
      movePlacement,
      removePlacement,
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
      movePlacement,
      removePlacement,
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
