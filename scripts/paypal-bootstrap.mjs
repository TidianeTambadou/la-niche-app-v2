#!/usr/bin/env node
/**
 * PayPal subscriptions bootstrap — creates one product and the six plans
 * (Curieux / Initié / Mécène × mensuel / annuel) we ship in src/lib/store.tsx,
 * then prints the env vars to paste into .env.local.
 *
 * Usage:
 *   node scripts/paypal-bootstrap.mjs              # uses sandbox (default)
 *   PAYPAL_LIVE=1 node scripts/paypal-bootstrap.mjs # creates in live env
 *
 * Reads PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET from .env.local.
 *
 * Idempotent — re-running the script reuses any product or plan that
 * already exists with the same name (matched against PRODUCT_NAME and
 * each plan's `name` field). Safe to run multiple times.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/* ─── Constants — keep in sync with src/lib/store.tsx ──────────────────── */

const PRODUCT_NAME = "La Niche Subscription";
const PRODUCT_DESCRIPTION =
  "Abonnement à La Niche — recommandations IA, balades guidées, concierge.";
const CURRENCY = "EUR";

const PLANS = [
  {
    envKey: "NEXT_PUBLIC_PAYPAL_PLAN_CURIEUX_MONTHLY",
    name: "La Niche — Curieux mensuel",
    interval: "MONTH",
    price: "4.99",
  },
  {
    envKey: "NEXT_PUBLIC_PAYPAL_PLAN_CURIEUX_ANNUAL",
    name: "La Niche — Curieux annuel",
    interval: "YEAR",
    price: "49.90",
  },
  {
    envKey: "NEXT_PUBLIC_PAYPAL_PLAN_INITIE_MONTHLY",
    name: "La Niche — Initié mensuel",
    interval: "MONTH",
    price: "12.99",
  },
  {
    envKey: "NEXT_PUBLIC_PAYPAL_PLAN_INITIE_ANNUAL",
    name: "La Niche — Initié annuel",
    interval: "YEAR",
    price: "129.00",
  },
  {
    envKey: "NEXT_PUBLIC_PAYPAL_PLAN_MECENE_MONTHLY",
    name: "La Niche — Mécène mensuel",
    interval: "MONTH",
    price: "24.99",
  },
  {
    envKey: "NEXT_PUBLIC_PAYPAL_PLAN_MECENE_ANNUAL",
    name: "La Niche — Mécène annuel",
    interval: "YEAR",
    price: "249.00",
  },
];

/* ─── .env.local parser ─────────────────────────────────────────────────── */

function loadDotenv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = resolve(here, "..", ".env.local");
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    console.warn(
      `[paypal] .env.local introuvable à ${path} — on lit process.env directement.`,
    );
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

/* ─── PayPal client ─────────────────────────────────────────────────────── */

const isLive = process.env.PAYPAL_LIVE === "1";
const API_BASE = isLive
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

async function getAccessToken(clientId, clientSecret) {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );
  const res = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `OAuth ${res.status} — vérifie PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET. Réponse: ${detail.slice(0, 300)}`,
    );
  }
  const data = await res.json();
  return data.access_token;
}

async function paypalFetch(token, path, init = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const detail = JSON.stringify(data, null, 2).slice(0, 800);
    throw new Error(`PayPal ${res.status} on ${path} — ${detail}`);
  }
  return data;
}

/* ─── Idempotency helpers ───────────────────────────────────────────────── */

async function findExistingProduct(token, name) {
  // Paginate (PayPal returns up to 20 by default; we ship 1 product so
  // page_size=20 is plenty, but loop just in case the user has unrelated
  // products on the same account).
  let page = 1;
  while (page < 20) {
    const data = await paypalFetch(
      token,
      `/v1/catalogs/products?page_size=20&page=${page}&total_required=true`,
    );
    const match = (data.products ?? []).find((p) => p.name === name);
    if (match) return match.id;
    if (!data.links?.some((l) => l.rel === "next")) break;
    page += 1;
  }
  return null;
}

async function findExistingPlan(token, productId, name) {
  let page = 1;
  while (page < 20) {
    const data = await paypalFetch(
      token,
      `/v1/billing/plans?product_id=${productId}&page_size=20&page=${page}&total_required=true`,
    );
    const match = (data.plans ?? []).find((p) => p.name === name);
    if (match) return match.id;
    if (!data.links?.some((l) => l.rel === "next")) break;
    page += 1;
  }
  return null;
}

/* ─── Create product + plans ───────────────────────────────────────────── */

async function ensureProduct(token) {
  const existing = await findExistingProduct(token, PRODUCT_NAME);
  if (existing) {
    console.log(`✓ Produit existant réutilisé : ${existing}`);
    return existing;
  }
  const created = await paypalFetch(token, "/v1/catalogs/products", {
    method: "POST",
    body: JSON.stringify({
      name: PRODUCT_NAME,
      description: PRODUCT_DESCRIPTION,
      type: "SERVICE",
      category: "SOFTWARE",
    }),
  });
  console.log(`✓ Produit créé : ${created.id}`);
  return created.id;
}

async function ensurePlan(token, productId, plan) {
  const existing = await findExistingPlan(token, productId, plan.name);
  if (existing) {
    console.log(`✓ Plan existant réutilisé : ${plan.name} → ${existing}`);
    return existing;
  }
  const body = {
    product_id: productId,
    name: plan.name,
    description: plan.name,
    status: "ACTIVE",
    billing_cycles: [
      {
        frequency: { interval_unit: plan.interval, interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 1,
        // 0 = renouvellement infini jusqu'à annulation.
        total_cycles: 0,
        pricing_scheme: {
          fixed_price: { value: plan.price, currency_code: CURRENCY },
        },
      },
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: { value: "0", currency_code: CURRENCY },
      setup_fee_failure_action: "CONTINUE",
      payment_failure_threshold: 3,
    },
    taxes: { percentage: "0", inclusive: true },
  };
  const created = await paypalFetch(token, "/v1/billing/plans", {
    method: "POST",
    body: JSON.stringify(body),
  });
  console.log(`✓ Plan créé : ${plan.name} → ${created.id}`);
  return created.id;
}

/* ─── Main ──────────────────────────────────────────────────────────────── */

async function main() {
  loadDotenv();

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error(
      "❌ PAYPAL_CLIENT_ID ou PAYPAL_CLIENT_SECRET manquants dans .env.local.",
    );
    console.error(
      "   Récupère-les sur https://developer.paypal.com/dashboard/applications/sandbox",
    );
    process.exit(1);
  }

  console.log(`→ Environnement : ${isLive ? "LIVE 🔴" : "Sandbox 🧪"}`);
  console.log(`→ API : ${API_BASE}`);

  const token = await getAccessToken(clientId, clientSecret);
  console.log("✓ OAuth OK");

  const productId = await ensureProduct(token);

  const planIds = {};
  for (const plan of PLANS) {
    planIds[plan.envKey] = await ensurePlan(token, productId, plan);
  }

  console.log("\n────────────────────────────────────────────────────────────");
  console.log("🎉 Bootstrap terminé. Ajoute ces lignes à .env.local :");
  console.log("────────────────────────────────────────────────────────────");
  console.log(`PAYPAL_PRODUCT_ID=${productId}`);
  for (const [key, id] of Object.entries(planIds)) {
    console.log(`${key}=${id}`);
  }
  console.log("────────────────────────────────────────────────────────────");
  console.log(
    "\nN'oublie pas de mettre les mêmes vars dans Vercel (Production + Preview).",
  );
}

main().catch((e) => {
  console.error("\n❌ Erreur :", e.message);
  process.exit(1);
});
