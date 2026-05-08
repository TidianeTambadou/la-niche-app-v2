# Pricing Gallery La Niche v2.1 — 3 abonnements mensuels

> Objectif : marge brute ≥ 50 % sur chaque tier, **incluant le coût hardware**
> (tablette installée 150 € HT/unité).
> Logique : SaaS + tablette tout inclus, **engagement 12 mois** pour amortir
> le hardware. Newsletter **email-only** (le SMS Twilio a été retiré pour
> simplifier l'offre et concentrer la valeur sur la délivrabilité email).

---

## 1. Modèle de coûts (par boutique / mois)

### Coûts unitaires

| Poste | Fournisseur | Coût unitaire |
|---|---|---|
| **Tablette installée** (one-time) | Hardware + setup | **150 € / tablette** |
| LLM — fiche client | OpenRouter / Claude Haiku 4.5 | **0,005 €** par fiche |
| LLM — newsletter | OpenRouter / Claude Haiku 4.5 | **0,02 €** par campagne |
| LLM — import CSV stock | OpenRouter / Claude Haiku 4.5 | **0,001 €** par parfum |
| Email transactionnel | Resend | **0,0004 €** par email |
| Infra mutualisée (Supabase Pro + Vercel Pro) | — | **1–5 €** par boutique |

### Hypothèses

- **Engagement 12 mois minimum** pour pouvoir amortir la tablette à 150 €.
- Newsletter **email uniquement** — les clients sans email sont automatiquement
  filtrés à l'envoi.
- Tous les prix sont **HT**.
- Le coût hardware est amorti linéairement sur 12 mois → **12,50 € / mois /
  tablette** intégrés à la marge.

---

## 2. Les 3 tiers

### 🌱 Starter — 39 € / mois HT *(engagement 12 mois)*

**Pour qui ?** Une boutique qui démarre, mono-point, peu de fichier client.

**Inclus :**
- **1 tablette installée** (configurée, livrée, prête à l'emploi)
- 1 boutique, 1 utilisateur
- **100 fiches client / mois**
- **2 newsletters / mois**, jusqu'à 200 destinataires
- Quota envois : **500 emails / mois**
- Stock parfums illimité + import CSV
- Mode vocal (conciergerie + reformule newsletter)
- Support communautaire

**Calcul de marge sur 12 mois :**
| Poste | Calcul | Total 12 mois |
|---|---|---|
| Revenu | 39 × 12 | **468 €** |
| LLM + emails + infra | 1,82 € × 12 | 22 € |
| Tablette (CapEx) | 1 × 150 | 150 € |
| **Coût total** | | **172 €** |

**Marge brute : (468 − 172) / 468 = 63 %** ✅

---

### 🌿 Croissance — 99 € / mois HT *(engagement 12 mois — le plus populaire)*

**Pour qui ?** Boutique établie, fichier client actif, qui veut industrialiser
la relation et équiper plusieurs postes.

**Inclus :**
- **2 tablettes installées** (ex : comptoir + back-office, ou 2 vendeurs)
- 1 boutique, 3 utilisateurs
- **400 fiches client / mois**
- **6 newsletters / mois**, jusqu'à 1 000 destinataires
- Quota envois : **5 000 emails / mois**
- Conciergerie IA questionnaire
- Reformule vocale newsletter à volonté
- Programmation différée + statistiques ouverture/clic
- Support email prioritaire (< 24 h)

**Calcul de marge sur 12 mois :**
| Poste | Calcul | Total 12 mois |
|---|---|---|
| Revenu | 99 × 12 | **1 188 €** |
| LLM + emails + infra | 6,12 € × 12 | 73 € |
| Tablettes (CapEx) | 2 × 150 | 300 € |
| **Coût total** | | **373 €** |

**Marge brute : (1 188 − 373) / 1 188 = 69 %** ✅

---

### 🌳 Premium — 249 € / mois HT *(engagement 12 mois)*

**Pour qui ?** Chaîne 2-3 boutiques ou mono-point avec plusieurs postes
(vitrine + atelier + nomade).

**Inclus :**
- **3 tablettes installées** (1 par boutique ou multi-postes en mono-shop)
- Jusqu'à 3 boutiques, utilisateurs illimités
- Fiches client illimitées
- Newsletters illimitées (≤ 5 000 dest. / envoi)
- Quota envois : **20 000 emails / mois**
- Onboarding visio 1 h
- Branding personnalisable (logo, couleurs emails)
- Account manager dédié, SLA 4 h
- A/B testing objet, accès avant-première

**Calcul de marge sur 12 mois :**
| Poste | Calcul | Total 12 mois |
|---|---|---|
| Revenu | 249 × 12 | **2 988 €** |
| LLM + emails + infra | 18,24 € × 12 | 219 € |
| Tablettes (CapEx) | 3 × 150 | 450 € |
| **Coût total** | | **669 €** |

**Marge brute : (2 988 − 669) / 2 988 = 78 %** ✅

---

### 🔧 Add-on : Tablette supplémentaire — +29 € / mois HT / tablette

Disponible sur **n'importe quel tier**, engagement 12 mois aligné.

**Calcul de marge sur 12 mois (par tablette) :**
| Poste | Calcul | Total |
|---|---|---|
| Revenu | 29 × 12 | **348 €** |
| Tablette (CapEx) | 1 × 150 | 150 € |
| Surcoût variable (≈ négligeable) | — | 0 € |
| **Coût total** | | **150 €** |

**Marge brute : (348 − 150) / 348 = 57 %** ✅

> Pourquoi 29 € et pas 39 € ? Une tablette additionnelle ne consomme **pas plus
> de quota LLM/email** — c'est juste un écran de plus pour les vendeurs. Le
> coût marginal est uniquement le hardware, donc on peut être agressif sur le
> prix.

---

## 3. Vue synthétique

| | Starter | Croissance | Premium | + Tablette |
|---|---|---|---|---|
| **Prix HT / mois** | 39 € | 99 € | 249 € | +29 €/tablette |
| **Tablettes incluses** | 1 | 2 | 3 | +1 par add-on |
| **Engagement** | 12 mois | 12 mois | 12 mois | 12 mois |
| **Revenu sur 12 mois** | 468 € | 1 188 € | 2 988 € | 348 € |
| **Coût total sur 12 mois** | 172 € | 373 € | 669 € | 150 € |
| **Marge brute 12 mois** | **63 %** | **69 %** | **78 %** | **57 %** |

---

## 4. Comparatif détaillé feature par feature

### 🖥 Hardware & installation

| | Starter | Croissance | Premium |
|---|---|---|---|
| Tablettes incluses | **1** | **2** | **3** |
| Installation + configuration | ✅ | ✅ | ✅ |
| Tablettes additionnelles | +29 €/mois | +29 €/mois | +29 €/mois |
| Remplacement matériel sur panne | À tarif | Inclus 1×/an | **Inclus illimité** |
| Reprise de la tablette en fin de contrat | Décote 50 € | Décote 50 € | Décote 50 € |

### 🏪 Boutique & comptes

| | Starter | Croissance | Premium |
|---|---|---|---|
| Nombre de boutiques | **1** | **1** | **3** |
| Utilisateurs par compte | **1** | **3** | **illimité** |
| Rôles & permissions | — | — | ✅ |
| Branding personnalisé (logo, couleur emails) | — | — | ✅ |
| Sous-domaine personnalisé `boutique.gallerylaniche.app` | — | ✅ | ✅ |

### 👤 « Pour un client » (questionnaire + rapport olfactif IA)

| | Starter | Croissance | Premium |
|---|---|---|---|
| Fiches client générées / mois | **100** | **400** | **illimité** |
| Au-delà du quota | 0,05 € / fiche | 0,05 € / fiche | inclus |
| Questionnaire dynamique (drag-drop) | ✅ | ✅ | ✅ |
| Conciergerie IA (édition vocale du questionnaire) | ✅ | ✅ | ✅ |
| Nombre max de questions | **15** | **30** | **illimité** |
| Profil olfactif détaillé (familles, notes, accords) | ✅ | ✅ | ✅ |
| Rapport vendeur (suggestions IA) | ✅ | ✅ | ✅ |
| Export PDF de la fiche | — | ✅ | ✅ |

### 👥 Mes clients (CRM)

| | Starter | Croissance | Premium |
|---|---|---|---|
| Calendrier visuel des fiches | ✅ | ✅ | ✅ |
| Filtres (date / source / canal / recherche) | ✅ | ✅ | ✅ |
| Édition des fiches | ✅ | ✅ | ✅ |
| Tags personnalisés | — | ✅ (10 max) | illimité |
| Export CSV du fichier client | — | ✅ | ✅ |
| Historique des interactions | 90 jours | **2 ans** | **illimité** |

### 💎 Stock parfums

| | Starter | Croissance | Premium |
|---|---|---|---|
| Nombre de parfums en stock | **illimité** | **illimité** | **illimité** |
| CRUD manuel (création, édition, suppression) | ✅ | ✅ | ✅ |
| Import CSV en masse | ✅ (200/import) | ✅ (200/import) | ✅ (1 000/import) |
| Enrichissement IA auto (notes, accords, descr.) | ✅ | ✅ | ✅ |
| Image personnalisée | ✅ | ✅ | ✅ |

### 📧 Newsletter IA *(email-only)*

| | Starter | Croissance | Premium |
|---|---|---|---|
| Newsletters envoyées / mois | **2** | **6** | **illimité** |
| Destinataires max par envoi | **200** | **1 000** | **5 000** |
| Mode « Par parfum » (scoring IA + drafting) | ✅ | ✅ | ✅ |
| Mode « Message libre » (annonce / horaires / event) | ✅ | ✅ | ✅ |
| Reformule vocale du brouillon | ✅ | ✅ | ✅ |
| Reformules par campagne | **3 max** | **illimité** | **illimité** |
| A/B testing de l'objet | — | — | ✅ |
| Programmation différée (envoi à H+) | — | ✅ | ✅ |
| Statistiques d'ouverture / clic | — | ✅ | ✅ |

### 📤 Quotas d'envoi inclus

| | Starter | Croissance | Premium |
|---|---|---|---|
| **Emails / mois** | **500** | **5 000** | **20 000** |
| Dépassement email | 0,001 € | 0,001 € | 0,0008 € |

### 🛠 Support & onboarding

| | Starter | Croissance | Premium |
|---|---|---|---|
| Documentation en ligne | ✅ | ✅ | ✅ |
| Support email | 72 h | **< 24 h** | **< 4 h** |
| Onboarding visio (1 h) | — | — | ✅ |
| Account manager dédié | — | — | ✅ |
| Accès anticipé aux nouveautés | — | — | ✅ |
| SLA contractuel | — | — | 99,5 % |

---

## 5. Hypothèses critiques & risques

### ✅ Ce qui rend la marge tenable
- **Engagement 12 mois obligatoire** : sécurise l'amortissement de la tablette
  (150 €). Sans ça, un churn à 1 mois nous fait perdre 100 €+ par client.
- **Email Resend** très bon marché (0,0004 € / envoi) → l'email ne pèse rien
  sur la marge même à 20 000 envois/mois sur Premium.
- **LLM Haiku 4.5** suffisant pour les tâches actuelles, coût marginal.
- **Plus de SMS** = plus de poste variable lourd → marges plus prévisibles et
  bien plus élevées qu'en v1 (63-78 % au lieu de 58-66 %).
- **Tablette additionnelle = pure marge** : pas de surconsommation LLM/email
  quand on ajoute un écran.

### ⚠️ Hardware : risque churn anticipé
- Si une boutique casse l'engagement avant 12 mois → on perd 100-150 € net.
- **Garde-fous** :
  - **Caution tablette 150 € HT** prélevée à la signature, **remboursée au
    retour de la tablette en fin de contrat** (clause incluse dans les CGV).
  - Reprise avec décote 50 € en fin de contrat (option) → la tablette est
    revendue ou refurbie pour le prochain client.

### ⚠️ Délivrabilité email
- 20 000 emails/mois sur Premium = exposition au filtrage spam si SPF/DKIM/
  DMARC mal configurés.
- **Garde-fous** : domaine `gallerylaniche.app` configuré chez Resend (DKIM
  signé), domaine de rebond séparé, monitoring des bounces et désabonnements
  via webhooks Resend. Au-delà de 5 % de bounces, on coupe l'envoi auto et on
  alerte la boutique.

### ⚠️ LLM : risque de dérive
- Bascule vers Claude Sonnet 4.6 (~5× plus cher) → coûts LLM triplent.
- **Garde-fou** : le `DEFAULT_MODEL` reste sur Haiku 4.5 dans `src/lib/llm.ts`.
  Toute évolution doit être validée contre ce modèle.

### ⚠️ Stripe / TVA
- Stripe : 1,4 % + 0,25 € par transaction → ~1,40 € sur Croissance,
  ~3,75 € sur Premium par mois.
- Sur 12 mois : ~17 € sur Croissance, ~45 € sur Premium → **marge réelle
  Premium ≈ 76 %**, toujours largement > 50 %.
- TVA 20 % collectée puis reversée, neutre pour la marge.

---

## 6. Pourquoi pas un freemium ?

- Coût marginal d'une fiche client (LLM + email) non-nul + tablette à 150 € →
  freemium full no-card crée une exposition aux abus et au gaspillage hardware.
- À la place : **essai 14 jours gratuit sur Croissance** *(sans tablette, démo
  via tablette de prêt si visite commerciale)*, sans CB. Conversion attendue
  ~15-20 %.

---

## 7. Annexe — comment je suis arrivé aux coûts unitaires

### Tablette (150 € HT)
- Tablette Android 10" type Lenovo Tab M10 / Samsung Galaxy Tab A9 :
  100-130 € HT en achat groupé.
- Setup (image, MDM, support stand, livraison) : ~20-30 €.
- Total **150 € HT / tablette** assumé prudemment.
- Amortissement : 150 € / 12 mois = **12,50 € / mois / tablette** ajoutés à la
  marge.

### LLM (Claude Haiku 4.5 via OpenRouter)
- Tarif officiel : ~0,80 $ / M tokens input, ~4 $ / M tokens output.
- Fiche client = ~2 000 tokens in + 1 500 out → ~0,008 $ ≈ **0,007 €**, arrondi
  à **0,005 €** car prompt système caché.
- Newsletter = scoring + drafting + reformules = ~5 000 in + 3 000 out →
  ~0,016 $ ≈ **0,02 €**.
- CSV import = 5 parfums / batch → ~0,002 € / parfum, arrondi à **0,001 €** car
  prompt partagé.

### Resend email
- Plan Resend Pro : 20 $ / mois pour 50 000 emails inclus → ~0,0004 €/envoi.
- Au-delà : 1 $ / 1 000 emails → ~0,001 €.
