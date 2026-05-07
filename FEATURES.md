# La Niche — Features v2

App professionnelle pour boutique de parfumerie de niche : **profils olfactifs IA**, **fiches clients**, **newsletter intelligente** par email/SMS.

Branche `master` = v2 (en prod). Branche `legacy-v1` = ancienne version archivée et toujours fonctionnelle (tables Supabase préservées).

---

## 🏪 Côté boutique

### 1. Pour un client — questionnaire dynamique → rapport IA

**Route** : `/pour-un-client`

Flow :
1. **Temps dispo** — la boutique demande au client combien de minutes il veut consacrer (Express 3 min / Classique 5-7 min / Complet 10 min). Plus le client en donne, plus le vendeur niche finement → moins de risque qu'il reparte avec un parfum à 200 € qu'il ne portera jamais.
2. **Identité** — prénom + nom du client.
3. **Questionnaire** — questions QCM filtrées selon le temps dispo (5 / 9 / 14 questions). Tap sur un mot = sélectionne. Long-press sur un mot technique = mini-fiche IA qui l'explique en langage simple.
4. **Contact** — email + téléphone + canal préféré (email, SMS, ou les deux) + consentement marketing.
5. **Rapport vendeur** affiché inline en fin de wizard, généré par l'IA :
   - **Synthèse** (1 phrase) + signature olfactive (2-3 lignes)
   - **ADN olfactif** : familles dominantes, accords, notes phares, notes à éviter, sillage, occasions, personnalité
   - **3-5 références qui devraient lui parler** : parfums RÉELS (mainstream + niche) avec une phrase concrète citant les notes qui matchent
   - **2-3 références à éviter de pitcher** + raison
   - **Conseil vente** : maisons à privilégier, gamme de prix, intensité, etc.
6. La fiche est sauvegardée dans `clients_v2`, retrouvable dans Mes clients.

### 2. Mes clients — calendrier + filtres + détail

**Route** : `/clients`

- **Vue calendrier** avec un point sur chaque date qui a au moins un nouveau client (powered by `react-day-picker`).
- **Filtres** : recherche libre (nom / prénom / email), source (en boutique / depuis compte user), canal (email / SMS / les deux), date sélectionnée.
- **Distinction visuelle** : badge "Boutique" (rempli en magasin) vs "Compte" (rempli depuis l'app user) sur chaque ligne.
- **Horodatage relatif** : "il y a 3 min", "il y a 2 j", etc.
- **Fiche détaillée** (`/clients/[id]`) : rapport IA complet + édition contact / canal / notes / consentement / suppression.

### 3. Newsletter IA — cœur de l'app

**Route** : `/newsletter`

Flow :
1. **Choix d'un parfum** dans le stock de la boutique.
2. **Choix du nombre de destinataires** (presets 10 / 20 / 50 / 100 ou saisie libre).
3. **Scoring hybride** :
   - Pass déterministe : compare le profil olfactif de chaque client (familles, notes, accords) au parfum choisi. Pondération `family×3 + key_notes×2 + accords×1 - avoid_notes×4`.
   - Pass IA : pour les top N candidats, l'IA génère une phrase qui justifie pourquoi ce client va aimer (citant 1-2 notes spécifiques).
   - Filtres durs : exclure les clients sans consentement marketing, sans canal joignable.
4. **Preview du panel** + brouillon email + brouillon SMS générés par l'IA (le vendeur peut éditer avant d'envoyer).
5. **Envoi fan-out** :
   - Emails via **Resend** (avec personnalisation `{{firstName}}`)
   - SMS via **Twilio** (numéros FR auto-normalisés en `+33...`)
   - Tracking par destinataire dans `newsletter_recipients` (statut pending / sent / failed / skipped).

### 4. Stock parfums — CRUD + import CSV IA

**Routes** : `/newsletter/stock`, `/newsletter/stock/import`

- CRUD manuel d'un parfum : nom, marque, famille, notes (tête / cœur / fond), accords, description, image URL, prix, disponibilité.
- **Import CSV** alimenté par l'IA :
  - Format minimal : `name,brand`. Optionnel : `price`, `description`. Headers FR tolérés (`nom`, `marque`, `prix`).
  - Pour chaque ligne, l'IA **corrige les fautes d'orthographe** ("Tomb ford" → "Tom Ford") et **enrichit** automatiquement avec famille + pyramide de notes + accords + description.
  - Traitement par lots de 5 pour optimiser le coût LLM. Plafond 200 parfums par import.
  - Idempotent : ré-importer le même CSV met à jour, pas de doublon.

### 5. Settings — questionnaire drag-and-drop

**Route** : `/settings/questions`

- **Drag-and-drop** (`@dnd-kit`) pour réordonner les questions du questionnaire.
- CRUD complet : ajouter / éditer / supprimer une question.
- 6 types de questions disponibles : `text` libre, `single` (choix unique), `multi` (choix multiple), `scale` (échelle 1-5), `email`, `phone`.
- L'ordre est respecté côté wizard ; le filtre "temps dispo" prend les N premières questions non-email/phone.

---

## 👤 Côté utilisateur

### Login → Choix boutique → Formulaire

**Routes** : `/login`, `/choix-boutique`, `/boutique/[shopId]/formulaire`

- Connexion Supabase (email / mot de passe, magic link).
- Liste publique des boutiques partenaires sur `/choix-boutique`.
- Le client remplit le **même questionnaire** que celui de la boutique (mêmes questions configurées dans Settings boutique).
- À la soumission : la fiche atterrit dans Mes clients de la boutique avec le badge "Compte" (distincte des fiches "Boutique" remplies en magasin).

---

## 🌸 Catégories olfactives utilisées

Référentiel partagé par le questionnaire, le scoring newsletter, et le générateur de rapport IA.

### Familles olfactives
| Famille | Description rapide |
|---|---|
| Floral | Fleurs blanches, roses, jasmin, fleur d'oranger |
| Boisé | Cèdre, santal, vétiver, oud |
| Oriental | Épices chaudes, résines, ambre |
| Ambré | Vanille, benjoin, labdanum |
| Hespéridé | Agrumes — bergamote, citron, pamplemousse, mandarine |
| Fougère | Lavande + mousse + coumarine, classique masculin |
| Chypré | Bergamote + rose + mousse de chêne — élégant et boisé |
| Cuir | Suède, daim, cuir fumé |
| Gourmand | Vanille, caramel, praliné, chocolat, fève tonka |
| Aromatique | Herbes — basilic, romarin, menthe, sauge |
| Aquatique | Iodé, marin, salé, frais |
| Poudré | Iris, violette, héliotrope, rendu cosmétique |
| Vert | Galbanum, herbe coupée, sève |
| Fruité | Pêche, poire, cassis, pomme, fruits rouges |
| Iodé | Marin, embruns, sel |
| Musqué | Musc blanc, animal, peau |

### Accords composés (questionnaire Q3)
- Boisé ambré
- Floral poudré
- Iris poudré
- Oud oriental
- Vanille gourmande
- Cuir fumé
- Cuir suédé
- Musc blanc
- Encens résineux
- Vétiver vert
- Patchouli sombre
- Néroli solaire

### Notes utilisées dans les QCM (Q4 et Q5)
Vanille · Oud · Bergamote · Rose · Jasmin · Iris · Patchouli · Cèdre · Santal · Ambre · Musc · Cuir · Encens · Vétiver · Néroli · Tabac · Fève tonka · Cardamome

### Sillage (échelle 1-5)
1. Discret · 2 · 3. Modéré · 4 · 5. Enveloppant

### Tenue (échelle 1-5)
1. Quelques heures · 2 · 3 · 4 · 5. Toute la journée

### Occasions
Tous les jours · Travail · Soir / sortie · Vacances · Occasion spéciale

### Saisons
Printemps · Été · Automne · Hiver · Toute l'année

### Styles olfactifs
Classique et raffiné · Moderne et original · Audacieux et marquant · Discret et élégant · Confidentiel / niche

### Budgets
Moins de 80 € · 80 à 150 € · 150 à 250 € · Plus de 250 € · Pas de budget particulier

### Concentrations
Eau de toilette · Eau de parfum · Extrait de parfum · Peu importe

### Genres
Pour homme · Pour femme · Mixte / unisexe

---

## 🛠 Stack technique

- **Next.js 16.2.3** (App Router, route handlers, Turbopack)
- **React 19**
- **Supabase** (Auth + Postgres + RLS)
- **Tailwind CSS 4**
- **@dnd-kit** (drag-and-drop questions)
- **react-day-picker** (calendrier clients)
- **date-fns** (formatage date)
- **Resend** (envoi email)
- **Twilio** (envoi SMS)
- **OpenRouter** (Gemini 2.0 Flash → fallback Gemini 1.5 → fallback GPT-4o-mini)

---

## 🗄 Schéma DB (`migrations/2026-05-07-v2-schema.sql`)

| Table | Rôle |
|---|---|
| `shops` | Boutiques (préservée v1, convention `shops.id = auth.uid()`) |
| `clients_v2` | Fiches clients v2 (séparée de la `boutique_clients` legacy pour ne pas casser legacy-v1) |
| `shop_questions` | Questionnaire dynamique propre à chaque boutique |
| `shop_perfumes` | Stock parfums boutique |
| `newsletter_campaigns` | Une ligne par envoi de newsletter |
| `newsletter_recipients` | Détail par destinataire (score, canal, statut, erreur) |

RLS partout : un compte boutique ne lit/écrit que ses propres lignes (`shop_id = auth.uid()`).

---

## 📡 Routes API

| Route | Méthodes | Rôle |
|---|---|---|
| `/api/shops` | GET | Liste publique des boutiques |
| `/api/shops/[id]/questions` | GET | Lecture publique du questionnaire d'une boutique |
| `/api/shops/me/questions` | GET, POST, PUT | CRUD + reorder bulk |
| `/api/shops/me/questions/[id]` | PATCH, DELETE | Édit / suppression d'une question |
| `/api/clients` | GET, POST | Liste filtrée + création (avec génération IA du rapport) |
| `/api/clients/[id]` | GET, PATCH, DELETE | Fiche + édition contact / canal / notes |
| `/api/perfumes` | GET, POST | Liste + création parfum |
| `/api/perfumes/[id]` | PATCH, DELETE | Édition parfum |
| `/api/perfumes/import` | POST | Import CSV avec enrichissement IA |
| `/api/newsletter/preview` | POST | Scoring + preview du panel + draft email/SMS |
| `/api/newsletter/send` | POST | Fan-out réel (Resend + Twilio) |
| `/api/explain` | GET | Explication IA d'un terme technique (cache mémoire 80 termes) |

---

## 🌳 Branches

- **`master`** = v2 en prod (ce repo).
- **`legacy-v1`** (local + origin) = v1 entière intacte (concours, balade, scan, recommandations, wishlist, abonnement PayPal). Sert de backup et reste fonctionnelle car la migration v2 est **non-destructive** sur les tables v1.
