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

type Mode = "perfume" | "freeform";
type Channel = "email" | "sms" | "both";
type Count = number | "all";

type Recipient = {
  client_id: string;
  first_name: string;
  last_name: string;
  channel: "email" | "sms";
  score: number;
  reason: string;
};

type Preview = {
  perfume: ShopPerfume | null;
  audience: Recipient[];
  eligibleCount: number;
  totalClients: number;
  draft: { subject: string; body: string; sms: string };
  channel: Channel;
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
  const [channel, setChannel] = useState<Channel>("both");
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

  async function startScoring(perfume: ShopPerfume | null, n: Count, ch: Channel) {
    setError(null);
    setStep({ kind: "scoring", perfume, count: n });
    try {
      const json = await authedFetch<Preview>("/api/newsletter/preview", {
        method: "POST",
        body: JSON.stringify({
          perfumeId: perfume?.id ?? null,
          count: n,
          channel: ch,
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

  function reset() {
    setStep({ kind: "mode" });
    setCount(20);
    setChannel("both");
    setDraft({ subject: "", body: "", sms: "" });
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
          channel={channel}
          setChannel={setChannel}
          onCancel={() =>
            setStep(
              step.perfume ? { kind: "perfume" } : { kind: "mode" },
            )
          }
          onConfirm={() => startScoring(step.perfume, count, channel)}
        />
      )}

      {step.kind === "scoring" && (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3">
          <Icon name="progress_activity" size={48} className="text-primary animate-spin" />
          <p className="text-sm text-on-surface-variant text-center">
            {step.perfume
              ? `L'IA sélectionne ${step.count === "all" ? "toute ta base" : `les ${step.count} clients`} les plus alignés…`
              : `Récupération de ${step.count === "all" ? "toute la base" : `${step.count} clients`}…`}
          </p>
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
          <Icon name="send" size={48} className="text-primary animate-pulse" />
          <p className="text-sm text-on-surface-variant">
            Envoi en cours à {step.preview.audience.length} destinataires…
          </p>
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
      <p className="text-sm text-on-surface-variant">
        Choisis le type de campagne :
      </p>
      <button
        type="button"
        onClick={onPickPerfume}
        className="w-full text-left px-4 py-4 border border-outline-variant rounded-2xl hover:border-primary transition-colors flex items-start gap-3"
      >
        <Icon name="auto_awesome" className="mt-0.5 text-primary" />
        <div className="flex-1">
          <p className="text-base font-semibold">Par parfum</p>
          <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">
            Tu choisis un parfum dans ton stock. L'IA cible automatiquement
            les clients qui ont le profil olfactif compatible et écrit un
            message taillé pour chacun.
          </p>
        </div>
        <Icon name="chevron_right" className="text-outline mt-1" />
      </button>
      <button
        type="button"
        onClick={onPickFreeform}
        className="w-full text-left px-4 py-4 border border-outline-variant rounded-2xl hover:border-primary transition-colors flex items-start gap-3"
      >
        <Icon name="edit_note" className="mt-0.5 text-primary" />
        <div className="flex-1">
          <p className="text-base font-semibold">Message libre</p>
          <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">
            Annonce horaires d'été, soldes, événement… tu rédiges ce que
            tu veux et tu choisis l'audience (toute ta base ou un nombre
            précis).
          </p>
        </div>
        <Icon name="chevron_right" className="text-outline mt-1" />
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
        <p className="text-sm text-on-surface-variant">
          Aucun parfum en stock. Ajoute des parfums avant d'envoyer une newsletter.
        </p>
        <Link
          href="/newsletter/stock"
          className="px-4 py-2 bg-primary text-on-primary rounded-full text-xs font-bold uppercase tracking-widest"
        >
          Gérer le stock
        </Link>
        <button
          type="button"
          onClick={onBack}
          className="text-xs uppercase tracking-widest text-outline mt-2"
        >
          Retour
        </button>
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
      <button
        type="button"
        onClick={onBack}
        className="self-start text-xs uppercase tracking-widest text-outline mt-2"
      >
        ← Retour
      </button>
    </section>
  );
}

/* ─── Audience config (count + channel) ──────────────────────────── */

function ConfigStep({
  perfume,
  count,
  setCount,
  channel,
  setChannel,
  onCancel,
  onConfirm,
}: {
  perfume: ShopPerfume | null;
  count: Count;
  setCount: (c: Count) => void;
  channel: Channel;
  setChannel: (c: Channel) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const presets: number[] = [10, 20, 50, 100];
  const isAll = count === "all";

  return (
    <section className="flex flex-col gap-4">
      {perfume ? (
        <div className="border border-outline-variant rounded-2xl p-4">
          <p className="font-semibold">{perfume.name}</p>
          <p className="text-xs text-on-surface-variant">{perfume.brand}</p>
        </div>
      ) : (
        <div className="border border-outline-variant rounded-2xl p-4 flex items-center gap-2">
          <Icon name="edit_note" className="text-primary" />
          <p className="text-sm font-semibold">Message libre</p>
        </div>
      )}

      {/* Audience size */}
      <div>
        <p className="text-xs uppercase tracking-widest text-outline mb-2">
          Audience
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
          <button
            type="button"
            onClick={() => setCount("all")}
            className={`px-4 py-2 border rounded-full text-sm flex items-center gap-1 ${
              isAll
                ? "border-primary bg-primary-container/50 font-semibold"
                : "border-outline-variant"
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
            className="w-full px-3 py-2 bg-surface-container rounded-xl border border-outline-variant text-sm"
          />
        )}
      </div>

      {/* Channel */}
      <div>
        <p className="text-xs uppercase tracking-widest text-outline mb-2">
          Canal d'envoi
        </p>
        <div className="grid grid-cols-3 gap-2">
          {([
            { v: "email", label: "Email", icon: "mail" },
            { v: "sms", label: "SMS", icon: "sms" },
            { v: "both", label: "Préférence du client", icon: "diversity_3" },
          ] as { v: Channel; label: string; icon: string }[]).map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setChannel(opt.v)}
              className={`px-3 py-2 border rounded-xl text-xs flex flex-col items-center gap-1 ${
                channel === opt.v
                  ? "border-primary bg-primary-container/50 font-semibold"
                  : "border-outline-variant"
              }`}
            >
              <Icon name={opt.icon} size={18} />
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-outline mt-1.5 leading-snug">
          {channel === "email" &&
            "Email uniquement — les clients sans email seront ignorés."}
          {channel === "sms" &&
            "SMS uniquement — les clients sans téléphone seront ignorés."}
          {channel === "both" &&
            "Chaque client reçoit selon son canal préféré (email ou SMS)."}
        </p>
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
          {perfume ? "Calculer le panel" : "Voir l'audience"}
        </button>
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
        <p className="font-semibold">
          {preview.perfume ? preview.perfume.name : "Message libre"}
        </p>
        <p className="text-xs text-on-surface-variant">
          {preview.audience.length} destinataires retenus sur {preview.totalClients} clients
          {(emailCount > 0 || smsCount > 0) && (
            <>
              {" "}({emailCount} email · {smsCount} sms)
            </>
          )}
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
                    {a.channel}
                    {preview.perfume && ` · ${a.score}`}
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

      {(preview.channel === "email" || preview.channel === "both") && (
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
      )}

      {(preview.channel === "sms" || preview.channel === "both") && (
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
      )}

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
