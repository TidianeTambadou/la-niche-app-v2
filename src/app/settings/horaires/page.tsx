"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useRequireAuth } from "@/lib/auth";
import { useShopRole } from "@/lib/role";
import { useGuardOutOfService } from "@/lib/service-mode";
import { authedFetch } from "@/lib/api-client";
import type { DayHours, OpeningHours, Shop } from "@/lib/types";
import { DataLabel } from "@/components/brutalist/DataLabel";
import { BrutalistButton } from "@/components/brutalist/BrutalistButton";

const DAYS: { key: keyof OpeningHours; label: string }[] = [
  { key: "lundi", label: "Lundi" },
  { key: "mardi", label: "Mardi" },
  { key: "mercredi", label: "Mercredi" },
  { key: "jeudi", label: "Jeudi" },
  { key: "vendredi", label: "Vendredi" },
  { key: "samedi", label: "Samedi" },
  { key: "dimanche", label: "Dimanche" },
];

const DEFAULT_HOURS: OpeningHours = {
  lundi: { ouvert: true, debut: "10:00", fin: "19:00" },
  mardi: { ouvert: true, debut: "10:00", fin: "19:00" },
  mercredi: { ouvert: true, debut: "10:00", fin: "19:00" },
  jeudi: { ouvert: true, debut: "10:00", fin: "19:00" },
  vendredi: { ouvert: true, debut: "10:00", fin: "19:00" },
  samedi: { ouvert: true, debut: "10:00", fin: "19:00" },
  dimanche: { ouvert: false, debut: "10:00", fin: "19:00" },
};

export default function OpeningHoursPage() {
  useRequireAuth();
  useGuardOutOfService("/pour-un-client", { bypassable: true });
  const router = useRouter();
  const { isBoutique, loading: roleLoading } = useShopRole();
  const [hours, setHours] = useState<OpeningHours>(DEFAULT_HOURS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!roleLoading && !isBoutique) router.replace("/");
  }, [isBoutique, roleLoading, router]);

  useEffect(() => {
    if (!isBoutique) return;
    (async () => {
      try {
        const json = await authedFetch<{ shop: Shop }>("/api/shops/me");
        if (json.shop.opening_hours) setHours(json.shop.opening_hours);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      } finally {
        setLoading(false);
      }
    })();
  }, [isBoutique]);

  function updateDay(day: keyof OpeningHours, patch: Partial<DayHours>) {
    setHours((h) => ({ ...h, [day]: { ...h[day], ...patch } }));
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await authedFetch("/api/shops/me", {
        method: "PATCH",
        body: JSON.stringify({ opening_hours: hours }),
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  if (loading || roleLoading) {
    return (
      <div className="p-6">
        <DataLabel>LOADING…</DataLabel>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 flex flex-col gap-6">
      <header className="relative pl-6">
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
        <DataLabel>SCHEDULE · OPENING_HOURS</DataLabel>
        <h1 className="font-sans font-black text-3xl tracking-tighter uppercase leading-none mt-2">
          HORAIRES
        </h1>
        <p className="font-cormorant italic text-base opacity-70 mt-3 max-w-md">
          « L'app bascule automatiquement en mode boutique pendant les heures
          d'ouverture — newsletter, stock et réglages cachés. Hors créneau,
          tout redevient visible. »
        </p>
      </header>

      {error && (
        <div className="border-2 border-on-background bg-on-background text-background px-4 py-3">
          <p className="font-mono text-xs uppercase tracking-wider">{error}</p>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {DAYS.map(({ key, label }) => {
          const day = hours[key];
          return (
            <li
              key={key}
              className="flex items-center gap-3 px-4 py-3 border-2 border-on-background bg-background"
            >
              <label className="flex items-center gap-2 flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked={day.ouvert}
                  onChange={(e) => updateDay(key, { ouvert: e.target.checked })}
                  className="w-4 h-4 accent-on-background"
                />
                <span className="font-sans font-bold uppercase tracking-tight text-sm">
                  {label}
                </span>
              </label>
              <input
                type="time"
                value={day.debut}
                onChange={(e) => updateDay(key, { debut: e.target.value })}
                disabled={!day.ouvert}
                className="px-2 py-1.5 bg-background border-2 border-on-background font-mono text-sm disabled:opacity-40 focus:outline-none focus:shadow-[2px_2px_0px_0px_currentColor] transition-shadow"
              />
              <span className="font-mono text-xs opacity-60">→</span>
              <input
                type="time"
                value={day.fin}
                onChange={(e) => updateDay(key, { fin: e.target.value })}
                disabled={!day.ouvert}
                className="px-2 py-1.5 bg-background border-2 border-on-background font-mono text-sm disabled:opacity-40 focus:outline-none focus:shadow-[2px_2px_0px_0px_currentColor] transition-shadow"
              />
            </li>
          );
        })}
      </ul>

      {saved && (
        <p className="font-mono text-xs uppercase tracking-widest font-bold flex items-center gap-1.5">
          <Icon name="check_circle" size={16} />
          ENREGISTRÉ ✓
        </p>
      )}

      <BrutalistButton onClick={save} disabled={busy} size="lg" className="w-full">
        {busy ? "Enregistrement…" : "Enregistrer"}
      </BrutalistButton>
    </div>
  );
}
