"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { ErrorBubble } from "@/components/ErrorBubble";
import { shopOpenNow, useData, useShops } from "@/lib/data";
import { useRequireAuth } from "@/lib/auth";

export default function GuidedShopPickPage() {
  useRequireAuth();
  const { loading, error } = useData();
  const shops = useShops();
  const [q, setQ] = useState("");

  const filtered = q
    ? shops.filter((s) =>
        (
          s.name +
          " " +
          (s.address_line ?? "") +
          " " +
          (s.city ?? "") +
          " " +
          (s.postal_code ?? "")
        )
          .toLowerCase()
          .includes(q.toLowerCase()),
      )
    : shops;

  return (
    <div className="px-6 pt-4 pb-12">
      <header className="mb-8">
        <span className="text-[10px] uppercase tracking-[0.3em] text-outline mb-2 block">
          Balade guidée · 01
        </span>
        <h1 className="text-4xl font-bold tracking-tighter leading-none">
          Choisis ta boutique
        </h1>
        <p className="text-sm text-on-surface-variant mt-3 max-w-md leading-relaxed">
          Le parcours sera optimisé selon le stock disponible et le temps que tu
          indiqueras à l&apos;étape suivante.
        </p>
      </header>

      <div className="relative mb-6">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ville ou code postal…"
          className="w-full bg-transparent border-b border-outline-variant py-3 px-1 text-base focus:outline-none focus:border-primary placeholder:text-outline placeholder:uppercase placeholder:text-xs placeholder:tracking-widest"
        />
        <Icon
          name="search"
          size={18}
          className="absolute right-1 top-3 text-outline"
        />
      </div>

      {error && (
        <div className="mb-6">
          <ErrorBubble
            detail={error}
            context="Balade guidée · chargement"
            variant="block"
          />
        </div>
      )}

      {loading ? (
        <ul className="space-y-2">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-32 bg-surface-container-low animate-pulse"
            />
          ))}
        </ul>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-on-surface-variant mt-6 text-center">
          {shops.length === 0
            ? "Aucune boutique enregistrée. Crée-en une depuis le CRM."
            : "Aucune boutique ne correspond à ta recherche."}
        </p>
      ) : (
        <ul className="space-y-px bg-outline-variant/40">
          {filtered.map((shop) => {
            const open = shopOpenNow(shop);
            const ref = `LN-${shop.id.slice(0, 6).toUpperCase()}`;
            const addressLine = [shop.address_line, shop.postal_code, shop.city]
              .filter(Boolean)
              .join(", ");
            return (
              <li key={shop.id}>
                <Link
                  href={`/balade/guided/${shop.id}`}
                  className="block bg-background hover:bg-surface-container-low p-5 transition-colors"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="min-w-0 pr-3">
                      <span className="text-[9px] font-mono text-outline mb-1 block">
                        {ref}
                      </span>
                      <h2 className="text-xl font-semibold tracking-tight truncate">
                        {shop.name}
                      </h2>
                    </div>
                    <span
                      className={
                        open
                          ? "text-[10px] uppercase tracking-widest text-primary font-bold"
                          : "text-[10px] uppercase tracking-widest text-outline"
                      }
                    >
                      {open ? "Ouvert" : "Fermé"}
                    </span>
                  </div>
                  {addressLine && (
                    <p className="text-xs text-on-surface-variant">
                      {addressLine}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
