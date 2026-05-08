"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useRequireAuth } from "@/lib/auth";
import { useShopRole } from "@/lib/role";
import { useGuardOutOfService } from "@/lib/service-mode";
import { authedFetch } from "@/lib/api-client";
import type { ShopPerfume } from "@/lib/types";
import { DataLabel } from "@/components/brutalist/DataLabel";
import { BrutalistButton } from "@/components/brutalist/BrutalistButton";

export default function PerfumeStockPage() {
  useRequireAuth();
  useGuardOutOfService();
  const router = useRouter();
  const { isBoutique, loading: roleLoading } = useShopRole();
  const [perfumes, setPerfumes] = useState<ShopPerfume[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ShopPerfume | "new" | null>(null);

  useEffect(() => {
    if (!roleLoading && !isBoutique) router.replace("/");
  }, [isBoutique, roleLoading, router]);

  useEffect(() => {
    if (!isBoutique) return;
    refresh();
  }, [isBoutique]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const json = await authedFetch<{ perfumes: ShopPerfume[] }>("/api/perfumes");
      setPerfumes(json.perfumes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Supprimer ce parfum du stock ?")) return;
    try {
      await authedFetch(`/api/perfumes/${id}`, { method: "DELETE" });
      setPerfumes((ps) => ps.filter((p) => p.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  return (
    <div className="px-6 py-6 flex flex-col gap-5">
      <header className="relative pl-6">
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
        <DataLabel>STOCK · {perfumes.length} ITEMS</DataLabel>
        <div className="flex items-end justify-between gap-3 mt-2 flex-wrap">
          <h1 className="font-sans font-black text-3xl tracking-tighter uppercase leading-none">
            STOCK
            <br />
            <span className="ml-4">PARFUMS</span>
          </h1>
          <div className="flex items-center gap-2">
            <Link
              href="/newsletter/stock/import"
              className="flex items-center gap-1 px-3 py-2 border-2 border-on-background bg-background hover:bg-on-background hover:text-background font-mono text-[11px] font-bold uppercase tracking-widest transition-colors duration-150"
            >
              <Icon name="upload_file" size={14} />
              Import CSV
            </Link>
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="flex items-center gap-1 px-4 py-2 bg-on-background text-background border-2 border-on-background shadow-[4px_4px_0px_0px_currentColor] hover:shadow-[2px_2px_0px_0px_currentColor] hover:translate-x-[2px] hover:translate-y-[2px] font-mono text-[11px] font-bold uppercase tracking-widest transition-all duration-150"
            >
              <Icon name="add" size={14} />
              Nouveau
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="border-2 border-on-background bg-on-background text-background px-4 py-3">
          <p className="font-mono text-xs uppercase tracking-wider">{error}</p>
        </div>
      )}

      {loading ? (
        <DataLabel>LOADING…</DataLabel>
      ) : perfumes.length === 0 ? (
        <div className="text-center py-8 flex flex-col items-center gap-2">
          <DataLabel emphasis="high">EMPTY_STOCK</DataLabel>
          <p className="font-cormorant italic text-base opacity-70 max-w-sm">
            « Aucun parfum en stock. Ajoute le premier pour démarrer une newsletter. »
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {perfumes.map((p) => (
            <li
              key={p.id}
              className="flex items-start gap-3 px-4 py-3 border-2 border-on-background bg-background"
            >
              <div className="flex-1 min-w-0">
                <p className="font-sans font-bold uppercase tracking-tight truncate">
                  {p.name}
                  <span className="font-normal opacity-60 ml-2">— {p.brand}</span>
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {p.family && (
                    <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 border-2 border-on-background">
                      {p.family}
                    </span>
                  )}
                  {!p.in_stock && (
                    <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 bg-on-background text-background">
                      Rupture
                    </span>
                  )}
                  {p.price_eur && (
                    <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 border-2 border-on-background">
                      {p.price_eur} €
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditing(p)}
                aria-label="Modifier"
                className="opacity-60 hover:opacity-100 p-1 transition-opacity"
              >
                <Icon name="edit" size={20} />
              </button>
              <button
                type="button"
                onClick={() => remove(p.id)}
                aria-label="Supprimer"
                className="opacity-60 hover:opacity-100 p-1 transition-opacity"
              >
                <Icon name="delete" size={20} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <PerfumeEditor
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function PerfumeEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: ShopPerfume | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [family, setFamily] = useState(initial?.family ?? "");
  const [topNotes, setTopNotes] = useState((initial?.top_notes ?? []).join(", "));
  const [heartNotes, setHeartNotes] = useState((initial?.heart_notes ?? []).join(", "));
  const [baseNotes, setBaseNotes] = useState((initial?.base_notes ?? []).join(", "));
  const [accords, setAccords] = useState((initial?.accords ?? []).join(", "));
  const [description, setDescription] = useState(initial?.description ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? "");
  const [priceEur, setPriceEur] = useState(initial?.price_eur?.toString() ?? "");
  const [inStock, setInStock] = useState(initial?.in_stock ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim() || !brand.trim()) {
      setError("Nom et marque requis.");
      return;
    }
    setBusy(true);
    setError(null);
    const body = JSON.stringify({
      name,
      brand,
      family: family.trim() || null,
      topNotes: splitList(topNotes),
      heartNotes: splitList(heartNotes),
      baseNotes: splitList(baseNotes),
      accords: splitList(accords),
      description: description.trim() || null,
      imageUrl: imageUrl.trim() || null,
      priceEur: priceEur ? Number(priceEur) : null,
      inStock,
    });
    try {
      if (initial) {
        await authedFetch(`/api/perfumes/${initial.id}`, { method: "PATCH", body });
      } else {
        await authedFetch("/api/perfumes", { method: "POST", body });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-on-background/40 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-screen-md bg-background border-t-2 border-on-background p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between mb-4 pl-4 relative">
          <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
          <div>
            <DataLabel>{initial ? "EDIT_MODE" : "NEW_PERFUME"}</DataLabel>
            <h2 className="font-sans font-black text-2xl tracking-tighter uppercase mt-1">
              {initial ? "Modifier" : "Nouveau"}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="opacity-60 hover:opacity-100">
            <Icon name="close" />
          </button>
        </header>

        <div className="flex flex-col gap-3">
          <Field label="NOM">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Field>
          <Field label="MARQUE">
            <input value={brand} onChange={(e) => setBrand(e.target.value)} className={inputCls} />
          </Field>
          <Field label="FAMILLE OLFACTIVE">
            <input
              value={family}
              onChange={(e) => setFamily(e.target.value)}
              placeholder="Boisé, Floral, Oriental…"
              className={inputCls}
            />
          </Field>
          <Field label="NOTES DE TÊTE (VIRGULES)">
            <input value={topNotes} onChange={(e) => setTopNotes(e.target.value)} className={inputCls} />
          </Field>
          <Field label="NOTES DE CŒUR (VIRGULES)">
            <input value={heartNotes} onChange={(e) => setHeartNotes(e.target.value)} className={inputCls} />
          </Field>
          <Field label="NOTES DE FOND (VIRGULES)">
            <input value={baseNotes} onChange={(e) => setBaseNotes(e.target.value)} className={inputCls} />
          </Field>
          <Field label="ACCORDS (VIRGULES)">
            <input value={accords} onChange={(e) => setAccords(e.target.value)} className={inputCls} />
          </Field>
          <Field label="DESCRIPTION">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={inputCls}
            />
          </Field>
          <Field label="IMAGE URL">
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className={inputCls} />
          </Field>
          <Field label="PRIX (€)">
            <input
              type="number"
              inputMode="decimal"
              value={priceEur}
              onChange={(e) => setPriceEur(e.target.value)}
              className={inputCls}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={inStock}
              onChange={(e) => setInStock(e.target.checked)}
              className="w-4 h-4 accent-on-background"
            />
            <span className="font-mono text-xs uppercase tracking-widest">EN STOCK</span>
          </label>

          {error && (
            <div className="border-2 border-on-background bg-on-background text-background px-3 py-2">
              <p className="font-mono text-xs uppercase tracking-wider">{error}</p>
            </div>
          )}

          <BrutalistButton onClick={save} disabled={busy} size="lg" className="w-full">
            {busy ? "Enregistrement…" : "Enregistrer"}
          </BrutalistButton>
        </div>
      </div>
    </div>
  );
}

function splitList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

const inputCls =
  "w-full px-3 py-2.5 bg-background border-2 border-on-background font-mono text-sm focus:outline-none focus:shadow-[4px_4px_0px_0px_currentColor] placeholder:opacity-40 transition-shadow";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <DataLabel emphasis="high">{label}</DataLabel>
      {children}
    </label>
  );
}
