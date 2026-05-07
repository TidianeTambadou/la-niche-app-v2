"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useRequireAuth } from "@/lib/auth";
import { useShopRole } from "@/lib/role";
import { authedFetch } from "@/lib/api-client";
import { timeAgo } from "@/lib/time";
import type { BoutiqueClient, CommChannel } from "@/lib/types";

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

type ReportShape = {
  summary?: string;
  recommended_directions?: string[];
  avoid_pitch?: string;
  coaching_notes?: string;
};

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  useRequireAuth();
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
    return <div className="p-6 text-sm text-on-surface-variant">Chargement…</div>;
  }
  if (!client) {
    return (
      <div className="p-6 text-sm text-error">
        {error ?? "Fiche introuvable."}
      </div>
    );
  }

  const profile = (client.olfactive_profile ?? {}) as ProfileShape;
  const report = (client.report ?? {}) as ReportShape;

  return (
    <div className="px-6 py-6 flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {client.first_name} {client.last_name}
          </h1>
          <span
            className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-full font-medium ${
              client.source === "in_shop"
                ? "bg-primary-container/50 text-on-primary-container"
                : "bg-tertiary-container/50 text-on-tertiary-container"
            }`}
          >
            {client.source === "in_shop" ? "Boutique" : "Compte"}
          </span>
        </div>
        <p className="text-xs text-on-surface-variant">
          Ajouté {timeAgo(client.created_at)}
          {client.updated_at !== client.created_at &&
            ` · modifié ${timeAgo(client.updated_at)}`}
        </p>
      </header>

      {error && (
        <p className="text-sm text-error border border-error/30 bg-error-container/30 px-4 py-3 rounded-xl">
          {error}
        </p>
      )}

      {/* Olfactive profile */}
      {profile.dominant_families && (
        <Section title="Profil olfactif">
          {profile.personality && (
            <p className="text-sm italic leading-relaxed">{profile.personality}</p>
          )}
          {profile.dominant_families.length > 0 && (
            <ChipRow label="Familles" values={profile.dominant_families} />
          )}
          {profile.dominant_accords && profile.dominant_accords.length > 0 && (
            <ChipRow label="Accords" values={profile.dominant_accords} />
          )}
          {profile.key_notes && profile.key_notes.length > 0 && (
            <ChipRow label="Notes aimées" values={profile.key_notes} variant="positive" />
          )}
          {profile.avoid_notes && profile.avoid_notes.length > 0 && (
            <ChipRow label="Notes à éviter" values={profile.avoid_notes} variant="negative" />
          )}
          {profile.intensity_label && (
            <p className="text-xs text-on-surface-variant">
              Sillage : <span className="font-medium">{profile.intensity_label}</span>
              {profile.intensity_score && ` (${profile.intensity_score}/5)`}
            </p>
          )}
          {profile.wear_context && profile.wear_context.length > 0 && (
            <ChipRow label="Occasions" values={profile.wear_context} />
          )}
        </Section>
      )}

      {/* Sales report */}
      {(report.summary || report.recommended_directions?.length) && (
        <Section title="Pour le vendeur">
          {report.summary && <p className="text-sm leading-relaxed">{report.summary}</p>}
          {report.recommended_directions && report.recommended_directions.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-outline mb-1">
                Pistes à proposer
              </p>
              <ul className="list-disc list-inside text-sm leading-relaxed space-y-1">
                {report.recommended_directions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          {report.avoid_pitch && (
            <p className="text-sm leading-relaxed">
              <span className="text-xs uppercase tracking-widest text-outline">À éviter — </span>
              {report.avoid_pitch}
            </p>
          )}
          {report.coaching_notes && (
            <p className="text-sm leading-relaxed text-on-surface-variant">
              {report.coaching_notes}
            </p>
          )}
        </Section>
      )}

      {/* Contact + comm prefs */}
      <Section title="Contact" right={
        editing ? null : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs uppercase tracking-widest font-medium text-primary border-b border-primary"
          >
            Modifier
          </button>
        )
      }>
        {editing ? (
          <div className="flex flex-col gap-3">
            <input
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
              placeholder="Email"
              className="px-3 py-2 bg-surface-container rounded-xl border border-outline-variant text-sm"
            />
            <input
              value={draft.phone}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
              placeholder="Téléphone"
              className="px-3 py-2 bg-surface-container rounded-xl border border-outline-variant text-sm"
            />
            <div className="grid grid-cols-3 gap-2">
              {(["email", "sms", "both"] as CommChannel[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, preferredChannel: c }))}
                  className={`px-3 py-2 border rounded-full text-xs uppercase tracking-widest ${
                    draft.preferredChannel === c
                      ? "border-primary bg-primary-container/50 font-semibold"
                      : "border-outline-variant"
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
                className="mt-0.5"
              />
              Consent marketing
            </label>
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              placeholder="Notes libres"
              rows={3}
              className="px-3 py-2 bg-surface-container rounded-xl border border-outline-variant text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="flex-1 py-2 border border-outline-variant rounded-full text-xs uppercase tracking-widest"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={save}
                className="flex-1 py-2 bg-primary text-on-primary rounded-full text-xs font-bold uppercase tracking-widest disabled:opacity-50"
              >
                Enregistrer
              </button>
            </div>
          </div>
        ) : (
          <div className="text-sm flex flex-col gap-1">
            {client.email && <p>📧 {client.email}</p>}
            {client.phone && <p>📞 {client.phone}</p>}
            <p className="text-xs uppercase tracking-widest text-outline mt-1">
              Canal : {client.preferred_channel === "both" ? "email + sms" : client.preferred_channel}
              {!client.consent_marketing && " · pas de newsletter"}
            </p>
            {client.notes && (
              <p className="mt-2 text-sm border-l-2 border-outline-variant pl-3 italic">
                {client.notes}
              </p>
            )}
          </div>
        )}
      </Section>

      {/* Raw answers */}
      {Object.keys(client.quiz_answers).length > 0 && (
        <Section title="Réponses">
          <ul className="text-xs text-on-surface-variant flex flex-col gap-1 font-mono">
            {Object.entries(client.quiz_answers).map(([k, v]) => (
              <li key={k}>
                <span className="text-outline">{k.slice(0, 8)}…</span>{" "}
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
        className="self-start text-xs uppercase tracking-widest font-bold text-error border-b border-error pb-px disabled:opacity-50"
      >
        Supprimer la fiche
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
    <section className="flex flex-col gap-3 border border-outline-variant rounded-3xl px-5 py-4">
      <header className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-widest text-outline">{title}</h2>
        {right}
      </header>
      {children}
    </section>
  );
}

function ChipRow({
  label,
  values,
  variant = "neutral",
}: {
  label: string;
  values: string[];
  variant?: "neutral" | "positive" | "negative";
}) {
  const cls =
    variant === "positive"
      ? "border-primary/40 bg-primary-container/40"
      : variant === "negative"
        ? "border-error/40 bg-error-container/30"
        : "border-outline-variant";
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-outline mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className={`text-[11px] px-2 py-0.5 border rounded-full ${cls}`}
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}
