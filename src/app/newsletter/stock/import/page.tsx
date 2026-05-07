"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useRequireAuth } from "@/lib/auth";
import { useShopRole } from "@/lib/role";
import { authedFetch } from "@/lib/api-client";

type ImportResult = {
  total: number;
  imported: number;
  skipped: { row: number; reason: string }[];
  errors: { name: string; brand: string; reason: string }[];
};

export default function PerfumeImportPage() {
  useRequireAuth();
  const router = useRouter();
  const { isBoutique, loading: roleLoading } = useShopRole();
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  if (!roleLoading && !isBoutique) {
    router.replace("/");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsv(text);
  }

  async function submit() {
    if (!csv.trim()) {
      setError("Charge un CSV ou colle son contenu.");
      return;
    }
    setError(null);
    setBusy(true);
    setResult(null);
    try {
      const json = await authedFetch<ImportResult>("/api/perfumes/import", {
        method: "POST",
        body: JSON.stringify({ csv }),
      });
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  const lines = csv.trim().split(/\r?\n/).filter(Boolean).length;
  const dataLines = Math.max(0, lines - 1);

  return (
    <div className="px-6 py-6 flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Importer un CSV</h1>
        <Link
          href="/newsletter/stock"
          className="text-xs uppercase tracking-widest font-medium text-primary border-b border-primary"
        >
          Stock
        </Link>
      </header>

      <section className="flex flex-col gap-3 border border-outline-variant rounded-2xl p-4 text-sm leading-relaxed">
        <p className="font-semibold">Format attendu</p>
        <p className="text-on-surface-variant">
          Première ligne = en-tête. Colonnes minimum : <code>name</code> et{" "}
          <code>brand</code>. Optionnelles : <code>price</code>,{" "}
          <code>description</code>. L'IA corrige les fautes et enrichit chaque
          ligne avec famille, notes (tête / cœur / fond), accords et
          description.
        </p>
        <pre className="text-xs bg-surface-container rounded-xl p-3 overflow-x-auto font-mono">
{`name,brand,price
Black Orchid,Tom Ford,180
By the Fireplace,Maison Margiela,135
Tobacco Vanille,Tom Ford,300`}
        </pre>
      </section>

      <section className="flex flex-col gap-3">
        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-widest text-outline">
            Fichier CSV
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="text-sm file:mr-3 file:py-2 file:px-3 file:rounded-full file:border file:border-outline-variant file:bg-surface-container file:text-xs file:uppercase file:tracking-widest"
          />
        </label>

        <details className="border border-outline-variant rounded-2xl px-4 py-3">
          <summary className="cursor-pointer text-xs uppercase tracking-widest text-outline">
            Ou colle directement le contenu
          </summary>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={10}
            placeholder="name,brand,price&#10;Black Orchid,Tom Ford,180"
            className="mt-3 w-full px-3 py-2 bg-surface-container rounded-xl border border-outline-variant text-xs font-mono"
          />
        </details>

        {csv && (
          <p className="text-xs text-on-surface-variant">
            {dataLines} parfum{dataLines > 1 ? "s" : ""} détecté
            {dataLines > 1 ? "s" : ""} dans le CSV
          </p>
        )}
      </section>

      {error && (
        <p className="text-sm text-error border border-error/30 bg-error-container/30 px-4 py-3 rounded-xl">
          {error}
        </p>
      )}

      {result && (
        <section className="border border-outline-variant rounded-2xl p-4 flex flex-col gap-3">
          <p className="font-semibold">
            {result.imported} sur {result.total} parfums importés
          </p>
          {result.skipped.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-outline mb-1">
                Lignes ignorées
              </p>
              <ul className="text-xs text-on-surface-variant space-y-0.5">
                {result.skipped.map((s, i) => (
                  <li key={i}>
                    Ligne {s.row} — {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.errors.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-error mb-1">
                Erreurs IA / DB
              </p>
              <ul className="text-xs text-on-surface-variant space-y-0.5">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    {e.name} — {e.brand} : {e.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Link
            href="/newsletter/stock"
            className="self-start mt-2 text-xs uppercase tracking-widest font-bold text-primary border-b border-primary"
          >
            Voir le stock
          </Link>
        </section>
      )}

      {!result && (
        <button
          type="button"
          disabled={busy || !csv.trim()}
          onClick={submit}
          className="w-full py-3 bg-primary text-on-primary rounded-full text-sm font-bold uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? (
            <>
              <Icon name="progress_activity" size={16} className="animate-spin" />
              L'IA enrichit les parfums…
            </>
          ) : (
            "Lancer l'import"
          )}
        </button>
      )}
    </div>
  );
}
