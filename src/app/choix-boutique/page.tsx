"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useRequireAuth } from "@/lib/auth";
import type { Shop } from "@/lib/types";

export default function ChoixBoutiquePage() {
  useRequireAuth();
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/shops");
        const json = (await res.json()) as { shops: Shop[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        setShops(json.shops);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="px-6 py-6 flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Choisir une boutique</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Sélectionne la boutique pour qui tu remplis le formulaire. Ton
          profil olfactif sera envoyé directement à son équipe.
        </p>
      </header>

      {error && (
        <p className="text-sm text-error border border-error/30 bg-error-container/30 px-4 py-3 rounded-xl">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-on-surface-variant">Chargement…</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shops.map((s) => (
            <li key={s.id}>
              <Link
                href={`/boutique/${s.id}/formulaire`}
                className="flex items-start gap-3 px-4 py-3 border border-outline-variant rounded-2xl hover:border-primary transition-colors"
              >
                <Icon name="storefront" className="mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-xs text-on-surface-variant truncate">
                    {[s.address_line, s.postal_code, s.city].filter(Boolean).join(", ") ||
                      "Adresse non renseignée"}
                  </p>
                </div>
                <Icon name="chevron_right" className="text-outline mt-1" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
