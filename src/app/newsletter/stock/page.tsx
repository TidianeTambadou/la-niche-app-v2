"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useRequireAuth } from "@/lib/auth";
import { useShopRole } from "@/lib/role";
import { authedFetch } from "@/lib/api-client";
import type { ShopPerfume } from "@/lib/types";

export default function PerfumeStockPage() {
  useRequireAuth();
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
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Stock parfums</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/newsletter/stock/import"
            className="flex items-center gap-1 px-3 py-2 border border-outline-variant rounded-full text-xs font-bold uppercase tracking-widest"
          >
            <Icon name="upload_file" size={16} />
            Import CSV
          </Link>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="flex items-center gap-1 px-3 py-2 bg-primary text-on-primary rounded-full text-xs font-bold uppercase tracking-widest"
          >
            <Icon name="add" size={16} />
            Nouveau
          </button>
        </div>
      </header>

      {error && (
        <p className="text-sm text-error border border-error/30 bg-error-container/30 px-4 py-3 rounded-xl">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-on-surface-variant">Chargement…</p>
      ) : perfumes.length === 0 ? (
        <p className="text-sm text-on-surface-variant text-center py-8">
          Aucun parfum en stock. Ajoute le premier pour démarrer une newsletter.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {perfumes.map((p) => (
            <li
              key={p.id}
              className="flex items-start gap-3 px-4 py-3 border border-outline-variant rounded-2xl"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">
                  {p.name}{" "}
                  <span className="font-normal text-on-surface-variant">— {p.brand}</span>
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {p.family && (
                    <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 border border-outline-variant rounded-full">
                      {p.family}
                    </span>
                  )}
                  {!p.in_stock && (
                    <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 bg-error-container/40 text-error rounded-full">
                      Rupture
                    </span>
                  )}
                  {p.price_eur && (
                    <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 border border-outline-variant rounded-full">
                      {p.price_eur} €
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditing(p)}
                aria-label="Modifier"
                className="text-on-surface-variant hover:text-primary p-1"
              >
                <Icon name="edit" size={20} />
              </button>
              <button
                type="button"
                onClick={() => remove(p.id)}
                aria-label="Supprimer"
                className="text-on-surface-variant hover:text-error p-1"
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
      className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-screen-md bg-surface rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{initial ? "Modifier" : "Nouveau parfum"}</h2>
          <button onClick={onClose} aria-label="Fermer" className="text-outline">
            <Icon name="close" />
          </button>
        </header>

        <div className="flex flex-col gap-3">
          <Field label="Nom">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Marque">
            <input value={brand} onChange={(e) => setBrand(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Famille olfactive">
            <input
              value={family}
              onChange={(e) => setFamily(e.target.value)}
              placeholder="Boisé, Floral, Oriental…"
              className={inputCls}
            />
          </Field>
          <Field label="Notes de tête (virgules)">
            <input value={topNotes} onChange={(e) => setTopNotes(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Notes de cœur (virgules)">
            <input value={heartNotes} onChange={(e) => setHeartNotes(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Notes de fond (virgules)">
            <input value={baseNotes} onChange={(e) => setBaseNotes(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Accords (virgules)">
            <input value={accords} onChange={(e) => setAccords(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={inputCls}
            />
          </Field>
          <Field label="Image URL">
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Prix (€)">
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
            />
            En stock
          </label>

          {error && <p className="text-sm text-error">{error}</p>}

          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="w-full py-3 bg-primary text-on-primary rounded-full text-sm font-bold uppercase tracking-widest disabled:opacity-50"
          >
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
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
  "w-full px-3 py-2 bg-surface-container rounded-xl border border-outline-variant text-sm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-widest text-outline">{label}</span>
      {children}
    </label>
  );
}
