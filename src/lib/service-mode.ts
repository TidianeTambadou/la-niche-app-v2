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

/* ---------------------------------------------------------------------
 * Settings bypass — la boutique peut "déverrouiller" temporairement les
 * réglages (questions, horaires…) pendant l'in_service, après avoir
 * ressaisi son mot de passe Supabase. Le flag vit dans sessionStorage,
 * donc il s'efface automatiquement à la fermeture de l'onglet — pas
 * besoin de prévoir un timer côté client.
 * --------------------------------------------------------------------- */

const BYPASS_KEY = "la-niche.settings-bypass";

export function setSettingsBypass(active: boolean) {
  if (typeof window === "undefined") return;
  if (active) sessionStorage.setItem(BYPASS_KEY, "true");
  else sessionStorage.removeItem(BYPASS_KEY);
  // Notifier les autres composants montés dans le même onglet — l'event
  // "storage" ne fire QUE entre onglets, on émet donc un event custom.
  window.dispatchEvent(new Event("la-niche.bypass-change"));
}

function readBypass(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(BYPASS_KEY) === "true";
}

export function useSettingsBypass(): boolean {
  const [active, setActive] = useState<boolean>(() => readBypass());
  useEffect(() => {
    const onChange = () => setActive(readBypass());
    window.addEventListener("la-niche.bypass-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("la-niche.bypass-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  return active;
}

/**
 * Page guard for admin-only routes. When the boutique is in_service we
 * push the visitor to /pour-un-client so they can't reach newsletter,
 * stock, settings, or any client-detail page from the open-hours kiosk.
 *
 * `options.bypassable` lets a route opt into the password-protected
 * unlock flow (used by /settings/* — the boutique can re-enter their
 * password and edit questions / hours mid-day).
 */
export function useGuardOutOfService(
  redirect = "/pour-un-client",
  options: { bypassable?: boolean } = {},
) {
  const router = useRouter();
  const mode = useShopMode();
  const bypass = useSettingsBypass();
  useEffect(() => {
    if (mode !== "in_service") return;
    if (options.bypassable && bypass) return;
    router.replace(redirect);
  }, [mode, bypass, redirect, router, options.bypassable]);
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
