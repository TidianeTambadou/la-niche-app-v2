# La Niche — Mobile

PWA mobile-first qui accompagne le CRM La Niche. Connexion directe à Supabase (pas d'API intermédiaire), même projet que le CRM.

## Stack

- Next.js 16 (App Router, Turbopack)
- React 19
- Tailwind CSS v4 (`@theme inline` tokens)
- `@supabase/supabase-js`
- `next-themes` (dark mode)
- `lucide-react`, `framer-motion`
- PWA : `manifest.webmanifest` + icônes SVG

## Commandes

```bash
npm run dev      # dev server (Turbopack)
npm run build    # build production
npm run lint     # ESLint
npx tsc --noEmit # type check
```

## Environnement

`.env.local` :

```
NEXT_PUBLIC_SUPABASE_URL=https://nmcsfdgqnttanufydjer.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_bld-zRED6KZAPIJIvf66Ew_DPVrtW-9
```

Le template est dans `.env.local.example`. Mêmes credentials que le CRM — voir `../crm-laniche/MOBILE_SPEC.md` pour le schéma complet des tables, RLS et règles métier.

## Structure

```
src/
  app/
    layout.tsx       # root layout, viewport mobile, ThemeProvider
    page.tsx         # home
    globals.css      # tokens @theme + base mobile (dvh, safe-area, tap)
  components/
    ThemeProvider.tsx
  lib/
    supabase.ts      # singleton client (auth persistant)
    types.ts         # Shop, StockItem, OpeningHours
    utils.ts         # cn()
public/
  manifest.webmanifest
  icon.svg
  icon-maskable.svg
```

## Conventions mobile

- `viewport-fit: cover` + utilitaires `env(safe-area-inset-*)` pour les encoches.
- Hauteur d'écran : `100dvh` (fallback `-webkit-fill-available`).
- Désactiver le zoom et le tap-highlight pour un feel natif.
- Dark mode : `class` strategy via `next-themes`.
- Toujours utiliser les tokens (`bg-background`, `text-foreground`, `border-border`, etc.), jamais `bg-white`.
