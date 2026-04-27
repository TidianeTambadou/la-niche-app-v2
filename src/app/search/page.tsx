"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ErrorBubble } from "@/components/ErrorBubble";
import { PerfumeArtwork } from "@/components/PerfumeArtwork";
import {
  agentSearch,
  AuthRequiredError,
  QuotaExceededError,
} from "@/lib/agent-client";
import type { SearchCandidate } from "@/lib/agent";
import { fragranceKey, useFragrances } from "@/lib/data";
import { useStore } from "@/lib/store";
import { useRequireAuth } from "@/lib/auth";
import { openConcierge } from "@/lib/concierge-bus";

const SUGGESTIONS = [
  "Aventus",
  "Tom Ford Oud Wood",
  "Bleu de Chanel",
  "Vetiver",
  "Sauvage",
];

export default function SearchPage() {
  useRequireAuth();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cost-aware debounce: 1500ms after the last keystroke, min 4 chars.
  // Coupled with the prefix-cache in agent-client, this means a typical
  // word ("Sauvage") triggers ~1 API call instead of 4-5.
  useEffect(() => {
    const q = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
    if (q.length < 4) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    debounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const r = await agentSearch(q, ctrl.signal);
        if (!ctrl.signal.aborted) {
          setResults(r);
          setLoading(false);
        }
      } catch (e: unknown) {
        if (ctrl.signal.aborted) return;
        // Quota épuisé → bounce sur /abonnement avec banner contextuel.
        // Le but : frustrer le free user à chaque fois qu'il tape, pour
        // pousser à l'upgrade.
        if (e instanceof QuotaExceededError) {
          router.push("/abonnement?from=search");
          return;
        }
        if (e instanceof AuthRequiredError) {
          router.push("/login?redirect=/search");
          return;
        }
        setError(e instanceof Error ? e.message : "search failed");
        setLoading(false);
      }
    }, 1500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const hasQuery = query.trim().length >= 4;

  return (
    <div className="px-6 pt-4 pb-24">
      <header className="mb-6">
        <span className="text-[10px] uppercase tracking-[0.3em] text-outline mb-2 block">
          Recherche
        </span>
        <h1 className="text-4xl font-bold tracking-tighter leading-none">
          Cherche un parfum
        </h1>
      </header>

      <SearchBar query={query} setQuery={setQuery} loading={loading} />

      {!hasQuery && (
        <section className="mt-8">
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-outline mb-3">
            Essais rapides
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setQuery(s)}
                className="px-3 py-1.5 border border-outline-variant text-[10px] uppercase tracking-widest font-bold hover:border-primary hover:bg-surface-container-low transition-all"
              >
                {s}
              </button>
            ))}
          </div>
        </section>
      )}

      {error && (
        <div className="mt-6">
          <ErrorBubble
            detail={error}
            context="Recherche · agentSearch"
            variant="block"
          />
        </div>
      )}

      {loading && results.length === 0 && (
        <ul className="mt-8 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="h-20 bg-surface-container-low animate-pulse" />
          ))}
        </ul>
      )}

      {!loading && !error && hasQuery && results.length === 0 && (
        <ConciergeFallback query={query} />
      )}

      {results.length > 0 && (
        <section className="mt-8">
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-outline mb-3">
            {results.length} résultat{results.length > 1 ? "s" : ""}
          </p>
          <ul className="flex flex-col">
            {results.map((c, i) => (
              <SearchResult key={`${c.brand}-${c.name}-${i}`} candidate={c} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SearchBar({
  query,
  setQuery,
  loading,
}: {
  query: string;
  setQuery: (q: string) => void;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-3 border-b-2 border-primary pb-3">
      <Icon name="search" size={18} className="text-outline" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Tape un nom (ex : Aventus, Vetiver, Tom Ford)…"
        className="flex-1 bg-transparent border-none outline-none text-base font-light placeholder:text-outline/60 py-1"
        autoComplete="off"
        autoFocus
      />
      {loading ? (
        <Icon
          name="progress_activity"
          size={16}
          className="text-outline animate-spin"
        />
      ) : query.length > 0 ? (
        <button
          type="button"
          onClick={() => setQuery("")}
          aria-label="Effacer"
          className="text-outline hover:text-on-background"
        >
          <Icon name="close" size={16} />
        </button>
      ) : null}
    </div>
  );
}

function SearchResult({ candidate }: { candidate: SearchCandidate }) {
  const fragrances = useFragrances();
  const { addToWishlist, isWishlisted } = useStore();

  const localKey = fragranceKey(candidate.brand, candidate.name);
  const inCatalog = fragrances.find((f) => f.key === localKey);
  const wishlistKey = inCatalog?.key ?? `ext::${localKey}`;
  const wishlistStatus = isWishlisted(wishlistKey);

  function like() {
    addToWishlist(wishlistKey, "liked", "search", {
      name: candidate.name,
      brand: candidate.brand,
      imageUrl: candidate.image_url ?? null,
    });
  }

  return (
    <li className="py-4 border-b border-outline-variant/30 last:border-0">
      <div className="flex items-start gap-3">
        <PerfumeArtwork
          brand={candidate.brand}
          name={candidate.name}
          imageUrl={candidate.image_url}
          variant="thumb"
          className="w-16 h-20 flex-shrink-0"
        />

        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-outline">
            {candidate.brand}
            {candidate.family ? ` · ${candidate.family}` : ""}
          </p>
          {inCatalog ? (
            <Link href={`/fragrance/${inCatalog.key}`}>
              <h3 className="text-base font-semibold tracking-tight">
                {candidate.name}
              </h3>
            </Link>
          ) : (
            <h3 className="text-base font-semibold tracking-tight">
              {candidate.name}
            </h3>
          )}
          {candidate.notes_brief && (
            <p className="text-[12px] text-on-surface-variant mt-1 leading-relaxed">
              {candidate.notes_brief}
            </p>
          )}

          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={like}
              className="text-[10px] uppercase tracking-widest font-bold flex items-center gap-1 hover:text-primary transition-colors"
              aria-label={
                wishlistStatus === "liked"
                  ? "Déjà dans la wishlist"
                  : "Ajouter à la wishlist"
              }
            >
              <Icon
                name={wishlistStatus === "liked" ? "favorite" : "favorite_border"}
                filled={wishlistStatus === "liked"}
                size={14}
                className={
                  wishlistStatus === "liked" ? "text-primary" : "text-outline"
                }
              />
              {wishlistStatus === "liked" ? "Dans la wishlist" : "Wishlist"}
            </button>
            {candidate.source_url && (
              <a
                href={candidate.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] uppercase tracking-widest font-bold border-b border-primary pb-0.5 flex items-center gap-1"
              >
                <Icon name="open_in_new" size={12} />
                Fiche source
              </a>
            )}
            {inCatalog && (
              <span className="text-[9px] uppercase tracking-widest font-bold text-primary">
                · En boutique
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/* ─── Concierge fallback ─────────────────────────────────────────────────
 * Shown when the fast lookup returned no match. Pre-fills a question for
 * the ConciergeWidget; the concierge will run the deep search across our
 * referenced sources in the background. The user never sees those source
 * names — only "l'équipe La Niche cherche".
 * ---------------------------------------------------------------------- */

function ConciergeFallback({ query }: { query: string }) {
  function ask() {
    openConcierge({
      message: `Trouve-moi le parfum « ${query} ». Je ne le vois pas dans la base.`,
    });
  }
  return (
    <section className="mt-10 border border-outline-variant bg-surface-container-low p-6 text-center flex flex-col items-center gap-4">
      <div className="w-12 h-12 rounded-full overflow-hidden bg-background border border-outline-variant flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-laniche.png"
          alt=""
          className="w-full h-full object-cover"
        />
      </div>
      <div>
        <p className="text-sm font-semibold tracking-tight">
          Pas de résultat pour «&nbsp;{query}&nbsp;».
        </p>
        <p className="text-xs text-on-surface-variant mt-1.5 max-w-xs leading-relaxed">
          Demande à la conciergerie La Niche, on cherche pour toi et on te
          revient avec les notes, la pyramide et un avis honnête.
        </p>
      </div>
      <button
        type="button"
        onClick={ask}
        className="px-5 py-2.5 bg-primary text-on-primary rounded-full text-[10px] uppercase tracking-widest font-bold active:scale-95 transition-transform flex items-center gap-2"
      >
        <Icon name="forum" size={14} />
        Demander à la conciergerie
      </button>
    </section>
  );
}
