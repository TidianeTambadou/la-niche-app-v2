"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  fragranceKey,
  useData,
  useMyShop,
  useShopStock,
} from "@/lib/data";

export default function BoutiqueDashboard() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { stock: rawStock, loading: dataLoading, refresh } = useData();
  const myShop = useMyShop();
  const stock = useShopStock(myShop?.id);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || dataLoading) return;
    if (!user) {
      router.replace("/login?redirect=/boutique");
      return;
    }
    if (!myShop) {
      router.replace("/");
    }
  }, [authLoading, dataLoading, user, myShop, router]);

  /** key (brand_name slug) → underlying shop_stock.id for this shop. */
  const rowIdByKey = useMemo(() => {
    if (!myShop) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const s of rawStock) {
      if (s.shop_id !== myShop.id) continue;
      map.set(fragranceKey(s.brand || "Inconnu", s.perfume_name), s.id);
    }
    return map;
  }, [rawStock, myShop]);

  const enriched = useMemo(
    () => stock.filter((f) => (f.notes?.length ?? 0) > 0).length,
    [stock],
  );

  async function authHeader(): Promise<HeadersInit | null> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    return { Authorization: `Bearer ${token}` };
  }

  async function reEnrich(id: string) {
    setError(null);
    setBusyId(`enrich:${id}`);
    try {
      const headers = await authHeader();
      if (!headers) throw new Error("Session expirée");
      const res = await fetch("/api/boutique/stock", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string, label: string) {
    if (!confirm(`Supprimer « ${label} » du stock ?`)) return;
    setError(null);
    setBusyId(`del:${id}`);
    try {
      const headers = await authHeader();
      if (!headers) throw new Error("Session expirée");
      const res = await fetch(
        `/api/boutique/stock?id=${encodeURIComponent(id)}`,
        { method: "DELETE", headers },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading || dataLoading || !myShop) {
    return (
      <div className="px-6 pt-12 text-center">
        <p className="text-[10px] uppercase tracking-widest text-outline">
          Chargement…
        </p>
      </div>
    );
  }

  return (
    <div className="px-6 pt-4 pb-12">
      <header className="mb-8">
        <span className="text-[10px] uppercase tracking-[0.3em] text-outline mb-2 block">
          Console boutique
        </span>
        <h1 className="text-4xl font-bold tracking-tighter leading-none">
          {myShop.name}
        </h1>
        <p className="text-sm text-on-surface-variant mt-3 max-w-md leading-relaxed">
          Importe ton stock — l&apos;IA remplit automatiquement la famille
          olfactive et la pyramide des notes pour alimenter les balades guidées
          de tes clients.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-px bg-outline-variant/40 mb-8">
        <Stat value={stock.length} label="Parfums" />
        <Stat
          value={enriched}
          label="Notes IA"
          sub={
            stock.length > 0
              ? `${Math.round((enriched / stock.length) * 100)}%`
              : undefined
          }
        />
      </section>

      <Link
        href="/boutique/import"
        className="w-full mb-8 py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.2em] font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
      >
        <Icon name="add" size={16} />
        Ajouter un parfum
      </Link>

      {error && (
        <div className="mb-6 border border-error/50 bg-error-container/20 px-4 py-3">
          <p className="text-xs text-error">{error}</p>
        </div>
      )}

      <section>
        <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-outline mb-4">
          Stock actuel
        </p>

        {stock.length === 0 ? (
          <div className="border border-dashed border-outline-variant p-8 text-center">
            <Icon
              name="inventory_2"
              size={28}
              className="text-outline mx-auto mb-3"
            />
            <p className="text-sm text-on-surface-variant mb-4">
              Aucun parfum dans ton stock pour l&apos;instant.
            </p>
            <Link
              href="/boutique/import"
              className="inline-flex items-center gap-2 border border-outline-variant px-5 py-2.5 text-[10px] uppercase tracking-widest font-bold hover:border-primary transition-colors"
            >
              <Icon name="add" size={14} />
              Ajouter le premier
            </Link>
          </div>
        ) : (
          <ul className="space-y-px bg-outline-variant/40">
            {stock.map((f) => {
              const rowId = rowIdByKey.get(f.key) ?? null;
              const enrichBusy = busyId === `enrich:${rowId}`;
              const delBusy = busyId === `del:${rowId}`;
              return (
                <li
                  key={f.key}
                  className="bg-background p-4 flex items-start gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-mono text-outline mb-1">
                      {f.reference}
                    </p>
                    <p className="font-medium leading-tight truncate">{f.name}</p>
                    <p className="text-[10px] uppercase tracking-widest text-outline mt-0.5">
                      {f.brand}
                      {f.bestPrice != null && ` · ${f.bestPrice.toFixed(0)} €`}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {f.family && (
                        <span className="text-[9px] uppercase tracking-widest border border-outline-variant px-2 py-0.5">
                          {f.family}
                        </span>
                      )}
                      {f.notes && f.notes.length > 0 ? (
                        <span className="text-[9px] uppercase tracking-widest text-primary border border-primary/40 px-2 py-0.5">
                          {f.notes.length} notes IA
                        </span>
                      ) : (
                        <span className="text-[9px] uppercase tracking-widest text-outline border border-outline-variant px-2 py-0.5">
                          Sans notes
                        </span>
                      )}
                    </div>
                    {f.notes && f.notes.length > 0 && (
                      <p className="text-[10px] text-on-surface-variant mt-2 leading-snug">
                        {f.notes
                          .slice(0, 6)
                          .map((n) => n.name)
                          .join(", ")}
                        {f.notes.length > 6 && "…"}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => rowId && reEnrich(rowId)}
                      disabled={!rowId || enrichBusy}
                      className="text-[9px] uppercase tracking-widest font-bold border border-outline-variant px-2 py-1 hover:border-primary transition-colors disabled:opacity-40 flex items-center gap-1"
                      aria-label="Régénérer les notes via l'IA"
                    >
                      <Icon
                        name={enrichBusy ? "progress_activity" : "auto_awesome"}
                        size={11}
                      />
                      IA
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        rowId && remove(rowId, `${f.brand} — ${f.name}`)
                      }
                      disabled={!rowId || delBusy}
                      className="text-[9px] uppercase tracking-widest font-bold border border-outline-variant px-2 py-1 hover:border-error hover:text-error transition-colors disabled:opacity-40 flex items-center gap-1"
                      aria-label="Supprimer du stock"
                    >
                      <Icon
                        name={delBusy ? "progress_activity" : "delete_outline"}
                        size={11}
                      />
                      Suppr
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  value,
  label,
  sub,
}: {
  value: number | string;
  label: string;
  sub?: string;
}) {
  return (
    <div className="bg-background p-5">
      <p className="text-3xl font-bold tracking-tight font-mono leading-none">
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-widest text-outline mt-2">
        {label}
      </p>
      {sub && <p className="text-[9px] font-mono text-primary mt-0.5">{sub}</p>}
    </div>
  );
}
