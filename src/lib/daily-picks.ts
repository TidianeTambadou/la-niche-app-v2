"use client";

import { useEffect, useRef, useState } from "react";
import { agentSearch } from "@/lib/agent-client";
import type { SearchCandidate } from "@/lib/agent";
import type { OlfactiveProfile } from "@/lib/profile";

/**
 * Daily personalised perfume picks shown on the home carousel.
 *
 * Strategy:
 *   1. Build a stable query string from the user's olfactive profile (taste,
 *      temperature, target). The query is intentionally short so the agent
 *      hits the search cache on most days.
 *   2. Cache the response in localStorage keyed by (userId, ISO date) so we
 *      don't burn an API call on every page load — one fetch per day max.
 *   3. Re-fetch automatically when the day rolls over.
 */

type CachedPicks = {
  date: string;
  query: string;
  picks: SearchCandidate[];
  /** True after the user has tapped the La Niche envelope and revealed the
   *  3 flashcards. Persisted so revisits skip the reveal animation. */
  revealed: boolean;
};

const STORAGE_PREFIX = "la-niche.daily-picks.v3";

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function storageKey(userId: string | null): string {
  return `${STORAGE_PREFIX}.${userId ?? "anon"}`;
}

function readCache(userId: string | null): CachedPicks | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as CachedPicks;
  } catch {
    return null;
  }
}

function writeCache(userId: string | null, value: CachedPicks): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

const TASTE_KEYWORDS: Record<string, string> = {
  sweet: "gourmand vanille caramel",
  fruity: "fruité pêche fruits rouges",
  woody: "boisé cèdre santal",
  floral: "floral rose jasmin iris",
  citrus: "citrus bergamote",
  smoky: "fumé oud encens tabac",
  leather: "cuir musqué",
};

const TEMP_KEYWORDS: Record<string, string> = {
  cool: "frais marin",
  warm: "chaud épicé",
  balanced: "polyvalent",
};

const VIBE_KEYWORDS: Record<string, string> = {
  "fresh-young": "jeune street",
  "classy-pro": "élégant chic",
  "rock-nightlife": "nuit clubbing",
  bohemian: "bohème naturel",
};

const TARGET_KEYWORDS: Record<string, string> = {
  women: "femme",
  men: "homme",
  everyone: "unisexe",
  self: "signature personnelle",
};

function answerOf(
  answers: Record<string, string | string[]> | undefined,
  key: string,
): string | undefined {
  const v = answers?.[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

function answersOf(
  answers: Record<string, string | string[]> | undefined,
  key: string,
): string[] {
  const v = answers?.[key];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string") return [v];
  return [];
}

/** Build a Fragrantica-friendly French query from the user profile. */
function buildDailyQuery(profile: OlfactiveProfile | null): string {
  const parts: string[] = ["parfum niche"];
  if (profile?.quiz_answers) {
    // taste is multi-select — pick up to 2 keyword sets so the query stays
    // tight enough to retrieve relevant results.
    const tasteVals = answersOf(profile.quiz_answers, "taste").slice(0, 2);
    for (const t of tasteVals) {
      if (TASTE_KEYWORDS[t]) parts.push(TASTE_KEYWORDS[t]);
    }
    const temp = answerOf(profile.quiz_answers, "temperature");
    const vibe = answerOf(profile.quiz_answers, "vibe");
    const target = answerOf(profile.quiz_answers, "target");
    if (temp && TEMP_KEYWORDS[temp]) parts.push(TEMP_KEYWORDS[temp]);
    if (vibe && VIBE_KEYWORDS[vibe]) parts.push(VIBE_KEYWORDS[vibe]);
    if (target && TARGET_KEYWORDS[target]) parts.push(TARGET_KEYWORDS[target]);
  } else if (profile?.preferred_families.length) {
    parts.push(...profile.preferred_families.slice(0, 2).map((f) => f.toLowerCase()));
  } else {
    parts.push("découverte tendance");
  }
  return parts.join(" ");
}

export type DailyPicksState =
  | { status: "loading"; picks: SearchCandidate[]; revealed: boolean }
  | { status: "ready"; picks: SearchCandidate[]; revealed: boolean }
  | {
      status: "error";
      picks: SearchCandidate[];
      revealed: boolean;
      error: string;
    };

export type DailyPicksHook = {
  state: DailyPicksState;
  /** Mark today's picks as revealed (persists across reloads). */
  reveal: () => void;
};

/** React hook — returns up to 3 daily picks for the user, cached for the day,
 *  plus a `reveal()` action so the home page can flip the surprise card open. */
export function useDailyPicks(
  profile: OlfactiveProfile | null,
  userId: string | null,
): DailyPicksHook {
  const [state, setState] = useState<DailyPicksState>({
    status: "loading",
    picks: [],
    revealed: false,
  });
  // Only fetch once per (user, day) — `lastFetchKey` guards against rapid
  // re-fetches when the profile object identity flips.
  const lastFetchKey = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(userId);
  userIdRef.current = userId;

  useEffect(() => {
    const today = todayKey();
    const query = buildDailyQuery(profile);
    const fetchKey = `${userId ?? "anon"}::${today}::${query}`;
    if (lastFetchKey.current === fetchKey) return;
    lastFetchKey.current = fetchKey;

    const cached = readCache(userId);
    if (cached && cached.date === today && cached.query === query) {
      setState({
        status: "ready",
        picks: cached.picks.slice(0, 3),
        revealed: cached.revealed,
      });
      return;
    }

    setState({ status: "loading", picks: [], revealed: false });
    let cancelled = false;
    (async () => {
      try {
        const all = await agentSearch(query);
        const picks = all.slice(0, 3);
        if (cancelled) return;
        writeCache(userId, { date: today, query, picks, revealed: false });
        setState({ status: "ready", picks, revealed: false });
      } catch (e: unknown) {
        if (cancelled) return;
        setState({
          status: "error",
          picks: [],
          revealed: false,
          error: e instanceof Error ? e.message : "daily picks failed",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, userId]);

  function reveal() {
    setState((s) => ({ ...s, revealed: true }));
    const cached = readCache(userIdRef.current);
    if (cached) {
      writeCache(userIdRef.current, { ...cached, revealed: true });
    }
  }

  return { state, reveal };
}
