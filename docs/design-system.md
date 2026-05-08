# DESIGN SYSTEM — Brutaliste Moderne × Parfumerie de Luxe

> Ce fichier est une référence normative pour Claude. Toute génération de composant, page ou interface pour ce projet **doit** respecter ces règles sans exception. Ne jamais dériver vers un style générique "Material Design", "shadcn default" ou "Tailwind starter".

---

## 0. Stack & écarts vs ce doc

Le doc d'origine évoquait `shadcn/ui` + `framer-motion` + `lucide-react`. La stack v2 actuelle utilise :

- **shadcn/ui** : non installé. On utilise du Tailwind brut + composants custom.
- **framer-motion** : explicitement viré au pivot v2 (cf. `memory/project_pivot_v2.md`). Toutes les animations passent par les keyframes CSS définis dans `globals.css`.
- **lucide-react** : non installé. Les icônes utilisent `material-symbols-outlined` via le composant `<Icon>` (`src/components/Icon.tsx`).

Toutes les autres règles du doc (typographie, palette, brutalist cards, grids, hero) **s'appliquent telles quelles**.

---

## 1. Philosophie Visuelle

L'esthétique cible est **"Brutaliste Moderne"** croisée avec les codes de la parfumerie de luxe française. Deux tensions coexistent délibérément :

- **Précision technique** → grilles, monospaces, données brutes, coordonnées, indices
- **Élégance minimaliste** → espace blanc généreux, typographie serif luxe, compositions épurées

Le produit (le parfum, la donnée olfactive) est toujours au centre. Rien dans l'UI ne doit le concurrencer visuellement.

---

## 2. Typographie

Trois familles. Trois rôles. Ne jamais les intervertir.

### 2.1 Inter — Titres Hero & UI générale
- Rôle : titres principaux, labels UI, boutons, navigation
- Poids : `font-black` (900) pour les heroes, `font-semibold` pour les labels
- Tracking : `tracking-tighter` sur les grands titres (≥ 3xl)
- Casse : `uppercase` autorisé pour les labels courts (nav, badges)

### 2.2 JetBrains Mono — Données techniques
- Rôle : identifiants de données, métadonnées, steps numérotés, logs, indices
- Usage : tout ce qui ressemble à `DATA_POINT://842`, `ACCORD_ID:034`, coordonnées GPS, timestamps
- Taille : toujours `text-xs` ou `text-sm`, jamais plus grand
- Ne jamais utiliser pour du texte courant

### 2.3 Cormorant Garamond — Touches luxe
- Rôle : citations, sous-titres secondaires, descriptions poétiques de parfums
- Style : toujours en `italic`, jamais bold
- Usage **parcellaire** — maximum 1 occurrence par section
- Évoque l'héritage de la parfumerie française

### Polices chargées
- Inter & JetBrains Mono : via `next/font/google` dans `src/app/layout.tsx` (`--font-inter`, `--font-jetbrains-mono`).
- Cormorant Garamond : via `next/font/google` dans `src/app/layout.tsx` (`--font-cormorant`).

### Classes Tailwind utilisables
- `font-sans` (= Inter) — par défaut
- `font-mono` (= JetBrains Mono)
- `font-cormorant` (= Cormorant Garamond italic)

---

## 3. Palette de Couleurs

### Règle fondamentale : Monochrome strict

| Token CSS | Hex | Usage |
|---|---|---|
| `bg-background` | `#FFFFFF` | Fond de page |
| `text-on-background` / `border-black` | `#000000` | Texte principal, bordures, icônes |
| `text-on-background/40` | 40 % noir | Labels secondaires, séparateurs |
| `text-on-background/60` | 60 % noir | Sous-titres, métadonnées |
| `bg-on-background/5` | 5 % noir | Fond de carte légèrement grisé |

**Aucune couleur d'accent.** Seules variations autorisées : niveaux d'opacité du noir sur blanc.

Dark mode : inversion stricte (`#0A0A0A` ↔ `#FAFAFA`), tous les `bg-black` deviennent `bg-on-background` pour respecter l'inversion automatique via tokens CSS.

---

## 4. Éléments Graphiques Clés

### 4.1 Grid Background
Grille de points techniques + dégradé radial central pour focaliser le contenu.

→ Composant : `<GridBackground />` dans `src/components/brutalist/GridBackground.tsx`.
Toujours en `position: fixed`, derrière le contenu (`z-0`).

### 4.2 Brutalist Cards
Bordures noires épaisses + ombre décalée pleine. **Signature visuelle du système.**

→ Composant : `<BrutalistCard>` dans `src/components/brutalist/BrutalistCard.tsx`.

Variantes d'ombre :
- `hero` — `shadow-[8px_8px_0px_0px_currentColor]` (la plus forte)
- `default` — `shadow-[4px_4px_0px_0px_currentColor]`
- `subtle` — `shadow-[20px_20px_0px_0px_rgba(0,0,0,0.05)]`

Toutes les cards : **`rounded-none`** (jamais d'arrondi), `border-2 border-on-background`.

### 4.3 Lignes de structure (filets)
Séparateurs 2px noir, utilisés pour guider la lecture.

```tsx
<div className="w-full h-[2px] bg-on-background my-8" />
<div className="w-16 h-[2px] bg-on-background mb-4" />
<div className="w-[2px] h-full bg-on-background absolute left-0 top-0" />
```

### 4.4 Data Labels
Micro-labels en JetBrains Mono pour signaler une donnée technique.

→ Composant : `<DataLabel>` dans `src/components/brutalist/DataLabel.tsx`.

Format usuels : `DATA_POINT://###`, `STEP:01/04`, `BRAND://###`, `SCORE:0.87`.

---

## 5. Layout Hero

Structure type : titre en escalier sur la gauche (chaque ligne en retrait croissant), filet vertical 2px en bord gauche, data-label en JetBrains Mono **avant** le titre, citation Cormorant après.

```tsx
<section className="relative min-h-[60vh] flex flex-col gap-6 px-6 py-12">
  <GridBackground />
  <div className="relative pl-6">
    <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
    <DataLabel>DATA_POINT://001</DataLabel>
    <h1 className="font-sans font-black text-5xl tracking-tighter leading-none uppercase mt-4">
      <span className="block">SCENT</span>
      <span className="block ml-6">DATASET</span>
      <span className="block ml-12">///</span>
    </h1>
    <p className="font-cormorant italic text-lg mt-6 opacity-60 max-w-sm">
      « Explorez le patrimoine olfactif. »
    </p>
  </div>
</section>
```

---

## 6. Animations

Transitions sobres. Jamais de bounce, jamais d'effets spectaculaires. L'élégance vient de la retenue.

Toutes les animations sont définies via keyframes CSS dans `globals.css`. Les easings autorisés :

- `cubic-bezier(0.22, 1, 0.36, 1)` — entrée standard
- `cubic-bezier(0.16, 1, 0.3, 1)` — entrée plus prononcée
- Durées : 220-450ms (plus court = nerveux, plus long = lent et lourd)

Classes utilitaires existantes utilisables : `.bubble-in`, `.report-section`, `.card-section`, `.quiz-in`, `.reveal-fade-in`.

---

## 7. Boutons

### Bouton primaire
```tsx
<button className="
  font-sans font-semibold text-sm tracking-widest uppercase
  bg-on-background text-background
  border-2 border-on-background
  px-6 py-3
  hover:bg-background hover:text-on-background
  transition-colors duration-150
  shadow-[4px_4px_0px_0px_currentColor]
  hover:shadow-[2px_2px_0px_0px_currentColor]
">
  EXPLORER →
</button>
```

### Bouton secondaire
```tsx
<button className="
  font-sans font-semibold text-sm tracking-widest uppercase
  bg-background text-on-background
  border-2 border-on-background
  px-6 py-3
  hover:bg-on-background hover:text-background
  transition-colors duration-150
">
  ANNULER
</button>
```

Tous les boutons : `rounded-none`. Pas d'exception.

---

## 8. Inputs / Form fields

```tsx
<input className="
  w-full px-4 py-3
  bg-background text-on-background
  border-2 border-on-background
  font-mono text-sm
  focus:outline-none focus:shadow-[4px_4px_0px_0px_currentColor]
  placeholder:opacity-40
" />
```

Labels au-dessus :
```tsx
<label className="font-mono text-xs tracking-widest uppercase opacity-60">
  NAME
</label>
```

---

## 9. Checklist de validation

Avant de livrer un composant :

- [ ] Seuls `#000` / `#FFF` + opacités sont utilisés (via tokens `on-background` / `background`)
- [ ] Les 3 fontes sont correctement assignées à leurs rôles
- [ ] Les cards ont `border-2 border-on-background` + shadow décalée + `rounded-none`
- [ ] Les boutons et inputs sont en `rounded-none`
- [ ] Les data-labels sont en `font-mono text-xs tracking-widest uppercase`
- [ ] `<GridBackground />` est présent sur les pages hero/landing
- [ ] Pas de couleur d'accent (bleu, violet, gradient coloré)

---

## 10. Ce qu'il NE FAUT PAS faire

| ❌ Interdit | ✅ Alternative |
|---|---|
| Couleurs d'accent (bleu, violet, orange) | Niveaux d'opacité du noir |
| `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-full` | `rounded-none` |
| Gradients colorés | Dégradé radial blanc transparent |
| Animations bounce / spring rapide | `ease: [0.22, 1, 0.36, 1]` lent |
| Cards sans ombre décalée | `shadow-[4px_4px_0px_0px_currentColor]` |
| Texte courant en `font-mono` | `font-mono` réservé aux données techniques |
| `text-primary`, `bg-primary-container`, `border-outline-variant` (Material You) | Tokens monochromes : `text-on-background`, `border-on-background`, `bg-on-background/5` |

---

*Dernière mise à jour : Mai 2026 — Projet La Niche v2*
