/**
 * Hybrid scoring engine for the newsletter.
 *
 * 1. Pure-deterministic ranking : compares each client's olfactive_profile
 *    against the candidate perfume (families, notes, accords). Fast,
 *    explainable, no LLM cost.
 * 2. LLM justification pass : for the top N+padding survivors, the LLM
 *    is asked to write a single-sentence reason why this client should
 *    love this perfume. Costs one batched call regardless of N.
 *
 * The deterministic pass alone is enough to drive ranking ; the LLM only
 * augments the preview UI.
 */

import { chatJSON } from "@/lib/llm";
import type { ShopPerfume } from "@/lib/types";

type ProfileLike = {
  dominant_families?: string[];
  dominant_accords?: string[];
  key_notes?: string[];
  avoid_notes?: string[];
  intensity_score?: number;
};

export type ScorableClient = {
  id: string;
  first_name: string;
  last_name: string;
  preferred_channel: "email" | "sms" | "both";
  email: string | null;
  phone: string | null;
  consent_marketing: boolean;
  olfactive_profile: ProfileLike | null;
};

export type Scored = {
  client_id: string;
  first_name: string;
  last_name: string;
  channel: "email" | "sms";
  score: number;
  /** Filled in by the LLM pass. Empty until justify() runs. */
  reason: string;
};

const FAMILY_WEIGHT = 3;
const NOTE_WEIGHT = 2;
const ACCORD_WEIGHT = 1;
const AVOID_PENALTY = 4;

function lowerSet(arr?: string[] | null): Set<string> {
  return new Set((arr ?? []).map((s) => s.toLowerCase().trim()).filter(Boolean));
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const v of a) if (b.has(v)) n++;
  return n;
}

function noteOverlap(a: Set<string>, b: Set<string>): number {
  // Notes are looser than families — substring match counts ("vanille" matches
  // "vanille de Madagascar"), so we walk both ways. Cheap on small sets.
  let n = 0;
  for (const x of a) for (const y of b) {
    if (x === y || x.includes(y) || y.includes(x)) {
      n++;
      break;
    }
  }
  return n;
}

/** Deterministic part of the score. Higher = better match. */
export function scoreClient(client: ScorableClient, perfume: ShopPerfume): number {
  const p = client.olfactive_profile;
  if (!p) return 0;

  const perfumeFamilies = lowerSet(perfume.family ? [perfume.family] : []);
  const perfumeAccords = lowerSet(perfume.accords);
  const perfumeNotes = lowerSet([
    ...perfume.top_notes,
    ...perfume.heart_notes,
    ...perfume.base_notes,
  ]);

  const familyHit = overlap(lowerSet(p.dominant_families), perfumeFamilies) * FAMILY_WEIGHT;
  const accordHit = overlap(lowerSet(p.dominant_accords), perfumeAccords) * ACCORD_WEIGHT;
  const noteHit = noteOverlap(lowerSet(p.key_notes), perfumeNotes) * NOTE_WEIGHT;
  const avoidHit = noteOverlap(lowerSet(p.avoid_notes), perfumeNotes) * AVOID_PENALTY;

  return Math.max(0, familyHit + accordHit + noteHit - avoidHit);
}

/**
 * Pick the channel to use for a given client given their preferences and
 * the contact info we actually have. Returns null when we can't reach them
 * at all (no email AND no phone).
 */
export function pickChannel(c: ScorableClient): "email" | "sms" | null {
  const wantEmail = c.preferred_channel === "email" || c.preferred_channel === "both";
  const wantSMS = c.preferred_channel === "sms" || c.preferred_channel === "both";
  if (wantEmail && c.email) return "email";
  if (wantSMS && c.phone) return "sms";
  if (c.email) return "email";
  if (c.phone) return "sms";
  return null;
}

/**
 * Filter + rank + (optionally) ask the LLM for a one-line reason.
 * Returns at most `n` recipients, sorted by descending score.
 */
export async function selectAudience(
  perfume: ShopPerfume,
  clients: ScorableClient[],
  n: number,
  opts: { withReasons?: boolean } = {},
): Promise<Scored[]> {
  const ranked: Scored[] = [];

  for (const c of clients) {
    if (!c.consent_marketing) continue;
    const channel = pickChannel(c);
    if (!channel) continue;
    const score = scoreClient(c, perfume);
    if (score <= 0) continue;
    ranked.push({
      client_id: c.id,
      first_name: c.first_name,
      last_name: c.last_name,
      channel,
      score: Number(score.toFixed(2)),
      reason: "",
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  const picked = ranked.slice(0, n);

  if (opts.withReasons && picked.length > 0) {
    try {
      const reasons = await justifyBatch(perfume, picked, clients);
      for (const r of reasons) {
        const target = picked.find((p) => p.client_id === r.client_id);
        if (target) target.reason = r.reason;
      }
    } catch (e) {
      // Reason copy is a nice-to-have ; campaign can ship without it.
      console.warn("[newsletter] justify failed:", e instanceof Error ? e.message : e);
    }
  }

  return picked;
}

async function justifyBatch(
  perfume: ShopPerfume,
  selected: Scored[],
  allClients: ScorableClient[],
): Promise<{ client_id: string; reason: string }[]> {
  const profilesById = new Map(allClients.map((c) => [c.id, c.olfactive_profile]));
  const clientsBlock = selected
    .map((s) => {
      const p = (profilesById.get(s.client_id) ?? {}) as ProfileLike;
      return `- id=${s.client_id} | ${s.first_name} ${s.last_name}\n  familles: ${(p.dominant_families ?? []).join(", ") || "—"}\n  notes aimées: ${(p.key_notes ?? []).join(", ") || "—"}\n  à éviter: ${(p.avoid_notes ?? []).join(", ") || "—"}`;
    })
    .join("\n\n");

  const perfumeBlock = `${perfume.name} — ${perfume.brand}
  famille: ${perfume.family ?? "—"}
  accords: ${perfume.accords.join(", ") || "—"}
  notes: ${[...perfume.top_notes, ...perfume.heart_notes, ...perfume.base_notes].join(", ") || "—"}
  description: ${perfume.description ?? "—"}`;

  const out = await chatJSON<{ reasons: { client_id: string; reason: string }[] }>(
    [
      {
        role: "system",
        content:
          "Tu es un parfumeur conseiller. Pour chaque client, écris une phrase (max 22 mots) expliquant pourquoi ce parfum lui plaira, en citant 1 ou 2 notes/familles spécifiques. Ton chaleureux, jamais commercial cliché. Retourne UNIQUEMENT du JSON : {\"reasons\":[{\"client_id\":\"\",\"reason\":\"\"}]}",
      },
      {
        role: "user",
        content: `Parfum :\n${perfumeBlock}\n\nClients :\n${clientsBlock}`,
      },
    ],
    { temperature: 0.6, maxTokens: 1200 },
  );

  return out.reasons ?? [];
}
