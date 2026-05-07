"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { Shop } from "@/lib/types";

type ShopRoleState = {
  loading: boolean;
  shop: Shop | null;
  isBoutique: boolean;
};

/**
 * Returns whether the signed-in user owns a row in `public.shops`.
 *
 * Convention (preserved from v1) : `shops.id = auth.uid()` for boutique
 * accounts. A user without a matching shop row is treated as a regular
 * customer.
 *
 * Result is cached in memory per session — the lookup runs at most once
 * per user id change.
 */
export function useShopRole(): ShopRoleState {
  const { user, loading: authLoading } = useAuth();
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return;
    if (!user) {
      setShop(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("shops")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setShop((data as Shop | null) ?? null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  return { loading: authLoading || loading, shop, isBoutique: !!shop };
}
