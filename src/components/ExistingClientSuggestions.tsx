"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { authedFetch } from "@/lib/api-client";

/**
 * Live search inside the boutique's own clients while the vendor types a
 * name. Helps avoid creating a duplicate fiche when a returning client comes
 * back ("Marie Dupont" already exists → click to load her last data into
 * the wizard and skip straight to the existing report).
 *
 * Triggers only when both first and last name have ≥ 2 chars. Debounced
 * 300ms so we don't hammer the API on each keystroke. Hidden when nothing
 * matches.
 *
 * The parent wizard handles selection via `onSelect` — we never link out,
 * which lets the wizard pre-fill its state and jump directly to the done
 * step (existing report displayed).
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
  onSelect: (clientId: string) => void;
};

export function ExistingClientSuggestions({ firstName, lastName, onSelect }: Props) {
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
        // Per-column ilike filters AND-ed by the API so we only get rows
        // that match BOTH first AND last name. Using `search` instead does
        // a substring search across (first_name OR last_name OR email),
        // which fails for "Marie Dupont" because no single column ever
        // contains both halves.
        const params = new URLSearchParams({
          firstNameLike: f,
          lastNameLike: l,
          limit: "5",
        });
        const json = await authedFetch<{
          clients: Match[];
        }>(`/api/clients?${params.toString()}`);
        setMatches(json.clients);
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
              <button
                type="button"
                onClick={() => onSelect(m.id)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-outline-variant rounded-xl bg-surface hover:border-primary transition-colors text-left"
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
              </button>
            </li>
          ))}
        </ul>
      )}
      {matches.length > 0 && (
        <p className="text-[10px] text-outline leading-snug">
          Tape sur une fiche pour la charger (le rapport s'affiche), ou continue ci-dessous pour créer un nouveau client.
        </p>
      )}
    </div>
  );
}
