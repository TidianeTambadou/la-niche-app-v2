"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { Icon } from "@/components/Icon";
import { useRequireAuth } from "@/lib/auth";
import { useShopRole } from "@/lib/role";
import { useShopMode } from "@/lib/service-mode";
import { authedFetch } from "@/lib/api-client";
import { timeAgo, isoDate } from "@/lib/time";
import type { CommChannel, ClientSource } from "@/lib/types";

type ClientRow = {
  id: string;
  source: ClientSource;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  preferred_channel: CommChannel;
  consent_marketing: boolean;
  olfactive_profile: { dominant_families?: string[]; personality?: string } | null;
  report: { summary?: string } | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const SOURCE_OPTS: { v: "" | ClientSource; label: string }[] = [
  { v: "", label: "Toutes sources" },
  { v: "in_shop", label: "En boutique" },
  { v: "user_account", label: "Depuis compte" },
];

const CHANNEL_OPTS: { v: "" | CommChannel; label: string }[] = [
  { v: "", label: "Tous canaux" },
  { v: "email", label: "Email" },
  { v: "sms", label: "SMS" },
  { v: "both", label: "Email + SMS" },
];

export default function ClientsPage() {
  useRequireAuth();
  const router = useRouter();
  const { isBoutique, loading: roleLoading } = useShopRole();
  const mode = useShopMode();
  const isKiosk = mode === "in_service";
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [source, setSource] = useState<"" | ClientSource>("");
  const [channel, setChannel] = useState<"" | CommChannel>("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    if (!roleLoading && !isBoutique) router.replace("/");
  }, [isBoutique, roleLoading, router]);

  useEffect(() => {
    if (!isBoutique) return;
    refresh();
  }, [isBoutique, source, channel]);

  // Debounce text search separately so the server isn't slammed.
  useEffect(() => {
    if (!isBoutique) return;
    const t = setTimeout(refresh, 300);
    return () => clearTimeout(t);
  }, [search]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/clients", window.location.origin);
      if (search.trim()) url.searchParams.set("search", search.trim());
      if (source) url.searchParams.set("source", source);
      if (channel) url.searchParams.set("channel", channel);
      const json = await authedFetch<{ clients: ClientRow[] }>(url.pathname + url.search);
      setClients(json.clients);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  // Group clients by ISO date for both the calendar dots and the day list.
  const byDate = useMemo(() => {
    const map = new Map<string, ClientRow[]>();
    for (const c of clients) {
      const d = isoDate(c.created_at);
      const arr = map.get(d) ?? [];
      arr.push(c);
      map.set(d, arr);
    }
    return map;
  }, [clients]);

  const datesWithClients = useMemo(
    () => Array.from(byDate.keys()).map((d) => new Date(d)),
    [byDate],
  );

  const visible = useMemo(() => {
    if (!selectedDate) return clients;
    const key = isoDate(selectedDate);
    return byDate.get(key) ?? [];
  }, [clients, byDate, selectedDate]);

  // ─── Kiosk view (in_service) — minimal info, no contact / no profile.
  // Active when the boutique is in open hours so a client manipulating the
  // device only sees harmless rows : prénom + dernière visite, rien d'autre.
  if (isKiosk) {
    return (
      <div className="px-6 py-6 flex flex-col gap-5">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Mes clients</h1>
          <Link
            href="/pour-un-client"
            className="flex items-center gap-1 px-3 py-2 bg-primary text-on-primary rounded-full text-xs font-bold uppercase tracking-widest"
          >
            <Icon name="add" size={16} />
            Ajouter
          </Link>
        </header>

        <p className="text-xs text-outline leading-relaxed">
          Mode boutique actif — détails complets cachés pendant les heures d'ouverture.
        </p>

        {loading ? (
          <p className="text-sm text-on-surface-variant">Chargement…</p>
        ) : clients.length === 0 ? (
          <p className="text-sm text-on-surface-variant text-center py-8">
            Aucun client pour l'instant.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {clients.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 px-4 py-3 border border-outline-variant rounded-2xl"
              >
                <span className="font-medium truncate">
                  {c.first_name} {c.last_name.charAt(0).toUpperCase()}.
                </span>
                <span className="text-xs text-on-surface-variant flex-shrink-0">
                  {timeAgo(c.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="px-6 py-6 flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Mes clients</h1>
        <Link
          href="/pour-un-client"
          className="flex items-center gap-1 px-3 py-2 bg-primary text-on-primary rounded-full text-xs font-bold uppercase tracking-widest"
        >
          <Icon name="add" size={16} />
          Ajouter
        </Link>
      </header>

      <CalendarBlock
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
        datesWithClients={datesWithClients}
        countByDate={(d) => byDate.get(isoDate(d))?.length ?? 0}
      />

      {/* Filters */}
      <div className="flex flex-col gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher (nom, prénom, email)…"
          className="w-full px-4 py-2.5 bg-surface-container rounded-full border border-outline-variant text-sm"
        />
        <div className="flex gap-2">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as "" | ClientSource)}
            className="flex-1 px-3 py-2 bg-surface-container rounded-full border border-outline-variant text-xs"
          >
            {SOURCE_OPTS.map((o) => (
              <option key={o.v} value={o.v}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as "" | CommChannel)}
            className="flex-1 px-3 py-2 bg-surface-container rounded-full border border-outline-variant text-xs"
          >
            {CHANNEL_OPTS.map((o) => (
              <option key={o.v} value={o.v}>
                {o.label}
              </option>
            ))}
          </select>
          {selectedDate && (
            <button
              type="button"
              onClick={() => setSelectedDate(undefined)}
              className="px-3 py-2 border border-outline-variant rounded-full text-xs flex items-center gap-1"
            >
              <Icon name="close" size={14} />
              Date
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-error border border-error/30 bg-error-container/30 px-4 py-3 rounded-xl">
          {error}
        </p>
      )}

      {/* List */}
      <section className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-widest text-outline">
          {visible.length} client{visible.length > 1 ? "s" : ""}
          {selectedDate && ` · ${selectedDate.toLocaleDateString("fr")}`}
        </p>
        {loading ? (
          <p className="text-sm text-on-surface-variant">Chargement…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-on-surface-variant text-center py-8">
            Aucun client à afficher.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((c) => (
              <li key={c.id}>
                <ClientCard client={c} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CalendarBlock({
  selectedDate,
  onSelect,
  datesWithClients,
}: {
  selectedDate: Date | undefined;
  onSelect: (d: Date | undefined) => void;
  datesWithClients: Date[];
  countByDate: (d: Date) => number;
}) {
  return (
    <div className="border border-outline-variant rounded-3xl px-2 py-3">
      <DayPicker
        mode="single"
        selected={selectedDate}
        onSelect={onSelect}
        weekStartsOn={1}
        modifiers={{ hasClient: datesWithClients }}
        modifiersClassNames={{
          hasClient: "rdp-day-has-client",
        }}
        showOutsideDays
      />
    </div>
  );
}

function ClientCard({ client }: { client: ClientRow }) {
  const families = client.olfactive_profile?.dominant_families?.slice(0, 2) ?? [];
  return (
    <Link
      href={`/clients/${client.id}`}
      className="flex items-start gap-3 px-4 py-3 border border-outline-variant rounded-2xl active:scale-[0.99] transition-transform"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold truncate">
            {client.first_name} {client.last_name}
          </p>
          <SourceBadge source={client.source} />
        </div>
        <div className="flex items-center gap-2 text-xs text-on-surface-variant mt-0.5">
          <span>{timeAgo(client.created_at)}</span>
          <span>·</span>
          <span className="uppercase tracking-widest">
            {client.preferred_channel === "both" ? "Email+SMS" : client.preferred_channel}
          </span>
        </div>
        {families.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {families.map((f) => (
              <span
                key={f}
                className="text-[10px] uppercase tracking-widest px-2 py-0.5 border border-outline-variant rounded-full"
              >
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
      <Icon name="chevron_right" className="text-outline mt-1" />
    </Link>
  );
}

function SourceBadge({ source }: { source: ClientSource }) {
  const isInShop = source === "in_shop";
  return (
    <span
      className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-full font-medium ${
        isInShop
          ? "bg-primary-container/50 text-on-primary-container"
          : "bg-tertiary-container/50 text-on-tertiary-container"
      }`}
      title={isInShop ? "Rempli en boutique" : "Rempli depuis le compte user"}
    >
      {isInShop ? "Boutique" : "Compte"}
    </span>
  );
}
