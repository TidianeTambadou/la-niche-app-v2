"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { useRouter } from "next/navigation";
import { ClientReport } from "@/components/ClientReport";
import { useRequireAuth } from "@/lib/auth";
import { useShopRole } from "@/lib/role";
import { useGuardOutOfService } from "@/lib/service-mode";
import { authedFetch } from "@/lib/api-client";
import { timeAgo } from "@/lib/time";
import type { BoutiqueClient, CommChannel } from "@/lib/types";
import { DataLabel } from "@/components/brutalist/DataLabel";
import { BrutalistButton } from "@/components/brutalist/BrutalistButton";

type ProfileShape = {
  dominant_families?: string[];
  dominant_accords?: string[];
  key_notes?: string[];
  avoid_notes?: string[];
  personality?: string;
  intensity_label?: string;
  intensity_score?: number;
  wear_context?: string[];
};

type PerfumeRef = {
  brand?: string;
  name?: string;
  family?: string;
  why?: string;
};

type ReportShape = {
  summary?: string;
  signature?: string;
  loved_references?: PerfumeRef[];
  rejected_references?: PerfumeRef[];
  sales_advice?: string;
};

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  useRequireAuth();
  useGuardOutOfService("/clients");
  const router = useRouter();
  const { isBoutique, loading: roleLoading } = useShopRole();
  const [client, setClient] = useState<BoutiqueClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{
    email: string;
    phone: string;
    preferredChannel: CommChannel;
    consentMarketing: boolean;
    notes: string;
  }>({ email: "", phone: "", preferredChannel: "email", consentMarketing: false, notes: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!roleLoading && !isBoutique) router.replace("/");
  }, [isBoutique, roleLoading, router]);

  useEffect(() => {
    if (!isBoutique) return;
    (async () => {
      try {
        const json = await authedFetch<{ client: BoutiqueClient }>(`/api/clients/${id}`);
        setClient(json.client);
        setDraft({
          email: json.client.email ?? "",
          phone: json.client.phone ?? "",
          preferredChannel: json.client.preferred_channel,
          consentMarketing: json.client.consent_marketing,
          notes: json.client.notes ?? "",
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isBoutique]);

  async function save() {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      const json = await authedFetch<{ client: BoutiqueClient }>(`/api/clients/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          email: draft.email || null,
          phone: draft.phone || null,
          preferredChannel: draft.preferredChannel,
          consentMarketing: draft.consentMarketing,
          notes: draft.notes,
        }),
      });
      setClient(json.client);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    if (!confirm("Supprimer définitivement cette fiche ?")) return;
    setBusy(true);
    try {
      await authedFetch(`/api/clients/${id}`, { method: "DELETE" });
      router.replace("/clients");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <DataLabel>LOADING…</DataLabel>
      </div>
    );
  }
  if (!client) {
    return (
      <div className="p-6">
        <DataLabel emphasis="high">{error ? `ERROR · ${error}` : "NOT_FOUND"}</DataLabel>
      </div>
    );
  }

  const profile = (client.olfactive_profile ?? {}) as ProfileShape;
  const report = (client.report ?? {}) as ReportShape;

  return (
    <div className="px-6 py-6 flex flex-col gap-6">
      <header className="relative pl-6">
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
        <div className="flex items-center gap-2">
          <DataLabel>CLIENT · ID:{client.id.slice(0, 8)}</DataLabel>
          <span
            className={`font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border-2 ${
              client.source === "in_shop"
                ? "bg-on-background text-background border-on-background"
                : "bg-background text-on-background border-on-background"
            }`}
          >
            {client.source === "in_shop" ? "BOUTIQUE" : "COMPTE"}
          </span>
        </div>
        <h1 className="font-sans font-black text-3xl tracking-tighter uppercase leading-none mt-2">
          {client.first_name}
          <br />
          <span className="ml-4">{client.last_name}</span>
        </h1>
        <p className="font-mono text-xs uppercase tracking-wider opacity-60 mt-3">
          AJOUTÉ {timeAgo(client.created_at).toUpperCase()}
          {client.updated_at !== client.created_at &&
            ` · MAJ ${timeAgo(client.updated_at).toUpperCase()}`}
        </p>
      </header>

      {error && (
        <div className="border-2 border-on-background bg-on-background text-background px-4 py-3">
          <p className="font-mono text-xs uppercase tracking-wider">{error}</p>
        </div>
      )}

      <ClientReport profile={profile} report={report} />

      {/* Contact + comm prefs */}
      <Section title="CONTACT" right={
        editing ? null : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="font-mono text-xs uppercase tracking-widest font-bold border-b-2 border-on-background hover:opacity-60 transition-opacity"
          >
            MODIFIER
          </button>
        )
      }>
        {editing ? (
          <div className="flex flex-col gap-3">
            <input
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
              placeholder="Email"
              className="px-3 py-2.5 bg-background border-2 border-on-background font-mono text-sm focus:outline-none focus:shadow-[4px_4px_0px_0px_currentColor] placeholder:opacity-40 transition-shadow"
            />
            <input
              value={draft.phone}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
              placeholder="Téléphone"
              className="px-3 py-2.5 bg-background border-2 border-on-background font-mono text-sm focus:outline-none focus:shadow-[4px_4px_0px_0px_currentColor] placeholder:opacity-40 transition-shadow"
            />
            <div className="grid grid-cols-3 gap-2">
              {(["email", "sms", "both"] as CommChannel[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, preferredChannel: c }))}
                  className={`px-3 py-2.5 border-2 font-mono text-[11px] uppercase tracking-widest transition-colors duration-150 ${
                    draft.preferredChannel === c
                      ? "border-on-background bg-on-background text-background font-bold"
                      : "border-on-background bg-background hover:bg-on-background/5"
                  }`}
                >
                  {c === "both" ? "Les deux" : c.toUpperCase()}
                </button>
              ))}
            </div>
            <label className="flex items-start gap-2 text-sm leading-snug">
              <input
                type="checkbox"
                checked={draft.consentMarketing}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, consentMarketing: e.target.checked }))
                }
                className="mt-1 w-4 h-4 accent-on-background"
              />
              <span className="font-mono text-xs uppercase tracking-widest">CONSENT MARKETING</span>
            </label>
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              placeholder="Notes libres"
              rows={3}
              className="px-3 py-2.5 bg-background border-2 border-on-background text-sm focus:outline-none focus:shadow-[4px_4px_0px_0px_currentColor] placeholder:opacity-40 transition-shadow"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="flex-1 py-2.5 border-2 border-on-background bg-background hover:bg-on-background hover:text-background font-mono text-xs font-bold uppercase tracking-widest transition-colors duration-150"
              >
                Annuler
              </button>
              <BrutalistButton onClick={save} disabled={busy} size="md" className="flex-1">
                Enregistrer
              </BrutalistButton>
            </div>
          </div>
        ) : (
          <div className="text-sm flex flex-col gap-1">
            {client.email && <p className="font-mono">📧 {client.email}</p>}
            {client.phone && <p className="font-mono">📞 {client.phone}</p>}
            <DataLabel className="block mt-2">
              CANAL : {client.preferred_channel === "both" ? "EMAIL + SMS" : client.preferred_channel.toUpperCase()}
              {!client.consent_marketing && " · NO_NEWSLETTER"}
            </DataLabel>
            {client.notes && (
              <p className="font-cormorant italic text-base mt-3 border-l-2 border-on-background pl-3 opacity-80">
                « {client.notes} »
              </p>
            )}
          </div>
        )}
      </Section>

      {/* Raw answers */}
      {Object.keys(client.quiz_answers).length > 0 && (
        <Section title="RÉPONSES">
          <ul className="text-xs flex flex-col gap-1 font-mono">
            {Object.entries(client.quiz_answers).map(([k, v]) => (
              <li key={k}>
                <span className="opacity-50">{k.slice(0, 8)}…</span>{" "}
                <span>
                  {Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <button
        type="button"
        onClick={destroy}
        disabled={busy}
        className="self-start font-mono text-xs uppercase tracking-widest font-bold border-b-2 border-on-background pb-px disabled:opacity-50 hover:opacity-60 transition-opacity"
      >
        SUPPRIMER LA FICHE
      </button>
    </div>
  );
}

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border-2 border-on-background bg-background px-5 py-4">
      <header className="flex items-center justify-between">
        <DataLabel emphasis="high">{title}</DataLabel>
        {right}
      </header>
      {children}
    </section>
  );
}

