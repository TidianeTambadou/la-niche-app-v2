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
import { DataLabel } from "@/components/brutalist/DataLabel";
import { BrutalistButton } from "@/components/brutalist/BrutalistButton";

type Count = number | "all";

type Recipient = {
  client_id: string;
  first_name: string;
  last_name: string;
  score: number;
  reason: string;
};

type Preview = {
  perfume: ShopPerfume | null;
  audience: Recipient[];
  eligibleCount: number;
  totalClients: number;
  draft: { subject: string; body: string };
};

type Step =
  | { kind: "mode" }
  | { kind: "perfume" }
  | { kind: "config"; perfume: ShopPerfume | null }
  | { kind: "scoring"; perfume: ShopPerfume | null; count: Count }
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
  const [step, setStep] = useState<Step>({ kind: "mode" });
  const [count, setCount] = useState<Count>(20);
  const [draft, setDraft] = useState({ subject: "", body: "" });

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

  async function startScoring(perfume: ShopPerfume | null, n: Count) {
    setError(null);
    setStep({ kind: "scoring", perfume, count: n });
    try {
      const json = await authedFetch<Preview>("/api/newsletter/preview", {
        method: "POST",
        body: JSON.stringify({
          perfumeId: perfume?.id ?? null,
          count: n,
        }),
      });
      setDraft(json.draft);
      setStep({ kind: "preview", preview: json });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setStep({ kind: "config", perfume });
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
            perfumeId: preview.perfume?.id ?? null,
            recipients: preview.audience,
            subject: draft.subject,
            body: draft.body,
          }),
        },
      );
      setStep({ kind: "done", ...json });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setStep({ kind: "preview", preview });
    }
  }

  function reset() {
    setStep({ kind: "mode" });
    setCount(20);
    setDraft({ subject: "", body: "" });
  }

  if (loading || roleLoading) {
    return (
      <div className="p-6">
        <DataLabel>LOADING…</DataLabel>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 flex flex-col gap-5">
      <header className="relative pl-6">
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
        <DataLabel>CAMPAIGN_BUILDER</DataLabel>
        <div className="flex items-end justify-between gap-3 mt-2">
          <h1 className="font-sans font-black text-3xl tracking-tighter uppercase leading-none">
            NEWS-
            <br />
            <span className="ml-4">LETTER</span>
          </h1>
          <Link
            href="/newsletter/stock"
            className="font-mono text-xs uppercase tracking-widest font-bold border-b-2 border-on-background hover:opacity-60 transition-opacity"
          >
            STOCK →
          </Link>
        </div>
      </header>

      {error && (
        <div className="border-2 border-on-background bg-on-background text-background px-4 py-3">
          <p className="font-mono text-xs uppercase tracking-wider">{error}</p>
        </div>
      )}

      {step.kind === "mode" && (
        <ModeStep
          onPickPerfume={() => setStep({ kind: "perfume" })}
          onPickFreeform={() =>
            setStep({ kind: "config", perfume: null })
          }
        />
      )}

      {step.kind === "perfume" && (
        <PickPerfume
          perfumes={perfumes}
          onPick={(p) => setStep({ kind: "config", perfume: p })}
          onBack={() => setStep({ kind: "mode" })}
        />
      )}

      {step.kind === "config" && (
        <ConfigStep
          perfume={step.perfume}
          count={count}
          setCount={setCount}
          onCancel={() =>
            setStep(
              step.perfume ? { kind: "perfume" } : { kind: "mode" },
            )
          }
          onConfirm={() => startScoring(step.perfume, count)}
        />
      )}

      {step.kind === "scoring" && (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3">
          <Icon name="progress_activity" size={48} className="animate-spin" />
          <DataLabel emphasis="high" className="text-center">
            {step.perfume
              ? `IA · SCORING ${step.count === "all" ? "ALL_CLIENTS" : `${step.count}_CLIENTS`}…`
              : `FETCH ${step.count === "all" ? "ALL_CLIENTS" : `${step.count}_CLIENTS`}…`}
          </DataLabel>
        </div>
      )}

      {step.kind === "preview" && (
        <PreviewStep
          preview={step.preview}
          draft={draft}
          setDraft={setDraft}
          onCancel={reset}
          onSend={() => send(step.preview)}
        />
      )}

      {step.kind === "sending" && (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3">
          <Icon name="send" size={48} className="animate-pulse" />
          <DataLabel emphasis="high">
            SENDING · {step.preview.audience.length}_RECIPIENTS…
          </DataLabel>
        </div>
      )}

      {step.kind === "done" && (
        <DoneStep result={step} onRestart={reset} />
      )}
    </div>
  );
}

/* ─── Mode (par parfum / message libre) ─────────────────────────── */

function ModeStep({
  onPickPerfume,
  onPickFreeform,
}: {
  onPickPerfume: () => void;
  onPickFreeform: () => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <DataLabel emphasis="high">SELECT_MODE</DataLabel>
      <button
        type="button"
        onClick={onPickPerfume}
        className="w-full text-left px-4 py-4 border-2 border-on-background bg-background hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_currentColor] transition-all duration-150 flex items-start gap-3"
      >
        <Icon name="auto_awesome" className="mt-0.5" />
        <div className="flex-1">
          <p className="font-sans font-black text-base uppercase tracking-tight">
            Par parfum
          </p>
          <p className="text-xs opacity-70 mt-1 leading-relaxed">
            Tu choisis un parfum dans ton stock. L'IA cible automatiquement
            les clients au profil olfactif compatible et écrit un message
            taillé pour chacun.
          </p>
        </div>
        <Icon name="chevron_right" className="opacity-40 mt-1" />
      </button>
      <button
        type="button"
        onClick={onPickFreeform}
        className="w-full text-left px-4 py-4 border-2 border-on-background bg-background hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_currentColor] transition-all duration-150 flex items-start gap-3"
      >
        <Icon name="edit_note" className="mt-0.5" />
        <div className="flex-1">
          <p className="font-sans font-black text-base uppercase tracking-tight">
            Message libre
          </p>
          <p className="text-xs opacity-70 mt-1 leading-relaxed">
            Annonce horaires d'été, soldes, événement… tu rédiges ce que tu
            veux et tu choisis l'audience (toute ta base ou un nombre
            précis).
          </p>
        </div>
        <Icon name="chevron_right" className="opacity-40 mt-1" />
      </button>
    </section>
  );
}

/* ─── Perfume picker ─────────────────────────────────────────────── */

function PickPerfume({
  perfumes,
  onPick,
  onBack,
}: {
  perfumes: ShopPerfume[];
  onPick: (p: ShopPerfume) => void;
  onBack: () => void;
}) {
  if (perfumes.length === 0) {
    return (
      <div className="flex flex-col items-center text-center gap-3 py-8">
        <DataLabel emphasis="high">EMPTY_STOCK</DataLabel>
        <p className="text-sm opacity-70">
          Aucun parfum en stock. Ajoute des parfums avant d'envoyer une newsletter.
        </p>
        <BrutalistButton onClick={() => null} className="!px-5 !py-2">
          <Link href="/newsletter/stock">Gérer le stock</Link>
        </BrutalistButton>
        <button
          type="button"
          onClick={onBack}
          className="font-mono text-[10px] uppercase tracking-widest opacity-60 hover:opacity-100 mt-2"
        >
          ← RETOUR
        </button>
      </div>
    );
  }
  return (
    <section className="flex flex-col gap-3">
      <DataLabel emphasis="high">SELECT_PERFUME · {perfumes.length} ITEMS</DataLabel>
      <ul className="flex flex-col gap-2">
        {perfumes.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onPick(p)}
              className="w-full flex items-start justify-between gap-3 px-4 py-3 border-2 border-on-background bg-background hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[4px_4px_0px_0px_currentColor] text-left transition-all duration-150"
            >
              <div className="flex-1 min-w-0">
                <p className="font-sans font-bold uppercase tracking-tight truncate">
                  {p.name}
                </p>
                <p className="font-mono text-xs opacity-60 uppercase tracking-wider truncate mt-0.5">
                  {p.brand} {p.family && `· ${p.family}`}
                </p>
              </div>
              <Icon name="chevron_right" className="opacity-40 mt-1" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onBack}
        className="self-start font-mono text-[10px] uppercase tracking-widest opacity-60 hover:opacity-100 mt-2"
      >
        ← RETOUR
      </button>
    </section>
  );
}

/* ─── Audience config (count + channel) ──────────────────────────── */

function ConfigStep({
  perfume,
  count,
  setCount,
  onCancel,
  onConfirm,
}: {
  perfume: ShopPerfume | null;
  count: Count;
  setCount: (c: Count) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const presets: number[] = [10, 20, 50, 100];
  const isAll = count === "all";

  return (
    <section className="flex flex-col gap-4">
      {perfume ? (
        <div className="border-2 border-on-background bg-background p-4">
          <DataLabel>SELECTED_PERFUME</DataLabel>
          <p className="font-sans font-black uppercase tracking-tight mt-1">{perfume.name}</p>
          <p className="font-mono text-xs opacity-60 uppercase tracking-wider">{perfume.brand}</p>
        </div>
      ) : (
        <div className="border-2 border-on-background bg-background p-4 flex items-center gap-2">
          <Icon name="edit_note" />
          <p className="font-sans font-black uppercase tracking-tight">Message libre</p>
        </div>
      )}

      {/* Audience size */}
      <div>
        <DataLabel emphasis="high" className="mb-2 block">AUDIENCE</DataLabel>
        <div className="flex flex-wrap gap-2 mb-3">
          {presets.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCount(n)}
              className={`px-4 py-2 border-2 font-mono text-xs uppercase tracking-widest transition-colors duration-150 ${
                count === n
                  ? "border-on-background bg-on-background text-background font-bold"
                  : "border-on-background bg-background hover:bg-on-background/5"
              }`}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCount("all")}
            className={`px-4 py-2 border-2 font-mono text-xs uppercase tracking-widest flex items-center gap-1 transition-colors duration-150 ${
              isAll
                ? "border-on-background bg-on-background text-background font-bold"
                : "border-on-background bg-background hover:bg-on-background/5"
            }`}
          >
            <Icon name="groups" size={14} />
            Toute ma base
          </button>
        </div>
        {!isAll && (
          <input
            type="number"
            min={1}
            max={500}
            value={count}
            onChange={(e) =>
              setCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))
            }
            className="w-full px-3 py-2 bg-background border-2 border-on-background font-mono text-sm focus:outline-none focus:shadow-[4px_4px_0px_0px_currentColor] transition-shadow"
          />
        )}
      </div>

      <div className="border-2 border-on-background bg-background px-3 py-2 flex items-center gap-2">
        <Icon name="mail" size={16} />
        <p className="font-mono text-[10px] uppercase tracking-wider">
          EMAIL ONLY · CLIENTS SANS EMAIL IGNORÉS
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-3.5 border-2 border-on-background bg-background hover:bg-on-background hover:text-background text-sm font-bold uppercase tracking-widest transition-colors duration-150"
        >
          Retour
        </button>
        <BrutalistButton onClick={onConfirm} size="lg" className="flex-1">
          {perfume ? "Calculer le panel" : "Voir l'audience"}
        </BrutalistButton>
      </div>
    </section>
  );
}

/* ─── Preview + send ─────────────────────────────────────────────── */

function PreviewStep({
  preview,
  draft,
  setDraft,
  onCancel,
  onSend,
}: {
  preview: Preview;
  draft: { subject: string; body: string };
  setDraft: (d: { subject: string; body: string }) => void;
  onCancel: () => void;
  onSend: () => void;
}) {
  const [redraftOpen, setRedraftOpen] = useState(false);

  return (
    <section className="flex flex-col gap-4">
      <div className="border-2 border-on-background bg-background p-4 flex flex-col gap-1 shadow-[4px_4px_0px_0px_currentColor]">
        <DataLabel>PREVIEW</DataLabel>
        <p className="font-sans font-black uppercase tracking-tight mt-1">
          {preview.perfume ? preview.perfume.name : "Message libre"}
        </p>
        <p className="font-mono text-xs uppercase tracking-wider opacity-60 mt-1">
          {preview.audience.length}/{preview.totalClients} CLIENTS · EMAIL
        </p>
      </div>

      <details className="border-2 border-on-background bg-background px-4 py-3" open>
        <summary className="cursor-pointer">
          <DataLabel emphasis="high">PANEL_SELECTED</DataLabel>
        </summary>
        <ul className="mt-3 flex flex-col gap-2 max-h-72 overflow-y-auto">
          {preview.audience.map((a) => (
            <li
              key={a.client_id}
              className="flex items-start gap-2 px-3 py-2 border-2 border-on-background"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold uppercase tracking-tight">
                  {a.first_name} {a.last_name}
                  {preview.perfume && (
                    <span className="ml-2 font-mono text-[9px] uppercase tracking-widest opacity-60">
                      SCORE:{a.score}
                    </span>
                  )}
                </p>
                {a.reason && (
                  <p className="font-cormorant italic text-sm opacity-70 mt-0.5">
                    « {a.reason} »
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </details>

      <button
        type="button"
        onClick={() => setRedraftOpen(true)}
        className="self-start flex items-center gap-2 px-4 py-2 border-2 border-on-background bg-background hover:bg-on-background hover:text-background font-mono text-xs font-bold uppercase tracking-widest transition-colors duration-150"
      >
        <Icon name="auto_awesome" size={14} />
        Reformule IA
      </button>

      <details className="border-2 border-on-background bg-background px-4 py-3" open>
        <summary className="cursor-pointer">
          <DataLabel emphasis="high">EMAIL</DataLabel>
        </summary>
        <div className="mt-3 flex flex-col gap-2">
          <input
            value={draft.subject}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
            placeholder="Objet"
            className="w-full px-3 py-2.5 bg-background border-2 border-on-background font-mono text-sm focus:outline-none focus:shadow-[4px_4px_0px_0px_currentColor] placeholder:opacity-40 transition-shadow"
          />
          <textarea
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            rows={6}
            placeholder="Corps (utilise {{firstName}} pour personnaliser)"
            className="w-full px-3 py-2.5 bg-background border-2 border-on-background text-sm focus:outline-none focus:shadow-[4px_4px_0px_0px_currentColor] placeholder:opacity-40 transition-shadow"
          />
        </div>
      </details>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-3.5 border-2 border-on-background bg-background hover:bg-on-background hover:text-background text-sm font-bold uppercase tracking-widest transition-colors duration-150"
        >
          Annuler
        </button>
        <BrutalistButton
          onClick={onSend}
          disabled={preview.audience.length === 0}
          size="lg"
          className="flex-1"
        >
          Envoyer à {preview.audience.length}
        </BrutalistButton>
      </div>

      {redraftOpen && (
        <NewsletterRedraftSheet
          perfumeId={preview.perfume?.id ?? null}
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
    <div className="flex flex-col items-start gap-4 py-8 relative pl-6">
      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
      <DataLabel emphasis="high">
        {result.failed === 0 ? "SUCCESS" : "PARTIAL_SUCCESS"} ·
        {String(result.sent).padStart(3, "0")}/{String(result.total).padStart(3, "0")}
      </DataLabel>
      <h2 className="font-sans font-black text-4xl tracking-tighter uppercase leading-none">
        {result.sent}
        <br />
        <span className="ml-4">
          MESSAGE{result.sent > 1 ? "S" : ""}
        </span>
        <br />
        <span className="ml-8">ENVOYÉ{result.sent > 1 ? "S" : ""}</span>
      </h2>
      {result.failed > 0 && (
        <p className="font-mono text-xs uppercase tracking-wider border-2 border-on-background bg-on-background text-background px-3 py-2">
          {result.failed} ÉCHEC{result.failed > 1 ? "S" : ""}
        </p>
      )}
      <BrutalistButton onClick={onRestart} size="lg">
        Nouvelle campagne
      </BrutalistButton>
    </div>
  );
}
