"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { authedFetch } from "@/lib/api-client";

/**
 * Live search inside the boutique's own clients while the vendor types a
 * name. Helps avoid creating a duplicate fiche when a returning client comes
 * back ("Marie Dupont" already exists → click to open the existing fiche).
 *
 * Triggers only when both first and last name have ≥ 2 chars. Debounced
 * 300ms so we don't hammer the API on each keystroke. Hidden when nothing
 * matches.
 */

type Match = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  city: string | null;
  created_at: string;
};

type Props = {
  firstName: string;
  lastName: string;
};

export function ExistingClientSuggestions({ firstName, lastName }: Props) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);

  const f = firstName.trim();
  const l = lastName.trim();

  useEffect(() => {
    if (f.length < 2 || l.length < 2) {
      setMatches([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ search: `${f} ${l}`, limit: "5" });
        const json = await authedFetch<{
          clients: Match[];
        }>(`/api/clients?${params.toString()}`);
        // Server-side OR is on first_name OR last_name OR email — narrow
        // again here to require BOTH name parts so we don't show false
        // positives when only the first name half-matches.
        const fl = f.toLowerCase();
        const ll = l.toLowerCase();
        setMatches(
          json.clients.filter(
            (c) =>
              c.first_name.toLowerCase().includes(fl) &&
              c.last_name.toLowerCase().includes(ll),
          ),
        );
      } catch {
        setMatches([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [f, l]);

  if (f.length < 2 || l.length < 2) return null;
  if (!loading && matches.length === 0) return null;

  return (
    <div className="border border-outline-variant rounded-2xl px-4 py-3 bg-surface-container/40 flex flex-col gap-2">
      <p className="text-[11px] uppercase tracking-widest text-outline flex items-center gap-1.5">
        <Icon name="person_search" size={14} />
        {loading ? "Recherche…" : `${matches.length} fiche${matches.length > 1 ? "s" : ""} déjà existante${matches.length > 1 ? "s" : ""}`}
      </p>
      {matches.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {matches.map((m) => (
            <li key={m.id}>
              <Link
                href={`/clients/${m.id}`}
                className="flex items-center justify-between gap-2 px-3 py-2 border border-outline-variant rounded-xl bg-surface hover:border-primary transition-colors"
              >
                <span className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate">
                    {m.first_name} {m.last_name}
                  </span>
                  <span className="text-[11px] text-on-surface-variant truncate">
                    {m.email ?? "(pas d'email)"}
                    {m.city && ` · ${m.city}`}
                  </span>
                </span>
                <Icon name="chevron_right" size={16} className="text-outline" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {matches.length > 0 && (
        <p className="text-[10px] text-outline leading-snug">
          Tape sur une fiche pour l'ouvrir, ou continue ci-dessous pour créer un nouveau client.
        </p>
      )}
    </div>
  );
}
