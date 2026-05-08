"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useRequireAuth } from "@/lib/auth";
import { useShopRole } from "@/lib/role";
import { useGuardOutOfService } from "@/lib/service-mode";
import { authedFetch } from "@/lib/api-client";
import { DataLabel } from "@/components/brutalist/DataLabel";
import { BrutalistButton } from "@/components/brutalist/BrutalistButton";

type ImportResult = {
  total: number;
  imported: number;
  skipped: { row: number; reason: string }[];
  errors: { name: string; brand: string; reason: string }[];
};

export default function PerfumeImportPage() {
  useRequireAuth();
  useGuardOutOfService();
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
      <header className="relative pl-6">
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
        <DataLabel>BULK_IMPORT · CSV</DataLabel>
        <div className="flex items-end justify-between gap-3 mt-2">
          <h1 className="font-sans font-black text-3xl tracking-tighter uppercase leading-none">
            IMPORT
            <br />
            <span className="ml-4">CSV</span>
          </h1>
          <Link
            href="/newsletter/stock"
            className="font-mono text-xs uppercase tracking-widest font-bold border-b-2 border-on-background hover:opacity-60 transition-opacity"
          >
            STOCK →
          </Link>
        </div>
      </header>

      <section className="flex flex-col gap-3 border-2 border-on-background bg-background p-4 text-sm leading-relaxed">
        <DataLabel emphasis="high">FORMAT_SPEC</DataLabel>
        <p className="opacity-80">
          Première ligne = en-tête. Colonnes minimum : <code className="font-mono px-1 bg-on-background/10">name</code> et{" "}
          <code className="font-mono px-1 bg-on-background/10">brand</code>. Optionnelles :{" "}
          <code className="font-mono px-1 bg-on-background/10">price</code>,{" "}
          <code className="font-mono px-1 bg-on-background/10">description</code>. L'IA corrige les fautes et enrichit chaque ligne avec famille,
          notes (tête / cœur / fond), accords et description.
        </p>
        <pre className="text-xs border-2 border-on-background bg-background p-3 overflow-x-auto font-mono">
{`name,brand,price
Black Orchid,Tom Ford,180
By the Fireplace,Maison Margiela,135
Tobacco Vanille,Tom Ford,300`}
        </pre>
      </section>

      <section className="flex flex-col gap-3">
        <label className="flex flex-col gap-2">
          <DataLabel emphasis="high">FICHIER CSV</DataLabel>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="font-mono text-sm file:mr-3 file:py-2 file:px-3 file:border-2 file:border-on-background file:bg-background hover:file:bg-on-background hover:file:text-background file:text-xs file:font-bold file:uppercase file:tracking-widest file:cursor-pointer file:transition-colors file:duration-150"
          />
        </label>

        <details className="border-2 border-on-background bg-background px-4 py-3">
          <summary className="cursor-pointer">
            <DataLabel emphasis="high">OU COLLE DIRECTEMENT</DataLabel>
          </summary>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={10}
            placeholder="name,brand,price&#10;Black Orchid,Tom Ford,180"
            className="mt-3 w-full px-3 py-2 bg-background border-2 border-on-background text-xs font-mono focus:outline-none focus:shadow-[4px_4px_0px_0px_currentColor] transition-shadow"
          />
        </details>

        {csv && (
          <DataLabel emphasis="high">
            {String(dataLines).padStart(3, "0")} PARFUM{dataLines > 1 ? "S" : ""} DÉTECTÉ
            {dataLines > 1 ? "S" : ""}
          </DataLabel>
        )}
      </section>

      {error && (
        <div className="border-2 border-on-background bg-on-background text-background px-4 py-3">
          <p className="font-mono text-xs uppercase tracking-wider">{error}</p>
        </div>
      )}

      {result && (
        <section className="border-2 border-on-background bg-background p-4 flex flex-col gap-3 shadow-[4px_4px_0px_0px_currentColor]">
          <DataLabel emphasis="high">
            {String(result.imported).padStart(3, "0")}/
            {String(result.total).padStart(3, "0")} IMPORTED
          </DataLabel>
          {result.skipped.length > 0 && (
            <div>
              <DataLabel emphasis="high">SKIPPED</DataLabel>
              <ul className="text-xs opacity-70 space-y-0.5 mt-1 font-mono">
                {result.skipped.map((s, i) => (
                  <li key={i}>
                    L{s.row} — {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.errors.length > 0 && (
            <div>
              <DataLabel emphasis="high">ERRORS</DataLabel>
              <ul className="text-xs opacity-70 space-y-0.5 mt-1 font-mono">
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
            className="self-start mt-2 font-mono text-xs uppercase tracking-widest font-bold border-b-2 border-on-background hover:opacity-60 transition-opacity"
          >
            VOIR LE STOCK →
          </Link>
        </section>
      )}

      {!result && (
        <BrutalistButton
          disabled={busy || !csv.trim()}
          onClick={submit}
          size="lg"
          className="w-full"
        >
          {busy ? (
            <>
              <Icon name="progress_activity" size={16} className="animate-spin" />
              L'IA enrichit…
            </>
          ) : (
            "Lancer l'import"
          )}
        </BrutalistButton>
      )}
    </div>
  );
}
