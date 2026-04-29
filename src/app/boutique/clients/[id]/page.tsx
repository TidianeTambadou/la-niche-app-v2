"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ErrorBubble } from "@/components/ErrorBubble";
import { useAuth } from "@/lib/auth";
import { useIsBoutiqueAccount } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import type {
  FriendReport,
  OlfactiveDNA,
  RecommendationCandidate,
} from "@/lib/agent";

/**
 * /boutique/clients/[id] — fiche client complète : ADN olfactif, parfums
 * matchés / rejetés, rapport vendeur, et notes libres éditables.
 */

type ClientFull = {
  id: string;
  shop_id: string;
  first_name: string;
  last_name: string;
  created_at: string;
  updated_at: string;
  quiz_answers: Record<string, unknown>;
  dna: OlfactiveDNA | null;
  matched_cards: RecommendationCandidate[];
  disliked_cards: RecommendationCandidate[];
  report: FriendReport | null;
  notes: string | null;
};

export default function BoutiqueClientDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { user, loading: authLoading } = useAuth();
  const isBoutique = useIsBoutiqueAccount();

  const [client, setClient] = useState<ClientFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?redirect=/boutique/clients/${id ?? ""}`);
      return;
    }
    if (!isBoutique) router.replace("/");
  }, [authLoading, user, isBoutique, router, id]);

  useEffect(() => {
    if (!id || authLoading || !user || !isBoutique) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) throw new Error("Session expirée");
        const res = await fetch(`/api/boutique/clients/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        const payload = (await res.json()) as { client: ClientFull };
        if (cancelled) return;
        setClient(payload.client);
        setNotesDraft(payload.client.notes ?? "");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Erreur");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, authLoading, user, isBoutique]);

  async function saveNotes() {
    if (!id) return;
    setSavingNotes(true);
    setNotesSaved(false);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Session expirée");
      const res = await fetch(`/api/boutique/clients/${id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notes: notesDraft }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setNotesSaved(true);
      window.setTimeout(() => setNotesSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingNotes(false);
    }
  }

  async function deleteClient() {
    if (!id || !client) return;
    if (
      !confirm(
        `Supprimer la fiche de ${client.first_name} ${client.last_name} ?`,
      )
    ) {
      return;
    }
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Session expirée");
      const res = await fetch(`/api/boutique/clients/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.replace("/boutique/clients");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  if (loading) {
    return (
      <div className="px-6 pt-4 pb-24">
        <div className="h-6 w-48 bg-surface-container-low animate-pulse mb-4" />
        <div className="h-12 w-72 bg-surface-container-low animate-pulse mb-6" />
        <div className="h-32 bg-surface-container-low animate-pulse" />
      </div>
    );
  }

  if (error && !client) {
    return (
      <div className="px-6 pt-8 pb-24">
        <ErrorBubble detail={error} context="Fiche client" variant="block" />
        <Link
          href="/boutique/clients"
          className="mt-6 inline-flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold border-b border-primary pb-0.5"
        >
          <Icon name="arrow_back" size={14} />
          Retour à la liste
        </Link>
      </div>
    );
  }

  if (!client) return null;

  const created = new Date(client.created_at).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="px-6 pt-4 pb-24 max-w-2xl mx-auto">
      <Link
        href="/boutique/clients"
        className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-outline hover:text-on-background mb-6"
      >
        <Icon name="arrow_back" size={14} />
        Mes clients
      </Link>

      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.3em] text-outline mb-2">
          Fiche · {created}
        </p>
        <h1 className="text-4xl font-bold tracking-tighter leading-none">
          {client.first_name} {client.last_name}
        </h1>
      </header>

      {/* DNA */}
      {client.dna && (
        <Section title="ADN olfactif" index="01">
          <div className="space-y-3">
            <DnaRow label="Accords dominants" items={client.dna.dominant_accords} />
            <DnaRow label="Notes clés" items={client.dna.key_notes} />
            <DnaRow label="Notes à éviter" items={client.dna.avoid_notes} />
            {client.dna.personality && (
              <p className="text-sm text-on-background mt-2 italic">
                « {client.dna.personality} »
              </p>
            )}
          </div>
        </Section>
      )}

      {/* Report */}
      {client.report && (
        <Section title="Rapport vendeur" index="02">
          {client.report.summary && (
            <p className="text-xl font-medium tracking-tight leading-snug mb-4">
              {client.report.summary}
            </p>
          )}
          {client.report.signature && (
            <p className="text-sm text-on-surface-variant leading-relaxed mb-4">
              {client.report.signature}
            </p>
          )}
          {client.report.sales_advice && (
            <div className="border-l-2 border-primary pl-3 py-1 mb-4">
              <p className="text-[10px] uppercase tracking-widest text-primary font-bold mb-1">
                Conseil de vente
              </p>
              <p className="text-sm leading-relaxed">
                {client.report.sales_advice}
              </p>
            </div>
          )}
        </Section>
      )}

      {/* Loved */}
      {client.matched_cards.length > 0 && (
        <Section title="Parfums aimés" index="03">
          <ul className="flex flex-col">
            {client.matched_cards.map((c, i) => (
              <CardRow key={`${c.brand}-${c.name}-${i}`} card={c} kind="liked" />
            ))}
          </ul>
        </Section>
      )}

      {/* Disliked */}
      {client.disliked_cards.length > 0 && (
        <Section title="Parfums rejetés" index="04">
          <ul className="flex flex-col">
            {client.disliked_cards.map((c, i) => (
              <CardRow
                key={`${c.brand}-${c.name}-${i}`}
                card={c}
                kind="disliked"
              />
            ))}
          </ul>
        </Section>
      )}

      {/* Notes */}
      <Section title="Notes vendeur" index="05">
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          placeholder="Ajoute des observations, un suivi à faire, le budget réel discuté…"
          rows={5}
          className="w-full bg-transparent border border-outline-variant focus:border-primary outline-none p-3 text-sm leading-relaxed resize-y"
        />
        <div className="flex items-center gap-3 mt-3">
          <button
            type="button"
            onClick={saveNotes}
            disabled={savingNotes}
            className="px-4 py-2 bg-primary text-on-primary rounded-full text-[10px] uppercase tracking-widest font-bold active:scale-95 transition-all disabled:opacity-40 flex items-center gap-2"
          >
            <Icon name="save" size={14} />
            {savingNotes ? "Sauvegarde…" : "Enregistrer"}
          </button>
          {notesSaved && (
            <span className="text-[10px] uppercase tracking-widest font-bold text-primary">
              ✓ Sauvegardé
            </span>
          )}
        </div>
      </Section>

      {error && (
        <div className="mt-6">
          <ErrorBubble detail={error} context="Fiche client" variant="block" />
        </div>
      )}

      <button
        type="button"
        onClick={deleteClient}
        className="mt-10 text-[10px] uppercase tracking-widest font-bold text-outline hover:text-error transition-colors flex items-center gap-2"
      >
        <Icon name="delete" size={14} />
        Supprimer cette fiche
      </button>
    </div>
  );
}

function Section({
  title,
  index,
  children,
}: {
  title: string;
  index: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-primary font-mono text-[11px]">{index}</span>
        <div className="h-px flex-1 bg-outline-variant" />
        <h2 className="text-[10px] uppercase font-bold tracking-widest">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function DnaRow({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-outline mb-1">
        {label}
      </p>
      <p className="text-sm">{items.join(", ")}</p>
    </div>
  );
}

function CardRow({
  card,
  kind,
}: {
  card: RecommendationCandidate;
  kind: "liked" | "disliked";
}) {
  return (
    <li className="py-3 border-b border-outline-variant/30 last:border-0">
      <div className="flex items-start gap-3">
        <div
          className={
            "w-10 h-10 flex-shrink-0 flex items-center justify-center text-on-primary " +
            (kind === "liked" ? "bg-primary" : "bg-on-surface-variant/40")
          }
        >
          <Icon
            name={kind === "liked" ? "favorite" : "close"}
            size={16}
            filled={kind === "liked"}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-outline">
            {card.brand}
            {card.family ? ` · ${card.family}` : ""}
          </p>
          <h4 className="text-sm font-semibold tracking-tight">{card.name}</h4>
          {card.reason && (
            <p className="text-[12px] text-on-surface-variant mt-1 leading-relaxed">
              {card.reason}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
