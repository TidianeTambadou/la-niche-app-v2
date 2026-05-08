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
import { DataLabel } from "@/components/brutalist/DataLabel";

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
        <header className="relative pl-6">
          <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
          <DataLabel>KIOSK_MODE · IN_SERVICE</DataLabel>
          <h1 className="font-sans font-black text-3xl tracking-tighter uppercase leading-none mt-2">
            MES CLIENTS
          </h1>
          <p className="font-cormorant italic text-base opacity-70 mt-3">
            « Mode boutique actif — détails masqués pendant les heures d'ouverture. »
          </p>
        </header>

        <Link
          href="/pour-un-client"
          className="self-start inline-flex items-center gap-2 px-5 py-2.5 bg-on-background text-background border-2 border-on-background shadow-[4px_4px_0px_0px_currentColor] hover:shadow-[2px_2px_0px_0px_currentColor] hover:translate-x-[2px] hover:translate-y-[2px] text-xs font-bold uppercase tracking-widest transition-all duration-150"
        >
          <Icon name="add" size={16} />
          Ajouter
        </Link>

        {loading ? (
          <DataLabel>LOADING…</DataLabel>
        ) : clients.length === 0 ? (
          <DataLabel className="text-center py-8 block">
            EMPTY · NO_CLIENT_YET
          </DataLabel>
        ) : (
          <ul className="flex flex-col">
            {clients.map((c, i) => (
              <li
                key={c.id}
                className={`flex items-center justify-between gap-3 px-4 py-3 border-2 border-on-background ${
                  i > 0 ? "border-t-0" : ""
                }`}
              >
                <span className="font-medium truncate">
                  {c.first_name} {c.last_name.charAt(0).toUpperCase()}.
                </span>
                <DataLabel>{timeAgo(c.created_at)}</DataLabel>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="px-6 py-6 flex flex-col gap-5">
      <header className="relative pl-6">
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
        <DataLabel>CRM · CLIENT_INDEX</DataLabel>
        <div className="flex items-end justify-between gap-3 mt-2">
          <h1 className="font-sans font-black text-3xl tracking-tighter uppercase leading-none">
            MES
            <br />
            <span className="ml-4">CLIENTS</span>
          </h1>
          <Link
            href="/pour-un-client"
            className="inline-flex items-center gap-1 px-4 py-2 bg-on-background text-background border-2 border-on-background shadow-[4px_4px_0px_0px_currentColor] hover:shadow-[2px_2px_0px_0px_currentColor] hover:translate-x-[2px] hover:translate-y-[2px] text-[11px] font-bold uppercase tracking-widest transition-all duration-150"
          >
            <Icon name="add" size={14} />
            Ajouter
          </Link>
        </div>
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
          placeholder="RECHERCHER (NOM, PRÉNOM, EMAIL)…"
          className="w-full px-4 py-3 bg-background border-2 border-on-background font-mono text-xs uppercase tracking-wider focus:outline-none focus:shadow-[4px_4px_0px_0px_currentColor] placeholder:opacity-40 transition-shadow"
        />
        <div className="flex gap-2">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as "" | ClientSource)}
            className="flex-1 px-3 py-2.5 bg-background border-2 border-on-background font-mono text-xs uppercase tracking-wider focus:outline-none focus:shadow-[4px_4px_0px_0px_currentColor] transition-shadow"
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
            className="flex-1 px-3 py-2.5 bg-background border-2 border-on-background font-mono text-xs uppercase tracking-wider focus:outline-none focus:shadow-[4px_4px_0px_0px_currentColor] transition-shadow"
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
              className="px-3 py-2.5 border-2 border-on-background hover:bg-on-background hover:text-background font-mono text-xs uppercase tracking-widest flex items-center gap-1 transition-colors duration-150"
            >
              <Icon name="close" size={14} />
              Date
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="border-2 border-on-background bg-on-background text-background px-4 py-3">
          <p className="font-mono text-xs uppercase tracking-wider">{error}</p>
        </div>
      )}

      {/* List */}
      <section className="flex flex-col gap-2">
        <DataLabel emphasis="high">
          {visible.length} CLIENT{visible.length > 1 ? "S" : ""}
          {selectedDate && ` · ${selectedDate.toLocaleDateString("fr")}`}
        </DataLabel>
        {loading ? (
          <DataLabel>LOADING…</DataLabel>
        ) : visible.length === 0 ? (
          <DataLabel className="text-center py-8 block">EMPTY</DataLabel>
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
    <div className="border-2 border-on-background bg-background px-2 py-3 shadow-[4px_4px_0px_0px_currentColor]">
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
      className="flex items-start gap-3 px-4 py-3 border-2 border-on-background bg-background hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[4px_4px_0px_0px_currentColor] active:translate-x-0 active:translate-y-0 active:shadow-none transition-all duration-150"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-sans font-bold uppercase tracking-tight truncate">
            {client.first_name} {client.last_name}
          </p>
          <SourceBadge source={client.source} />
        </div>
        <div className="flex items-center gap-2 mt-1">
          <DataLabel>{timeAgo(client.created_at)}</DataLabel>
          <span className="opacity-40">·</span>
          <DataLabel>
            {client.preferred_channel === "both" ? "EMAIL+SMS" : client.preferred_channel.toUpperCase()}
          </DataLabel>
        </div>
        {families.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {families.map((f) => (
              <span
                key={f}
                className="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 border-2 border-on-background"
              >
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
      <Icon name="chevron_right" className="opacity-40 mt-1" />
    </Link>
  );
}

function SourceBadge({ source }: { source: ClientSource }) {
  const isInShop = source === "in_shop";
  return (
    <span
      className={`font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border ${
        isInShop
          ? "bg-on-background text-background border-on-background"
          : "bg-background text-on-background border-on-background"
      }`}
      title={isInShop ? "Rempli en boutique" : "Rempli depuis le compte user"}
    >
      {isInShop ? "BOUTIQUE" : "COMPTE"}
    </span>
  );
}
