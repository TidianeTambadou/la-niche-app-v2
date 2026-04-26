/**
 * Génère la carte parfum via un modèle de diffusion (Flux) sur OpenRouter.
 *
 * GET /api/card-image?brand=Dior&name=Sauvage
 *
 * Étapes :
 *   1. Récupère les données Fragella (notes, accords, rating…)
 *   2. Remplit le prompt template avec ces données
 *   3. Envoie à black-forest-labs/flux-1.1-pro via OpenRouter
 *   4. Retourne le PNG généré
 */

import { getFragellaPerfume, type FragellaPerfume } from "@/lib/fragella";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "google/gemini-3.1-flash-image-preview";

/* ─── Route handler ──────────────────────────────────────────────────── */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const brand = (url.searchParams.get("brand") ?? "").trim();
  const name  = (url.searchParams.get("name")  ?? "").trim();

  if (!brand || !name) {
    return new Response("brand & name required", { status: 400 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response("OPENROUTER_API_KEY not set", { status: 500 });
  }

  // 1. Données Fragella (best-effort — on génère quand même si indisponible)
  let p: FragellaPerfume | null = null;
  try {
    p = await getFragellaPerfume(brand, name);
  } catch { /* génération sans données enrichies */ }

  // 2. Prompt
  const prompt = buildPrompt(p, brand, name);

  // 3. Génération via OpenRouter
  let imageData: { data: Buffer; contentType: string };
  try {
    imageData = await generateImage(apiKey, prompt);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`Image generation failed: ${msg}`, { status: 502 });
  }

  return new Response(imageData.data, {
    headers: {
      "Content-Type": imageData.contentType,
      "cache-control": "public, max-age=3600, s-maxage=3600",
      "content-disposition": `inline; filename="laniche-${slug(brand)}-${slug(name)}.png"`,
    },
  });
}

/* ─── OpenRouter image generation (chat completions + modalities) ──── */

async function generateImage(
  apiKey: string,
  prompt: string,
): Promise<{ data: Buffer; contentType: string }> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://mobile-laniche.vercel.app",
      "X-Title": "La Niche",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
      image_config: { aspect_ratio: "9:16" },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`OpenRouter ${res.status}: ${err}`);
  }

  const json = (await res.json()) as {
    choices?: {
      message?: {
        images?: { image_url?: { url?: string } }[];
        content?: string;
      };
    }[];
  };

  const imgEntry = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!imgEntry) throw new Error("No image in OpenRouter response");

  // data URL → Buffer
  if (imgEntry.startsWith("data:")) {
    const [header, b64] = imgEntry.split(",", 2);
    const contentType = header.replace("data:", "").replace(";base64", "");
    return { data: Buffer.from(b64, "base64"), contentType };
  }

  // URL distante → proxy
  const imgRes = await fetch(imgEntry);
  if (!imgRes.ok) throw new Error("Failed to fetch remote image");
  const buf = Buffer.from(await imgRes.arrayBuffer());
  return { data: buf, contentType: imgRes.headers.get("content-type") ?? "image/png" };
}

/* ─── Prompt builder ─────────────────────────────────────────────────── */

function buildPrompt(p: FragellaPerfume | null, brand: string, name: string): string {
  const perfumeName = p?.name ?? name;
  const brandName   = p?.brand ?? brand;
  const rating      = p?.rating != null ? p.rating.toFixed(1) : "4.5";
  const reviews     = p?.reviews_count != null
    ? p.reviews_count.toLocaleString("en-US") + " reviews"
    : "community reviews";

  const accords = p?.accords.slice(0, 5).map((a) => a.name).join(", ")
    ?? "amber, vanilla, woody, musky, sweet";

  const allNoteNames = [
    ...(p?.notes.top    ?? []),
    ...(p?.notes.middle ?? []),
    ...(p?.notes.base   ?? []),
  ].map((n) => n.name);
  const notes = (allNoteNames.length > 0 ? allNoteNames : ["bergamot", "cedar", "musk"])
    .slice(0, 9)
    .join(", ");

  const longevity = p?.longevity ?? "Long Lasting";
  const sillage   = p?.sillage   ?? "Moderate";

  const ins = deriveInsights(p);

  return `Create a clean, high-end, colorful fragrance infographic poster in a structured editorial layout.
STRICT LAYOUT (do not change structure):
LEFT SIDE (65%):
- Top: perfume name in large bold typography: ${perfumeName}
- Subtitle: ${brandName} — for women and men
- QR code in top right
- Large realistic perfume bottle image
- Rating block:
 ${rating} stars with ${reviews}
- "Main accords" section:
 5 horizontal rounded bars with soft gradients:
   ${accords}
 Each bar includes:
   - ingredient illustration (realistic)
   - 2 descriptors
- "Notes" section:
 grid of realistic ingredient images:
   ${notes}
- "Fragrance profile":
 Longevity: ${longevity} (gradient bar)
 Sillage: ${sillage} (soft → strong bar)
- "Day / Night" toggle
- "Seasons":
 4 visual cards:
 winter, spring, summer, autumn
RIGHT SIDE (35%):
- Modern artistic Mona Lisa portrait
- Bright colorful powder explosion background
- Magnifying glass zooming into skin detail
- "Secret Insights" dark panel:
 Addictive: ${ins.addictive}
 Appeal: ${ins.appeal}
 DNA: ${ins.dna}
 Moment: ${ins.moment}
 Aura: ${ins.aura}
STYLE:
- Soft cream background
- colorful gradients matching ingredients
- ultra clean UI design
- realistic ingredient visuals (VERY IMPORTANT)
- balanced spacing and grid layout
IMPORTANT:
- keep layout consistent
- do not change structure
- adapt visuals based on perfume notes
- premium, modern, highly readable
Output: high resolution poster, 1200x1800`;
}

/* ─── Insights derivation ────────────────────────────────────────────── */

function deriveInsights(p: FragellaPerfume | null) {
  if (!p) {
    return { addictive: "MEDIUM", appeal: "BROAD", dna: "—", moment: "DAILY WEAR", aura: "SIGNATURE & SUBTLE" };
  }

  const r = p.rating ?? 0;
  const intSillage =
    (p.sillage ?? "").toLowerCase().includes("strong") ||
    (p.longevity ?? "").toLowerCase().includes("very long") ||
    (p.longevity ?? "").toLowerCase().includes("long");
  const addictive = r >= 4.2 && intSillage ? "HIGH" : r >= 3.8 ? "MEDIUM" : "LOW";

  const fam     = (p.family ?? "").toLowerCase();
  const isNiche = fam.includes("oud") || fam.includes("smoky") || fam.includes("leather");
  const isFresh = fam.includes("fresh") || fam.includes("citrus") || fam.includes("floral");
  const appeal  = isNiche ? "NICHE" : isFresh ? "BROAD" : "STRONG";

  const dna = p.accords.slice(0, 2).map((a) => a.name.toUpperCase()).join(" · ") || "—";

  const isNight = p.day_time.includes("night");
  const isDay   = p.day_time.includes("day");
  const moment  = isNight && isDay ? "DAY & NIGHT" : isNight ? "EVENING / NIGHT" : "DAILY WEAR";

  const isWarm = fam.includes("amber") || fam.includes("oud") || fam.includes("woody") ||
                 fam.includes("warm")  || fam.includes("vanilla") || fam.includes("sweet") || fam.includes("spicy");
  const aura = isWarm && intSillage ? "WARM & SEDUCTIVE"
    : isWarm ? "COSY & INTIMATE"
    : isFresh && intSillage ? "BRIGHT & MAGNETIC"
    : isFresh ? "AIRY & UPLIFTING"
    : fam.includes("floral") || fam.includes("rose") ? "ROMANTIC & POETIC"
    : "SIGNATURE & SUBTLE";

  return { addictive, appeal, dna, moment, aura };
}

/* ─── Helpers ───────────────────────────────────────────────────────── */

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
