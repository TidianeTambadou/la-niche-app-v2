/**
 * /api/perfumes/import
 *
 *   POST { csv: string }
 *
 *   Parses a CSV file (header row required, columns "name" + "brand" at
 *   minimum, "price" / "description" optional), then for each row calls the
 *   LLM in batches of 5 to :
 *     - correct typos in name/brand (canonicalisation)
 *     - enrich with family, top/heart/base notes, accords, description
 *
 *   Rows are upserted into `shop_perfumes` (idempotent on
 *   shop_id × lower(brand) × lower(name) — same parfum imported twice
 *   updates the existing row rather than creating a duplicate).
 *
 *   Returns { imported, skipped, errors } with per-row diagnostic.
 */

import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { getOwnerShopId, jsonError, jsonOk } from "@/lib/auth-server";
import { chatJSON } from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH_SIZE = 5;

type Row = { name: string; brand: string; price?: string; description?: string };

type Enriched = {
  name: string;
  brand: string;
  family?: string | null;
  top_notes?: string[];
  heart_notes?: string[];
  base_notes?: string[];
  accords?: string[];
  description?: string | null;
  error?: string;
};

export async function POST(req: NextRequest) {
  const shopId = await getOwnerShopId(req);
  if (!shopId) return jsonError("auth_required", 401);

  let body: { csv?: string };
  try {
    body = (await req.json()) as { csv?: string };
  } catch {
    return jsonError("invalid_json", 400);
  }

  if (!body.csv || typeof body.csv !== "string") {
    return jsonError("missing_csv", 400);
  }

  const rows = parseCSV(body.csv);
  if (rows.length === 0) {
    return jsonError("empty_csv", 400, "Le CSV doit contenir au moins une ligne de données.");
  }
  if (rows.length > 200) {
    return jsonError("csv_too_large", 400, "Maximum 200 parfums par import.");
  }

  // Build the working list of {name, brand, ...} from CSV.
  const inputs: Row[] = [];
  const skipped: { row: number; reason: string }[] = [];
  rows.forEach((r, i) => {
    if (!r.name || !r.brand) {
      skipped.push({ row: i + 2, reason: "name ou brand manquant" });
      return;
    }
    inputs.push({
      name: r.name,
      brand: r.brand,
      price: r.price,
      description: r.description,
    });
  });

  // Run LLM enrichment in batches of 5.
  const enriched: Enriched[] = [];
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const batch = inputs.slice(i, i + BATCH_SIZE);
    try {
      const out = await enrichBatch(batch);
      enriched.push(...out);
    } catch (e) {
      // Whole batch failed — record each row as failed but keep going.
      for (const row of batch) {
        enriched.push({
          ...row,
          error: e instanceof Error ? e.message : "llm_error",
        });
      }
    }
  }

  // Persist : split successful enrichments into upsertable rows.
  const admin = createAdminClient();
  const errors: { name: string; brand: string; reason: string }[] = [];
  let imported = 0;

  for (let i = 0; i < enriched.length; i += 1) {
    const e = enriched[i];
    if (e.error) {
      errors.push({ name: e.name, brand: e.brand, reason: e.error });
      continue;
    }
    const original = inputs[i];
    const priceEur = parseFloat((original.price ?? "").replace(",", ".")) || null;

    const { error } = await admin
      .from("shop_perfumes")
      .upsert(
        {
          shop_id: shopId,
          name: e.name.trim(),
          brand: e.brand.trim(),
          family: e.family ?? null,
          top_notes: e.top_notes ?? [],
          heart_notes: e.heart_notes ?? [],
          base_notes: e.base_notes ?? [],
          accords: e.accords ?? [],
          description: e.description ?? original.description ?? null,
          price_eur: priceEur,
          in_stock: true,
        },
        // The unique index is on (shop_id, lower(brand), lower(name)).
        // Supabase upsert needs a target ; we use the same shape since
        // Postgres normalises via the index expression.
        { onConflict: "shop_id,brand,name" },
      );

    if (error) {
      errors.push({ name: e.name, brand: e.brand, reason: error.message });
    } else {
      imported += 1;
    }
  }

  return jsonOk({
    total: rows.length,
    imported,
    skipped,
    errors,
  });
}

/* ─── LLM enrichment ─────────────────────────────────────────────── */

const ENRICH_PROMPT = `Tu reçois une liste de parfums. Chaque entrée peut contenir des FAUTES D'ORTHOGRAPHE dans le nom ou la marque. Pour CHAQUE entrée :

1. CORRIGE les fautes en utilisant le nom canonique du parfum (ex: "Tomb ford black orchid" → name="Black Orchid", brand="Tom Ford").
2. AJOUTE :
   - family : famille olfactive principale (Floral, Boisé, Oriental, Ambré, Hespéridé, Fougère, Chypré, Cuir, Gourmand, Aromatique, Aquatique, Poudré).
   - top_notes : 3-5 notes de tête.
   - heart_notes : 3-5 notes de cœur.
   - base_notes : 3-5 notes de fond.
   - accords : 3-5 accords composés (ex: "boisé ambré", "floral poudré").
   - description : 1-2 phrases factuelles, sans marketing.
3. Si le parfum n'existe pas / trop ambigu pour identifier, mets le champ "error": "unknown" et laisse les autres vides.

Réponds STRICTEMENT en JSON, dans l'ordre exact des entrées reçues :
{"results":[{"name":"","brand":"","family":"","top_notes":[],"heart_notes":[],"base_notes":[],"accords":[],"description":""}]}

Ne mets aucun texte avant ou après le JSON.`;

async function enrichBatch(rows: Row[]): Promise<Enriched[]> {
  const list = rows
    .map((r, i) => `${i + 1}. name="${r.name}" | brand="${r.brand}"`)
    .join("\n");

  const out = await chatJSON<{ results: Enriched[] }>(
    [
      { role: "system", content: ENRICH_PROMPT },
      { role: "user", content: list },
    ],
    { temperature: 0.2, maxTokens: 2500 },
  );

  // Pad / truncate to match the input length so we keep alignment.
  const results = out.results ?? [];
  while (results.length < rows.length) {
    results.push({ name: rows[results.length].name, brand: rows[results.length].brand, error: "missing_in_response" });
  }
  return results.slice(0, rows.length);
}

/* ─── Tiny CSV parser ────────────────────────────────────────────── */

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseLine(lines[0]).map((h) => normaliseHeader(h));
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? "").trim();
    });
    return row;
  });
}

/** Maps various header spellings to our internal keys. */
function normaliseHeader(raw: string): string {
  const h = raw.trim().toLowerCase();
  if (["nom", "perfume", "parfum"].includes(h)) return "name";
  if (["marque", "house", "maison"].includes(h)) return "brand";
  if (["prix", "price_eur", "prix_eur"].includes(h)) return "price";
  if (["desc", "descr"].includes(h)) return "description";
  return h;
}

function parseLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}
