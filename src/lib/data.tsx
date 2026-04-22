"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";
import type { Shop as RemoteShop, StockItem as RemoteStockItem } from "@/lib/types";

export type { RemoteShop, RemoteStockItem };

/**
 * Aggregated fragrance derived from one or more `shop_stock` rows that share
 * the same (brand, perfume_name). The mobile customer app does NOT have a
 * canonical `fragrances` table in the CRM database — every fragrance is
 * stocked by a shop, so the catalog is the union/dedup of all stock items.
 *
 * `key` is the stable identity used in URLs and stored in the wishlist /
 * placements / route arrays. `id` is an alias for backwards-compat with
 * components that still read `.id`.
 */
export type Fragrance = {
  key: string;
  /** Alias for `key` — kept so legacy callers (`fragrance.id`) keep working. */
  id: string;
  name: string;
  brand: string;
  imageUrl: string | null;
  /** Synthesized short reference (LN-XXXXXX), good enough for badges. */
  reference: string;
  availability: Availability[];
  /** Lowest price across all shops where the perfume is in stock. */
  bestPrice: number | null;
  /**
   * Empty for now. The CRM doesn't capture rich metadata (notes, family,
   * description). When that arrives, populate these and the detail page
   * picks them up automatically.
   */
  tags: string[];
  family?: string;
  intensity?: "subtle" | "moderate" | "projective";
  description?: string;
  notes?: { layer: "top" | "heart" | "base"; name: string }[];
  origin?: string;
  concentration?: string;
  volumeMl?: number;
};

export type Availability = {
  shopId: string;
  price: number | null;
  quantity: number;
  imageUrl: string | null;
  isPrivateSale: boolean;
  privateSalePrice: number | null;
};

/* -------------------------------------------------------------------------
 * Slug + key helpers
 * --------------------------------------------------------------------- */

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function fragranceKey(brand: string, name: string): string {
  return `${slugify(brand || "inconnu")}_${slugify(name)}`;
}

/* -------------------------------------------------------------------------
 * Aggregation
 * --------------------------------------------------------------------- */

export function aggregateStock(stock: RemoteStockItem[]): Fragrance[] {
  const byKey = new Map<string, RemoteStockItem[]>();
  for (const s of stock) {
    if (!s.perfume_name) continue;
    const k = fragranceKey(s.brand || "Inconnu", s.perfume_name);
    const arr = byKey.get(k);
    if (arr) arr.push(s);
    else byKey.set(k, [s]);
  }

  const fragrances: Fragrance[] = [];
  for (const [k, items] of byKey) {
    // Most recent item wins for canonical metadata (name casing, brand casing).
    const sorted = [...items].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const first = sorted[0];

    const imageUrl =
      sorted.find((i) => i.image_url)?.image_url ??
      `https://placehold.co/600x800/0a0a0a/e2e2e2?font=montserrat&text=${encodeURIComponent(first.perfume_name)}`;

    const availability: Availability[] = items.map((i) => ({
      shopId: i.shop_id,
      price: i.price,
      quantity: i.quantity,
      imageUrl: i.image_url,
      isPrivateSale: i.is_private_sale,
      privateSalePrice: i.private_sale_price,
    }));

    const candidatePrices = items
      .map((i) =>
        i.is_private_sale && i.private_sale_price != null
          ? i.private_sale_price
          : i.price,
      )
      .filter((p): p is number => typeof p === "number");
    const bestPrice = candidatePrices.length
      ? Math.min(...candidatePrices)
      : null;

    fragrances.push({
      key: k,
      id: k,
      name: first.perfume_name,
      brand: first.brand || "Inconnu",
      imageUrl,
      reference: `LN-${k.split("_").map((p) => p.slice(0, 3).toUpperCase()).join("")}`.slice(0, 12),
      availability,
      bestPrice,
      tags: [],
    });
  }

  return fragrances.sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function searchFragrances(
  list: Fragrance[],
  query: string,
): Fragrance[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  const tokens = q.split(/[\s,]+/).filter(Boolean);

  const scored = list
    .map((f) => {
      const haystack = [
        f.name,
        f.brand,
        f.family ?? "",
        ...(f.tags ?? []),
        ...(f.notes?.map((n) => n.name) ?? []),
      ]
        .join(" ")
        .toLowerCase();
      const score = tokens.reduce(
        (acc, t) => acc + (haystack.includes(t) ? 1 : 0),
        0,
      );
      return { f, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.f);

  return scored;
}

export function scentOfTheDay(list: Fragrance[]): Fragrance | null {
  if (list.length === 0) return null;
  const day = new Date();
  const idx =
    (day.getFullYear() * 366 + day.getMonth() * 31 + day.getDate()) %
    list.length;
  return list[idx];
}

/**
 * Generate a guided balade route: pick `count = floor(timeBudget / 5)` fragrances
 * from the shop's stock, diversifying by brand so the user doesn't smell three
 * Atelier Niche perfumes in a row. Caller passes the already-filtered stock for
 * a single shop.
 */
export function generateGuidedRoute(
  shopFragrances: Fragrance[],
  timeBudgetMin: number,
): string[] {
  if (shopFragrances.length === 0) return [];
  const perPerfumeMin = 5;
  const count = Math.max(
    1,
    Math.min(shopFragrances.length, Math.floor(timeBudgetMin / perPerfumeMin)),
  );

  const byBrand = new Map<string, Fragrance[]>();
  for (const f of shopFragrances) {
    const arr = byBrand.get(f.brand) ?? [];
    arr.push(f);
    byBrand.set(f.brand, arr);
  }
  const brands = [...byBrand.keys()];
  const route: string[] = [];
  let cursor = 0;
  while (route.length < count) {
    const brand = brands[cursor % brands.length];
    const candidates = byBrand.get(brand) ?? [];
    const pick = candidates.shift();
    if (pick) route.push(pick.key);
    byBrand.set(brand, candidates);
    cursor += 1;
    if (brands.every((b) => (byBrand.get(b)?.length ?? 0) === 0)) break;
  }
  return route;
}

/* -------------------------------------------------------------------------
 * Provider
 * --------------------------------------------------------------------- */

type DataState = {
  shops: RemoteShop[];
  stock: RemoteStockItem[];
  fragrances: Fragrance[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const DataContext = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [shops, setShops] = useState<RemoteShop[]>([]);
  const [stock, setStock] = useState<RemoteStockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [shopsRes, stockRes] = await Promise.all([
        supabase
          .from("shops")
          .select("*")
          .order("name", { ascending: true }),
        supabase
          .from("shop_stock")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);
      if (shopsRes.error) throw shopsRes.error;
      if (stockRes.error) throw stockRes.error;
      setShops((shopsRes.data ?? []) as RemoteShop[]);
      setStock((stockRes.data ?? []) as RemoteStockItem[]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur de chargement";
      setError(msg);
      // eslint-disable-next-line no-console
      console.warn("DataProvider fetch failed:", msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const fragrances = useMemo(() => aggregateStock(stock), [stock]);

  const value = useMemo<DataState>(
    () => ({ shops, stock, fragrances, loading, error, refresh: fetchAll }),
    [shops, stock, fragrances, loading, error, fetchAll],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

/* -------------------------------------------------------------------------
 * Hooks
 * --------------------------------------------------------------------- */

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside <DataProvider>");
  return ctx;
}

export function useShops(): RemoteShop[] {
  return useData().shops;
}

export function useShop(shopId: string | null | undefined): RemoteShop | undefined {
  const shops = useShops();
  return shopId ? shops.find((s) => s.id === shopId) : undefined;
}

export function useFragrances(): Fragrance[] {
  return useData().fragrances;
}

export function useFragrance(key: string | null | undefined): Fragrance | undefined {
  const fragrances = useFragrances();
  return key ? fragrances.find((f) => f.key === key) : undefined;
}

export function useShopStock(shopId: string | null | undefined): Fragrance[] {
  const { stock } = useData();
  return useMemo(() => {
    if (!shopId) return [];
    return aggregateStock(stock.filter((s) => s.shop_id === shopId));
  }, [stock, shopId]);
}

/* -------------------------------------------------------------------------
 * Distance helper for "nearby shops" sorting (mock distance for now —
 * the CRM stores lat/long but the customer app has no geolocation yet).
 * --------------------------------------------------------------------- */

export function shopOpenNow(shop: RemoteShop, now: Date = new Date()): boolean {
  const oh = shop.opening_hours;
  if (!oh) return true; // Optimistic default when no schedule recorded.
  const days = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;
  const dayKey = days[now.getDay()];
  const today = (oh as Record<string, { ouvert: boolean; debut: string; fin: string }>)[dayKey];
  if (!today || !today.ouvert) return false;
  const cur = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return cur >= today.debut && cur <= today.fin;
}
