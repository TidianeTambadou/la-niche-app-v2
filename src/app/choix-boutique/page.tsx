"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useRequireAuth } from "@/lib/auth";
import type { Shop } from "@/lib/types";
import { DataLabel } from "@/components/brutalist/DataLabel";

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
      <header className="relative pl-6">
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
        <DataLabel>SHOP_INDEX · {shops.length} ITEMS</DataLabel>
        <h1 className="font-sans font-black text-3xl tracking-tighter uppercase leading-none mt-2">
          CHOISIR
          <br />
          <span className="ml-4">UNE BOUTIQUE</span>
        </h1>
        <p className="font-cormorant italic text-base opacity-70 mt-3 max-w-md">
          « Sélectionne la boutique pour qui tu remplis le formulaire — ton
          profil olfactif sera transmis directement. »
        </p>
      </header>

      {error && (
        <div className="border-2 border-on-background bg-on-background text-background px-4 py-3">
          <p className="font-mono text-xs uppercase tracking-wider">{error}</p>
        </div>
      )}

      {loading ? (
        <DataLabel>LOADING…</DataLabel>
      ) : (
        <ul className="flex flex-col gap-2">
          {shops.map((s) => (
            <li key={s.id}>
              <Link
                href={`/boutique/${s.id}/formulaire`}
                className="flex items-start gap-3 px-4 py-3 border-2 border-on-background bg-background hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[4px_4px_0px_0px_currentColor] transition-all duration-150"
              >
                <Icon name="storefront" className="mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-sans font-bold uppercase tracking-tight">{s.name}</p>
                  <p className="font-mono text-xs opacity-60 uppercase tracking-wider truncate mt-0.5">
                    {[s.address_line, s.postal_code, s.city].filter(Boolean).join(", ") ||
                      "ADRESSE NON RENSEIGNÉE"}
                  </p>
                </div>
                <Icon name="chevron_right" className="opacity-40 mt-1" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
