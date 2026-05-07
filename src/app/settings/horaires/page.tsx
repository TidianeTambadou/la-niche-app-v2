"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useRequireAuth } from "@/lib/auth";
import { useShopRole } from "@/lib/role";
import { useGuardOutOfService } from "@/lib/service-mode";
import { authedFetch } from "@/lib/api-client";
import type { DayHours, OpeningHours, Shop } from "@/lib/types";

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
    return <div className="p-6 text-sm text-on-surface-variant">Chargement…</div>;
  }

  return (
    <div className="px-6 py-6 flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Horaires d'ouverture</h1>
        <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
          L'app bascule automatiquement en <span className="font-semibold">mode boutique</span> pendant tes heures d'ouverture
          (newsletter, stock et réglages cachés pour qu'aucun client ne tombe dessus). Hors créneau,
          tout redevient visible.
        </p>
      </header>

      {error && (
        <p className="text-sm text-error border border-error/30 bg-error-container/30 px-4 py-3 rounded-xl">
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {DAYS.map(({ key, label }) => {
          const day = hours[key];
          return (
            <li
              key={key}
              className="flex items-center gap-3 px-4 py-3 border border-outline-variant rounded-2xl"
            >
              <label className="flex items-center gap-2 flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked={day.ouvert}
                  onChange={(e) => updateDay(key, { ouvert: e.target.checked })}
                />
                <span className="text-sm font-medium">{label}</span>
              </label>
              <input
                type="time"
                value={day.debut}
                onChange={(e) => updateDay(key, { debut: e.target.value })}
                disabled={!day.ouvert}
                className="px-2 py-1 bg-surface-container rounded-lg border border-outline-variant text-sm disabled:opacity-40"
              />
              <span className="text-xs text-outline">→</span>
              <input
                type="time"
                value={day.fin}
                onChange={(e) => updateDay(key, { fin: e.target.value })}
                disabled={!day.ouvert}
                className="px-2 py-1 bg-surface-container rounded-lg border border-outline-variant text-sm disabled:opacity-40"
              />
            </li>
          );
        })}
      </ul>

      {saved && (
        <p className="text-sm text-primary flex items-center gap-1.5">
          <Icon name="check_circle" size={16} />
          Horaires enregistrés.
        </p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={save}
        className="w-full py-3 bg-primary text-on-primary rounded-full text-sm font-bold uppercase tracking-widest disabled:opacity-50"
      >
        {busy ? "Enregistrement…" : "Enregistrer"}
      </button>
    </div>
  );
}
