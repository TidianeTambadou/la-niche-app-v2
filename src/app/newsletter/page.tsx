"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { NewsletterRedraftSheet } from "@/components/NewsletterRedraftSheet";
import { useRequireAuth } from "@/lib/auth";
import { useShopRole } from "@/lib/role";
import { useGuardOutOfService } from "@/lib/service-mode";
import { authedFetch } from "@/lib/api-client";
import type { ShopPerfume } from "@/lib/types";

type Recipient = {
  client_id: string;
  first_name: string;
  last_name: string;
  channel: "email" | "sms";
  score: number;
  reason: string;
};

type Preview = {
  perfume: ShopPerfume;
  audience: Recipient[];
  eligibleCount: number;
  totalClients: number;
  draft: { subject: string; body: string; sms: string };
};

type Step =
  | { kind: "pick" }
  | { kind: "size"; perfume: ShopPerfume }
  | { kind: "scoring"; perfume: ShopPerfume; count: number }
  | { kind: "preview"; preview: Preview }
  | { kind: "sending"; preview: Preview }
  | { kind: "done"; sent: number; failed: number; total: number };

export default function NewsletterPage() {
  useRequireAuth();
  useGuardOutOfService();
  const router = useRouter();
  const { isBoutique, loading: roleLoading } = useShopRole();
  const [perfumes, setPerfumes] = useState<ShopPerfume[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [count, setCount] = useState(20);
  const [draft, setDraft] = useState({ subject: "", body: "", sms: "" });

  useEffect(() => {
    if (!roleLoading && !isBoutique) router.replace("/");
  }, [isBoutique, roleLoading, router]);

  useEffect(() => {
    if (!isBoutique) return;
    (async () => {
      try {
        const json = await authedFetch<{ perfumes: ShopPerfume[] }>("/api/perfumes");
        setPerfumes(json.perfumes.filter((p) => p.in_stock));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      } finally {
        setLoading(false);
      }
    })();
  }, [isBoutique]);

  async function startScoring(perfume: ShopPerfume, n: number) {
    setError(null);
    setStep({ kind: "scoring", perfume, count: n });
    try {
      const json = await authedFetch<Preview>("/api/newsletter/preview", {
        method: "POST",
        body: JSON.stringify({ perfumeId: perfume.id, count: n }),
      });
      setDraft(json.draft);
      setStep({ kind: "preview", preview: json });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setStep({ kind: "size", perfume });
    }
  }

  async function send(preview: Preview) {
    setError(null);
    setStep({ kind: "sending", preview });
    try {
      const json = await authedFetch<{ sent: number; failed: number; total: number }>(
        "/api/newsletter/send",
        {
          method: "POST",
          body: JSON.stringify({
            perfumeId: preview.perfume.id,
            recipients: preview.audience,
            subject: draft.subject,
            body: draft.body,
            sms: draft.sms,
          }),
        },
      );
      setStep({ kind: "done", ...json });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setStep({ kind: "preview", preview });
    }
  }

  if (loading || roleLoading) {
    return <div className="p-6 text-sm text-on-surface-variant">Chargement…</div>;
  }

  return (
    <div className="px-6 py-6 flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Newsletter</h1>
        <Link
          href="/newsletter/stock"
          className="text-xs uppercase tracking-widest font-medium text-primary border-b border-primary"
        >
          Stock
        </Link>
      </header>

      {error && (
        <p className="text-sm text-error border border-error/30 bg-error-container/30 px-4 py-3 rounded-xl">
          {error}
        </p>
      )}

      {step.kind === "pick" && (
        <PickPerfume
          perfumes={perfumes}
          onPick={(p) => setStep({ kind: "size", perfume: p })}
        />
      )}

      {step.kind === "size" && (
        <SizeStep
          perfume={step.perfume}
          count={count}
          setCount={setCount}
          onCancel={() => setStep({ kind: "pick" })}
          onConfirm={() => startScoring(step.perfume, count)}
        />
      )}

      {step.kind === "scoring" && (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3">
          <Icon name="progress_activity" size={48} className="text-primary animate-spin" />
          <p className="text-sm text-on-surface-variant">
            L'IA sélectionne les {step.count} clients les plus alignés…
          </p>
        </div>
      )}

      {step.kind === "preview" && (
        <PreviewStep
          preview={step.preview}
          draft={draft}
          setDraft={setDraft}
          onCancel={() => setStep({ kind: "pick" })}
          onSend={() => send(step.preview)}
        />
      )}

      {step.kind === "sending" && (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3">
          <Icon name="send" size={48} className="text-primary animate-pulse" />
          <p className="text-sm text-on-surface-variant">
            Envoi en cours à {step.preview.audience.length} destinataires…
          </p>
        </div>
      )}

      {step.kind === "done" && (
        <DoneStep result={step} onRestart={() => setStep({ kind: "pick" })} />
      )}
    </div>
  );
}

/* ─── Step components ─────────────────────────────────────────── */

function PickPerfume({
  perfumes,
  onPick,
}: {
  perfumes: ShopPerfume[];
  onPick: (p: ShopPerfume) => void;
}) {
  if (perfumes.length === 0) {
    return (
      <div className="flex flex-col items-center text-center gap-3 py-8">
        <p className="text-sm text-on-surface-variant">
          Aucun parfum en stock. Ajoute des parfums avant d'envoyer une newsletter.
        </p>
        <Link
          href="/newsletter/stock"
          className="px-4 py-2 bg-primary text-on-primary rounded-full text-xs font-bold uppercase tracking-widest"
        >
          Gérer le stock
        </Link>
      </div>
    );
  }
  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-on-surface-variant">
        Choisis un parfum à mettre en avant. L'IA sélectionnera les clients les
        plus susceptibles de l'aimer.
      </p>
      <ul className="flex flex-col gap-2">
        {perfumes.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onPick(p)}
              className="w-full flex items-start justify-between gap-3 px-4 py-3 border border-outline-variant rounded-2xl hover:border-primary text-left transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{p.name}</p>
                <p className="text-xs text-on-surface-variant truncate">
                  {p.brand} {p.family && `· ${p.family}`}
                </p>
              </div>
              <Icon name="chevron_right" className="text-outline mt-1" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SizeStep({
  perfume,
  count,
  setCount,
  onCancel,
  onConfirm,
}: {
  perfume: ShopPerfume;
  count: number;
  setCount: (n: number) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const presets = [10, 20, 50, 100];
  return (
    <section className="flex flex-col gap-4">
      <div className="border border-outline-variant rounded-2xl p-4">
        <p className="font-semibold">{perfume.name}</p>
        <p className="text-xs text-on-surface-variant">{perfume.brand}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-widest text-outline mb-2">
          Nombre de destinataires
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {presets.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCount(n)}
              className={`px-4 py-2 border rounded-full text-sm ${
                count === n
                  ? "border-primary bg-primary-container/50 font-semibold"
                  : "border-outline-variant"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <input
          type="number"
          min={1}
          max={500}
          value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
          className="w-full px-3 py-2 bg-surface-container rounded-xl border border-outline-variant text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-3 border border-outline-variant rounded-full text-sm font-medium uppercase tracking-widest"
        >
          Retour
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 py-3 bg-primary text-on-primary rounded-full text-sm font-bold uppercase tracking-widest"
        >
          Calculer le panel
        </button>
      </div>
    </section>
  );
}

function PreviewStep({
  preview,
  draft,
  setDraft,
  onCancel,
  onSend,
}: {
  preview: Preview;
  draft: { subject: string; body: string; sms: string };
  setDraft: (d: { subject: string; body: string; sms: string }) => void;
  onCancel: () => void;
  onSend: () => void;
}) {
  const emailCount = preview.audience.filter((a) => a.channel === "email").length;
  const smsCount = preview.audience.filter((a) => a.channel === "sms").length;
  const [redraftOpen, setRedraftOpen] = useState(false);

  return (
    <section className="flex flex-col gap-4">
      <div className="border border-outline-variant rounded-2xl p-4 flex flex-col gap-1">
        <p className="font-semibold">{preview.perfume.name}</p>
        <p className="text-xs text-on-surface-variant">
          {preview.audience.length} destinataires retenus sur {preview.totalClients} clients
          ({emailCount} email · {smsCount} sms)
        </p>
      </div>

      <details className="border border-outline-variant rounded-2xl px-4 py-3" open>
        <summary className="cursor-pointer text-xs uppercase tracking-widest text-outline">
          Panel sélectionné
        </summary>
        <ul className="mt-3 flex flex-col gap-2 max-h-72 overflow-y-auto">
          {preview.audience.map((a) => (
            <li
              key={a.client_id}
              className="flex items-start gap-2 px-3 py-2 border border-outline-variant rounded-xl"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {a.first_name} {a.last_name}
                  <span className="ml-2 text-[9px] uppercase tracking-widest text-outline">
                    {a.channel} · {a.score}
                  </span>
                </p>
                {a.reason && (
                  <p className="text-xs text-on-surface-variant italic mt-0.5">{a.reason}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </details>

      <button
        type="button"
        onClick={() => setRedraftOpen(true)}
        className="self-start flex items-center gap-2 px-3 py-1.5 border border-primary/40 rounded-full text-xs font-bold uppercase tracking-widest text-primary hover:bg-primary-container/30"
      >
        <Icon name="auto_awesome" size={14} />
        Reformule avec l'IA
      </button>

      <details className="border border-outline-variant rounded-2xl px-4 py-3" open>
        <summary className="cursor-pointer text-xs uppercase tracking-widest text-outline">
          Email
        </summary>
        <div className="mt-3 flex flex-col gap-2">
          <input
            value={draft.subject}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
            placeholder="Objet"
            className="w-full px-3 py-2 bg-surface-container rounded-xl border border-outline-variant text-sm"
          />
          <textarea
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            rows={6}
            placeholder="Corps (utilise {{firstName}} pour personnaliser)"
            className="w-full px-3 py-2 bg-surface-container rounded-xl border border-outline-variant text-sm"
          />
        </div>
      </details>

      <details className="border border-outline-variant rounded-2xl px-4 py-3">
        <summary className="cursor-pointer text-xs uppercase tracking-widest text-outline">
          SMS
        </summary>
        <textarea
          value={draft.sms}
          onChange={(e) => setDraft({ ...draft, sms: e.target.value })}
          rows={3}
          placeholder="SMS court"
          className="w-full px-3 py-2 bg-surface-container rounded-xl border border-outline-variant text-sm mt-3"
        />
        <p className="text-[10px] text-outline mt-1">
          {draft.sms.length} caractères {draft.sms.length > 160 && "(deux SMS facturés)"}
        </p>
      </details>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-3 border border-outline-variant rounded-full text-sm font-medium uppercase tracking-widest"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={onSend}
          disabled={preview.audience.length === 0}
          className="flex-1 py-3 bg-primary text-on-primary rounded-full text-sm font-bold uppercase tracking-widest disabled:opacity-50"
        >
          Envoyer à {preview.audience.length}
        </button>
      </div>

      {redraftOpen && (
        <NewsletterRedraftSheet
          perfumeId={preview.perfume.id}
          current={draft}
          onClose={() => setRedraftOpen(false)}
          onApply={(next) => setDraft(next)}
        />
      )}
    </section>
  );
}

function DoneStep({
  result,
  onRestart,
}: {
  result: { sent: number; failed: number; total: number };
  onRestart: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-4 py-8">
      <Icon
        name={result.failed === 0 ? "check_circle" : "error"}
        size={64}
        className={result.failed === 0 ? "text-primary" : "text-error"}
      />
      <h2 className="text-2xl font-semibold">
        {result.sent} message{result.sent > 1 ? "s" : ""} envoyé{result.sent > 1 ? "s" : ""}
      </h2>
      {result.failed > 0 && (
        <p className="text-sm text-error">
          {result.failed} échec{result.failed > 1 ? "s" : ""} sur {result.total}
        </p>
      )}
      <button
        type="button"
        onClick={onRestart}
        className="px-5 py-3 bg-primary text-on-primary rounded-full text-sm font-bold uppercase tracking-widest"
      >
        Nouvelle campagne
      </button>
    </div>
  );
}
