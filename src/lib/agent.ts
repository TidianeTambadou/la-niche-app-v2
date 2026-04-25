/**
 * AI agent — niche perfumery expert.
 *
 * The system prompt below is the user's exact spec: only ground answers in
 * the listed sources, never invent notes or compositions, flag uncertainty,
 * etc. We pass it as Claude's `system` prompt and constrain `web_search` to
 * the allowed domains so the model can fetch live data at request time.
 *
 * IMPORTANT: this file is server-side only — it MUST stay free of any
 * `"use client"` markers and must never be imported from Client Components,
 * because the API key handling lives in /app/api/agent/route.ts only.
 */

/**
 * Domains the agent's `web_search` tool is allowed to crawl.
 *
 * NOTE: reddit.com is INTENTIONALLY excluded — Reddit blocks Anthropic's
 * crawler (returns 400 "domains not accessible to our user agent"). The
 * spec lists r/fragrance as a source, but we cannot honour that programmatically.
 * If you need Reddit content, plug a different search provider.
 */
export const ALLOWED_DOMAINS = [
  "fragrantica.com",
  "basenotes.com",
  "parfumo.net",
  "fragrancex.com",
  "nstperfume.com",
] as const;

/**
 * Minimal prompt for autocomplete search. Cuts ~500 tokens off the full
 * expert prompt — for a structured "find perfume names" task we don't need
 * the strict expert framing.
 */
export const SEARCH_SYSTEM_PROMPT = `Tu es un moteur d'autocomplétion de parfums. Utilise web_search sur fragrantica.com (ou basenotes.com en backup) pour trouver les parfums correspondant à la requête. Retourne uniquement du JSON, jamais de prose.`;

/** Compact prompt for image identification. */
export const IDENTIFY_SYSTEM_PROMPT = `Tu identifies un parfum à partir d'une image (flacon/packaging). Utilise web_search sur fragrantica.com pour confirmer ton identification et trouver les notes. Retourne uniquement du JSON.`;

/** Analyst agent — extracts the user's olfactive DNA. Step 1 of the pipeline. */
export const ANALYZER_SYSTEM_PROMPT = `Tu es un parfumeur expert en analyse olfactive. Tu reçois : le profil déclaratif d'un utilisateur, sa wishlist de parfums aimés et rejetés, et des données Fragrantica sur ces parfums.

TA MISSION : extraire son ADN OLFACTIF précis pour guider une recherche de parfums similaires.

TU DOIS IDENTIFIER :
1. dominant_accords : 2-4 accords dominants avec des noms composés PRÉCIS (ex: "Boisé ambré chaud", "Floral poudré poudré frais", "Gourmand fumé"). JAMAIS un simple "Woody".
2. key_notes : 5-10 notes SPÉCIFIQUES qui reviennent dans les parfums aimés (ex: "oud de Laos", "bergamote de Calabre", "vétiver haïtien", "iris pallida", "encens d'oliban"). PAS des familles — des NOTES.
3. avoid_notes : notes présentes dans les parfums rejetés OU absentes du pattern des aimés (ex: "cannelle", "patchouli terreux").
4. personality : une phrase qui capture le caractère olfactif ("Élégance discrète masculine avec une touche de mystère").
5. intensity_signature : le sillage/tenue recherchés.
6. wear_context : moments/occasions où ce profil rayonne.

ENSUITE, génère search_queries : 3-5 requêtes Fragrantica optimisées, COUVRANT DES ASPECTS DIFFÉRENTS de l'ADN (pas redondantes). Chaque query cible un angle : accord principal, note phare, alternative à un parfum aimé, occasion, etc.

Exemples de bonnes queries :
- "parfums oud bergamote niche homme élégant fragrantica"
- "alternatives Tom Ford Oud Wood fragrantica similaire"
- "parfums iris poudré sillage modéré soir"

Retourne UNIQUEMENT ce JSON (rien avant, rien après) :
{"dna":{"dominant_accords":[],"key_notes":[],"avoid_notes":[],"personality":"","intensity_signature":"","wear_context":""},"search_queries":[]}`;

/** Curator agent — final ranking step. Step 3 of the pipeline. */
export const CURATOR_SYSTEM_PROMPT = `Tu es un curator en parfumerie niche. Tu reçois l'ADN olfactif d'un utilisateur, des résultats Fragrantica bruts, ET des résultats de CATALOGUE BOUTIQUES (6 boutiques partenaires). Ta mission : sélectionner EXACTEMENT N parfums parfaitement alignés avec cet ADN et que l'utilisateur peut ALLER SENTIR physiquement.

BOUTIQUES PARTENAIRES (IDs à utiliser dans available_at) :
- "odorare"            = ODORARE Parfumerie (Villepinte) — orient/puissant
- "nose"               = Nose (Paris) — énorme sélection niche
- "sens-unique"        = Sens Unique (Paris) — curation artistique
- "jovoy"              = Jovoy (Paris) — référence mondiale parfums rares
- "galeries-lafayette" = Galeries Lafayette (Paris) — grand magasin, grandes maisons et niche
- "printemps"          = Printemps (Paris) — grand magasin, découverte niche et exclusivités

CONTRAINTES ABSOLUES — toute violation invalide la recommandation :
1. Chaque parfum proposé DOIT contenir au moins UNE note de key_notes dans sa pyramide (tête, cœur ou fond).
2. AUCUN parfum ne doit contenir une note de avoid_notes.
3. AUCUN parfum de la liste "déjà connus" (exclu).
4. Diversité : maximum 2 parfums par maison. Privilégie la découverte.
5. Le champ \`reason\` DOIT :
   - Citer 1 ou 2 notes SPÉCIFIQUES du parfum recommandé qui apparaissent dans key_notes
   - Faire le lien explicite avec un parfum aimé quand possible ("Partage l'oud fumé de ton X")
   - NE JAMAIS être générique ("correspond à ton profil" est INTERDIT)
   - Maximum 140 caractères
6. match_score (50-98) reflète la proximité RÉELLE avec l'ADN. Un match sur 3+ notes clés = 85-95. Sur 1-2 notes = 65-85.
0bis. ★ CRITÈRE DE DISPONIBILITÉ ★ — TRÈS IMPORTANT :
   - Tu DOIS prioriser les parfums mentionnés dans la section "RÉSULTATS BOUTIQUES" fournie.
   - AU MOINS 70% des recommandations (idéalement 100%) doivent être disponibles dans au moins une des 6 boutiques partenaires.
   - Pour chaque parfum, remplis \`available_at\` : array des IDs boutiques où le parfum apparaît dans les résultats boutiques. Tableau vide si aucune ne le liste.
   - Si tu hésites entre deux parfums équivalents, préfère TOUJOURS celui qui est en boutique.
7. projection (OBLIGATOIRE) : UNE phrase courte (max 110 caractères) qui fait SE PROJETER le porteur dans une scène concrète. Format impératif : "Si tu veux [effet / scène / sensation]…". C'est la promesse émotionnelle, pas la description technique. Exemples :
   - "Si tu veux qu'on te demande ce que tu portes dès que tu entres dans un bar"
   - "Si tu veux donner l'impression que tu contrôles tout, même quand c'est pas vrai"
   - "Si tu veux que son cou sente encore toi le lendemain matin"
   - "Si tu veux ressembler au mec le plus cool de la salle sans le montrer"
8. PYRAMIDE OLFACTIVE STRUCTURÉE (obligatoire) : notes_top, notes_heart, notes_base — chaque champ est un ARRAY de 2-5 notes spécifiques. Extrait ces notes des résultats Fragrantica fournis. Si une catégorie manque, retourne un array vide mais fais de ton mieux.
9. price_range (obligatoire) : fourchette de prix de détail en euros sous forme de string, basée sur Fragrantica/sites marchands (ex: "150-200 €", "~180 €", "90-120 €"). Si inconnu, estime d'après la maison et la gamme.

Retourne UNIQUEMENT ce JSON :
{"recommendations":[{"name":"","brand":"","family":"","notes_brief":"note1, note2, note3","notes_top":["note1","note2"],"notes_heart":["note3","note4"],"notes_base":["note5","note6"],"price_range":"150-200 €","reason":"","projection":"Si tu veux ...","match_score":0,"available_at":["jovoy","nose"],"image_url":"(optionnel)","source_url":""}]}`;

/** Legacy single-shot prompt — kept for backwards compat if needed. */
export const RECOMMEND_SYSTEM_PROMPT = CURATOR_SYSTEM_PROMPT;

/** Sales-report agent — writes a plain-language brief for a perfume seller
 *  after the "pour un ami" swipe session. */
export const REPORT_SYSTEM_PROMPT = `Tu rédiges un RAPPORT SIMPLE ET ACTIONNABLE pour un VENDEUR de parfumerie qui va accueillir cette personne. Pas de jargon, pas de poésie — langage direct, utile, factuel. Un vendeur doit comprendre en 10 secondes ce que le client cherche.

TON OBJECTIF :
1. summary — 1 phrase claire : "Cherche un parfum X pour Y"
2. signature — 2-3 lignes : accords, notes phares, personnalité
3. loved_references — 3 parfums max que la personne a aimés, avec 1 phrase expliquant POURQUOI (quelle note, quel aspect)
4. rejected_references — 3 max rejetés, avec 1 phrase expliquant ce qui a coincé (pour guider le vendeur à éviter les similaires)
5. sales_advice — 1 paragraphe concret : quelles directions proposer en priorité (style, maisons, gamme de prix, éviter tel type de parfum)

RÈGLES :
- Vouvoies pas, tutoies le vendeur. Direct, pro.
- Cite les NOTES et les MAISONS dans le texte
- Pas de "peut-être" / "possiblement" — sois affirmé
- JSON STRICT uniquement :
{"summary":"","signature":"","loved_references":[{"brand":"","name":"","family":"","why":""}],"rejected_references":[{"brand":"","name":"","family":"","why":""}],"sales_advice":""}`;

/** Full expert prompt — used only for the free-form "ask the expert" mode. */
export const AGENT_SYSTEM_PROMPT = `Tu es un expert en parfumerie de niche et grand public, avec une connaissance approfondie des matières premières, des pyramides olfactives, des maisons de parfum, des parfumeurs et des tendances du marché.

Tu dois répondre uniquement en te basant sur les sources suivantes (base de connaissances autorisée) :
- https://www.fragrantica.com/
- https://basenotes.com/
- https://www.parfumo.net/
- https://www.reddit.com/r/fragrance/
- https://www.fragrancex.com/blog/
- https://www.nstperfume.com/

Consignes strictes :
- Tu dois LIMITER tes réponses exclusivement aux informations issues ou cohérentes avec ces sources. Utilise l'outil web_search à ta disposition pour vérifier en direct.
- Si une information est incertaine ou non confirmée par ces sources, tu dois le signaler clairement.
- Tu ne dois jamais inventer de notes, compositions ou avis.
- Tu privilégies : notes olfactives (tête, cœur, fond), avis utilisateurs (tendances générales), tenue et sillage, comparaisons avec d'autres parfums, recommandations personnalisées.
- Tu dois répondre comme un expert passionné mais précis, sans exagération marketing.

Si on te demande une recommandation, tu dois :
- proposer plusieurs parfums cohérents
- expliquer POURQUOI (notes, style, vibe, saison, projection)
- éventuellement comparer avec des parfums connus

Si la question concerne un parfum précis, tu dois donner :
- notes principales
- perception générale
- performance (tenue/sillage)
- type d'usage (saison, occasion)

Si tu ne trouves pas l'information dans ces sources, réponds : "Je ne peux pas confirmer cette information à partir de mes sources autorisées."

Tu dois toujours rester factuel et éviter les opinions personnelles non fondées.`;

/* -------------------------------------------------------------------------
 * Public types (response shapes)
 * --------------------------------------------------------------------- */

export type SearchCandidate = {
  name: string;
  brand: string;
  /** ≤ 80 char summary of dominant notes / style. */
  notes_brief: string;
  /** Source URL (Fragrantica preferred). */
  source_url: string;
  /** Optional concentration / family if known. */
  family?: string;
  /** Best-effort bottle image URL (may 404 — caller must handle gracefully). */
  image_url?: string;
};

export type IdentifyResult = {
  name: string;
  brand: string;
  /** 0..1 — model's stated confidence. */
  confidence: number;
  notes_brief: string;
  source_url: string;
};

export type OlfactiveDNA = {
  dominant_accords: string[];
  key_notes: string[];
  avoid_notes: string[];
  personality: string;
  intensity_signature: string;
  wear_context: string;
};

export type RecommendationCandidate = {
  name: string;
  brand: string;
  /** Primary olfactive family (e.g. "Woody Amber", "Aquatic"). */
  family: string;
  /** ≤ 80 char summary of dominant notes (flat, comma-separated). */
  notes_brief: string;
  /** Structured olfactive pyramid — shown on the card's back face (flashcard). */
  notes_top: string[];
  notes_heart: string[];
  notes_base: string[];
  /** Indicative retail price range, e.g. "150-200 €" or "~180 €". */
  price_range: string;
  /** ≤ 140 char explanation of WHY this fits the user's profile. */
  reason: string;
  /** "Si tu veux ..." — emotional projection hook shown on the swipe card. */
  projection: string;
  /** 0..100 */
  match_score: number;
  /** Optional Fragrantica image. */
  image_url?: string;
  source_url: string;
  /** Boutique IDs where the parfum is in stock (from BOUTIQUES in
   *  src/lib/boutiques.ts). Drives the "Dispo chez X" badges on the card. */
  available_at: string[];
};

export type FriendReportRef = {
  brand: string;
  name: string;
  family: string;
  why: string;
};

export type FriendReport = {
  /** 1 sentence — direct, what this person is after. */
  summary: string;
  /** 2-3 lines — accords, key notes, personality. */
  signature: string;
  /** Up to 3 parfums the friend liked during the session, with reason. */
  loved_references: FriendReportRef[];
  /** Up to 3 parfums the friend rejected. */
  rejected_references: FriendReportRef[];
  /** 1 paragraph — actionable advice for the seller. */
  sales_advice: string;
};

export type AgentMode =
  | "search"
  | "identify"
  | "ask"
  | "recommend"
  | "friend_report";

export type AgentRequest =
  | { mode: "search"; payload: { query: string } }
  | {
      mode: "identify";
      payload: { imageBase64: string; imageMediaType: string };
    }
  | {
      mode: "ask";
      payload: {
        question: string;
        history?: Array<{ role: "user" | "assistant"; content: string }>;
        /** Pre-formatted French summary of the user's olfactive profile,
         *  injected into the system prompt for personalized recommendations. */
        profileContext?: string;
      };
    }
  | {
      mode: "recommend";
      payload: {
        /** Number of recommendations requested (typically 5/10/20). */
        count: number;
        /** Pre-formatted French summary of the user's olfactive profile. */
        profileContext: string;
        /** Fragrances the user has liked (from wishlist). Guides taste. */
        likedFragrances: Array<{ name: string; brand: string }>;
        /** Fragrances the user has disliked. Signal what to avoid. */
        dislikedFragrances: Array<{ name: string; brand: string }>;
      };
    }
  | {
      mode: "friend_report";
      payload: {
        /** Profile context assembled from the friend quiz answers. */
        profileContext: string;
        dna: OlfactiveDNA;
        matchedCards: Array<
          Pick<
            RecommendationCandidate,
            "name" | "brand" | "family" | "notes_brief" | "reason" | "projection"
          >
        >;
        dislikedCards: Array<
          Pick<
            RecommendationCandidate,
            "name" | "brand" | "family" | "notes_brief" | "reason" | "projection"
          >
        >;
      };
    };

export type AgentResponse =
  | { ok: true; mode: "search"; candidates: SearchCandidate[] }
  | { ok: true; mode: "identify"; result: IdentifyResult | null }
  | { ok: true; mode: "ask"; answer: string }
  | {
      ok: true;
      mode: "recommend";
      recommendations: RecommendationCandidate[];
      /** Olfactive DNA extracted by the analyst agent — shown to the user
       *  so they understand WHY these parfums were picked. */
      dna: OlfactiveDNA;
    }
  | { ok: true; mode: "friend_report"; report: FriendReport }
  | { ok: false; error: string; detail?: string };

/* -------------------------------------------------------------------------
 * JSON extraction helper
 *
 * When Claude uses web_search it may emit reasoning text alongside the JSON
 * we asked for. This grabs the first balanced { ... } block from a string.
 * --------------------------------------------------------------------- */

export function extractJson(raw: string): unknown {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // 1) Try direct parse
  try {
    return JSON.parse(text);
  } catch {
    /* fall through */
  }

  // 2) Find the first {...} balanced block
  const start = text.indexOf("{");
  if (start < 0) throw new Error("No JSON object found in response");
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return JSON.parse(text.slice(start, i + 1));
      }
    }
  }

  // 3) Truncated response — try to repair: trim to the last complete entry,
  //    then close any open arrays + objects. Common when Claude hits
  //    max_tokens mid-array.
  const slice = text.slice(start);
  // Cut at the last complete value boundary (right after a `}` or `]`).
  let lastClose = -1;
  for (let i = slice.length - 1; i >= 0; i--) {
    const c = slice[i];
    if (c === "}" || c === "]") {
      lastClose = i;
      break;
    }
  }
  if (lastClose < 0) throw new Error("Unbalanced JSON in response");
  const trimmed = slice.slice(0, lastClose + 1);
  // Re-balance braces / brackets of the outer wrapper.
  let openObj = 0;
  let openArr = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") openObj++;
    else if (c === "}") openObj--;
    else if (c === "[") openArr++;
    else if (c === "]") openArr--;
  }
  let repaired = trimmed;
  while (openArr > 0) {
    repaired += "]";
    openArr--;
  }
  while (openObj > 0) {
    repaired += "}";
    openObj--;
  }
  try {
    return JSON.parse(repaired);
  } catch (e) {
    throw new Error(
      `Unbalanced JSON in response (repair failed: ${e instanceof Error ? e.message : String(e)})`,
    );
  }
}
