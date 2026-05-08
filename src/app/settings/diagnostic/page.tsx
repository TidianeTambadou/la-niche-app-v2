"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useRequireAuth } from "@/lib/auth";
import { useShopRole } from "@/lib/role";
import { useGuardOutOfService } from "@/lib/service-mode";
import { authedFetch } from "@/lib/api-client";

type Diag = {
  has_openrouter_key: boolean;
  openrouter_key_prefix: string | null;
  openrouter_key_length: number;
  has_resend_key: boolean;
  node_env: string;
  test_status?: number;
  test_body?: string;
  test_error?: string;
};

export default function DiagnosticPage() {
  useRequireAuth();
  useGuardOutOfService("/pour-un-client", { bypassable: true });
  const router = useRouter();
  const { isBoutique, loading: roleLoading } = useShopRole();
  const [busy, setBusy] = useState(false);
  const [diag, setDiag] = useState<Diag | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!roleLoading && !isBoutique) router.replace("/");

  async function run() {
    setBusy(true);
    setError(null);
    setDiag(null);
    try {
      const res = await authedFetch<Diag>("/api/diagnostic");
      setDiag(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-6 py-6 flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Diagnostic IA</h1>
        <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
          Vérifie que les clés API (OpenRouter, Resend) sont bien configurées
          sur Vercel et que les requêtes IA partent vers le bon compte.
        </p>
      </header>

      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="w-full py-3 bg-primary text-on-primary rounded-full text-sm font-bold uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy ? (
          <>
            <Icon name="progress_activity" size={16} className="animate-spin" />
            Test en cours…
          </>
        ) : (
          "Lancer le diagnostic"
        )}
      </button>

      {error && (
        <p className="text-sm text-error border border-error/30 bg-error-container/30 px-4 py-3 rounded-xl">
          {error}
        </p>
      )}

      {diag && (
        <section className="flex flex-col gap-3">
          <Block
            label="OpenRouter clé présente"
            value={diag.has_openrouter_key ? "Oui" : "MANQUANTE"}
            ok={diag.has_openrouter_key}
          />
          {diag.openrouter_key_prefix && (
            <Block
              label="Préfixe clé"
              value={`${diag.openrouter_key_prefix}…  (${diag.openrouter_key_length} chars)`}
              ok
              hint="Compare avec ta clé sur openrouter.ai/settings/keys — si le préfixe ne correspond pas, c'est qu'une vieille clé d'un autre compte traîne dans Vercel."
            />
          )}
          {typeof diag.test_status === "number" && (
            <Block
              label="Test API"
              value={`HTTP ${diag.test_status}`}
              ok={diag.test_status === 200}
              hint={
                diag.test_status === 200
                  ? "La requête a abouti. Si tu ne la vois pas dans ton dashboard, ouvre celui qui correspond au prefix ci-dessus."
                  : diag.test_status === 401
                    ? "401 = clé invalide / révoquée."
                    : diag.test_status === 402
                      ? "402 = pas assez de crédits sur le compte qui détient cette clé."
                      : `Réponse inattendue.`
              }
            />
          )}
          {diag.test_error && (
            <Block label="Erreur réseau" value={diag.test_error} ok={false} />
          )}
          {diag.test_body && (
            <details className="border border-outline-variant rounded-2xl px-4 py-3 text-xs">
              <summary className="cursor-pointer text-on-surface-variant">
                Réponse brute OpenRouter
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[11px]">
                {diag.test_body}
              </pre>
            </details>
          )}
          <Block
            label="Resend (email)"
            value={diag.has_resend_key ? "Configuré" : "Manquant"}
            ok={diag.has_resend_key}
          />
        </section>
      )}
    </div>
  );
}

function Block({
  label,
  value,
  ok,
  hint,
}: {
  label: string;
  value: string;
  ok: boolean;
  hint?: string;
}) {
  return (
    <div
      className={`border rounded-2xl px-4 py-3 ${
        ok ? "border-outline-variant" : "border-error/40 bg-error-container/30"
      }`}
    >
      <p className="text-[10px] uppercase tracking-widest text-outline">{label}</p>
      <p
        className={`text-sm font-mono mt-0.5 break-all ${
          ok ? "" : "text-error font-semibold"
        }`}
      >
        {value}
      </p>
      {hint && (
        <p className="text-[11px] text-on-surface-variant leading-snug mt-1">
          {hint}
        </p>
      )}
    </div>
  );
}
