"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ErrorBubble } from "@/components/ErrorBubble";
import { useAuth } from "@/lib/auth";
import { useIsBoutiqueAccount } from "@/lib/data";
import { supabase } from "@/lib/supabase";

/**
 * /boutique/clients — liste + recherche des fiches clients de la boutique
 * connectée. Réservé aux comptes boutique (shops.id = auth.uid()).
 *
 * Chaque ligne pointe vers /boutique/clients/[id] pour voir le rapport
 * complet, l'ADN olfactif et les parfums swipés.
 */

type ClientRow = {
  id: string;
  first_name: string;
  last_name: string;
  created_at: string;
  updated_at: string;
  dna: { dominant_accords?: string[]; key_notes?: string[] } | null;
  report: { summary?: string } | null;
  notes: string | null;
};

export default function BoutiqueClientsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const isBoutique = useIsBoutiqueAccount();

  const [search, setSearch] = useState("");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auth gate : redirige si l'utilisateur n'est pas connecté ou n'est pas
  // une boutique. Le drawer cache déjà ce lien aux non-boutiques mais on
  // protège quand même la route en accès direct.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login?redirect=/boutique/clients");
      return;
    }
    if (!isBoutique) router.replace("/");
  }, [authLoading, user, isBoutique, router]);

  // Recherche debouncée — 300 ms après la dernière touche.
  useEffect(() => {
    if (authLoading || !user || !isBoutique) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) throw new Error("Session expirée");
        const url = new URL("/api/boutique/clients", window.location.origin);
        if (search.trim()) url.searchParams.set("search", search.trim());
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        const payload = (await res.json()) as { clients: ClientRow[] };
        setClients(payload.clients);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, authLoading, user, isBoutique]);

  return (
    <div className="px-6 pt-4 pb-24">
      <header className="mb-6">
        <p className="text-[10px] uppercase tracking-[0.3em] text-outline mb-2">
          Console boutique
        </p>
        <h1 className="text-4xl font-bold tracking-tighter leading-none">
          Mes clients
        </h1>
        <p className="text-sm text-on-surface-variant mt-3 max-w-md leading-relaxed">
          Toutes les fiches générées via « Pour un client ». Recherche par
          prénom ou nom.
        </p>
      </header>

      <div className="flex items-center gap-3 border-b-2 border-primary pb-3 mb-6">
        <Icon name="search" size={18} className="text-outline" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un client (Sarah, Dupont…)"
          className="flex-1 bg-transparent border-none outline-none text-base font-light placeholder:text-outline/60 py-1"
          autoComplete="off"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Effacer"
            className="text-outline hover:text-on-background"
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {error && (
        <div className="mb-6">
          <ErrorBubble
            detail={error}
            context="Mes clients"
            variant="block"
          />
        </div>
      )}

      {loading && clients.length === 0 ? (
        <ul className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <li
              key={i}
              className="h-20 bg-surface-container-low animate-pulse"
            />
          ))}
        </ul>
      ) : clients.length === 0 ? (
        <EmptyState hasSearch={search.trim().length > 0} />
      ) : (
        <ul className="flex flex-col">
          {clients.map((c) => (
            <ClientRowItem key={c.id} client={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ClientRowItem({ client }: { client: ClientRow }) {
  const accord = client.dna?.dominant_accords?.[0];
  const date = new Date(client.created_at).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return (
    <li className="border-b border-outline-variant/30 last:border-0">
      <Link
        href={`/boutique/clients/${client.id}`}
        className="flex items-center gap-3 py-4 group"
      >
        <div className="w-12 h-12 flex-shrink-0 bg-surface-container-low border border-outline-variant flex items-center justify-center">
          <Icon
            name="badge"
            size={20}
            className="text-on-surface-variant"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-outline">
            {date}
            {accord ? ` · ${accord}` : ""}
          </p>
          <h3 className="text-base font-semibold tracking-tight truncate group-hover:text-primary transition-colors">
            {client.first_name} {client.last_name}
          </h3>
          {client.report?.summary && (
            <p className="text-[12px] text-on-surface-variant mt-0.5 truncate">
              {client.report.summary}
            </p>
          )}
        </div>
        <Icon
          name="arrow_forward"
          size={16}
          className="text-outline flex-shrink-0"
        />
      </Link>
    </li>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <section className="border border-outline-variant bg-surface-container-low p-8 text-center flex flex-col items-center gap-4">
      <Icon
        name="contact_page"
        size={32}
        className="text-on-surface-variant"
      />
      <div>
        <p className="text-sm font-semibold tracking-tight">
          {hasSearch ? "Aucun client trouvé." : "Aucune fiche pour l'instant."}
        </p>
        <p className="text-xs text-on-surface-variant mt-1.5 max-w-xs leading-relaxed">
          {hasSearch
            ? "Essaie un autre prénom ou nom."
            : "Lance une session « Pour un client » depuis Recommandations — la fiche apparaîtra ici."}
        </p>
      </div>
      {!hasSearch && (
        <Link
          href="/recommendations"
          className="px-5 py-2.5 bg-primary text-on-primary rounded-full text-[10px] uppercase tracking-widest font-bold active:scale-95 transition-transform flex items-center gap-2"
        >
          <Icon name="add" size={14} />
          Nouvelle fiche
        </Link>
      )}
    </section>
  );
}
