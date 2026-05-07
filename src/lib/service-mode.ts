"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useShopRole } from "@/lib/role";

export type ServiceMode = "in_service" | "out_service";

const DAYS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
] as const;

/**
 * Returns the current service mode for the signed-in boutique :
 *
 *   - "in_service"  → the boutique is in open hours. Clients may be
 *                     handling the device → the UI must hide newsletter,
 *                     stock, settings… and slim down the clients list to
 *                     the bare minimum.
 *   - "out_service" → the boutique is closed (or the user isn't a
 *                     boutique). All admin features are visible.
 *
 * The decision is purely client-side : we read `shop.opening_hours` (set
 * via /settings/horaires) and the current Date. The hook re-evaluates
 * every minute so a tab kept open across the closing time still flips
 * automatically without a refresh.
 *
 * For non-boutique users (regular customers) the mode is irrelevant —
 * we always return "out_service" so the BottomTabBar / route guards
 * become no-ops.
 */
export function useShopMode(): ServiceMode {
  const { shop, isBoutique, loading } = useShopRole();
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (loading || !isBoutique) return "out_service";
  return computeMode(shop?.opening_hours ?? null, now);
}

/**
 * Page guard for admin-only routes. When the boutique is in_service we
 * push the visitor to /pour-un-client so they can't reach newsletter,
 * stock, settings, or any client-detail page from the open-hours kiosk.
 */
export function useGuardOutOfService(redirect = "/pour-un-client") {
  const router = useRouter();
  const mode = useShopMode();
  useEffect(() => {
    if (mode === "in_service") router.replace(redirect);
  }, [mode, redirect, router]);
  return mode;
}

export function computeMode(
  hours: import("@/lib/types").OpeningHours | null,
  now: Date,
): ServiceMode {
  if (!hours) return "out_service";
  const dayKey = DAYS[now.getDay()];
  const today = hours[dayKey];
  if (!today || !today.ouvert) return "out_service";

  const cur =
    String(now.getHours()).padStart(2, "0") +
    ":" +
    String(now.getMinutes()).padStart(2, "0");
  return cur >= today.debut && cur <= today.fin ? "in_service" : "out_service";
}
