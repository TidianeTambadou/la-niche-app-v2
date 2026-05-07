"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";

/**
 * Free French national address autocomplete via the BAN
 * (https://api-adresse.data.gouv.fr/search/). No API key required, supports
 * CORS, rate-limit friendly. We debounce 300ms to keep request volume down.
 *
 * The component is a controlled input : the parent owns the displayed
 * string. When the user picks a suggestion, `onSelect` fires with the full
 * resolved address (street + postal_code + city + GPS), and the input is
 * filled with the canonical label.
 */

export type ResolvedAddress = {
  /** Full canonical label, ex "12 Rue de Rivoli 75001 Paris". */
  label: string;
  /** Just the street part, ex "12 Rue de Rivoli". */
  addressLine: string;
  postalCode: string;
  city: string;
  latitude: number;
  longitude: number;
};

type Suggestion = {
  properties: {
    label: string;
    name: string;
    postcode: string;
    city: string;
  };
  geometry: {
    coordinates: [number, number]; // [lng, lat]
  };
};

type Props = {
  value: string;
  onChange: (text: string) => void;
  onSelect: (addr: ResolvedAddress) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
};

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Saisis une adresse",
  className,
  required,
}: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Bumped on every selection to suppress the next debounced fetch — picking
  // a suggestion fills the input with a long label that would otherwise
  // re-trigger the search.
  const muteFetchRef = useRef(0);

  useEffect(() => {
    if (muteFetchRef.current > 0) {
      muteFetchRef.current -= 1;
      return;
    }
    if (!value || value.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(value)}&limit=5&autocomplete=1`;
        const res = await fetch(url);
        const json = (await res.json()) as { features?: Suggestion[] };
        setSuggestions(json.features ?? []);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [value]);

  function pick(s: Suggestion) {
    const [lng, lat] = s.geometry.coordinates;
    const resolved: ResolvedAddress = {
      label: s.properties.label,
      addressLine: s.properties.name,
      postalCode: s.properties.postcode,
      city: s.properties.city,
      latitude: lat,
      longitude: lng,
    };
    muteFetchRef.current = 1;
    onChange(resolved.label);
    onSelect(resolved);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so a click on a suggestion item still fires before the
          // dropdown vanishes.
          setTimeout(() => setOpen(false), 150);
        }}
        required={required}
        placeholder={placeholder}
        className={
          className ??
          "w-full px-4 py-3 bg-surface-container rounded-2xl border border-outline-variant text-sm"
        }
        autoComplete="street-address"
      />
      {open && (loading || suggestions.length > 0) && (
        <ul className="absolute z-30 left-0 right-0 mt-1 bg-surface border border-outline-variant rounded-2xl shadow-lg overflow-hidden max-h-72 overflow-y-auto">
          {loading && suggestions.length === 0 && (
            <li className="px-4 py-3 text-xs text-on-surface-variant flex items-center gap-2">
              <Icon name="progress_activity" size={14} className="animate-spin" />
              Recherche…
            </li>
          )}
          {suggestions.map((s, i) => (
            <li key={`${s.properties.label}-${i}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className="w-full text-left px-4 py-3 text-sm hover:bg-surface-container border-b border-outline-variant/40 last:border-0"
              >
                <p className="font-medium leading-tight">{s.properties.name}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {s.properties.postcode} {s.properties.city}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
