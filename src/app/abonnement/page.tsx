"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";
import {
  useStore,
  TIER_LIMITS,
  TIER_PRICE_EUR,
  type SubscriptionTier,
} from "@/lib/store";

/* -------------------------------------------------------------------------
 * Page d'abonnement — 3 tiers, current plan highlighted, fake subscribe
 * button (flips the local tier). Real Stripe plugs in later.
 * --------------------------------------------------------------------- */

type Plan = {
  tier: SubscriptionTier;
  name: string;
  badge: string | null;
  tagline: string;
  features: string[];
  limits: { recommendations: string; guidedBalades: string };
  concierge: boolean;
  priceLabel: string;
  cta: string;
};

const PLANS: Plan[] = [
  {
    tier: "free",
    name: "Gratuit",
    badge: null,
    tagline: "Pour découvrir l'app",
    features: [
      "Wishlist illimitée",
      "Balade libre (sans route guidée)",
      "Scan de parfum basique",
    ],
    limits: {
      recommendations: "5 / mois",
      guidedBalades: "2 / mois",
    },
    concierge: false,
    priceLabel: "0 €",
    cta: "Plan actuel",
  },
  {
    tier: "basic",
    name: "Basic",
    badge: "Populaire",
    tagline: "Pour vraiment utiliser l'app",
    features: [
      "Analyse Fragrantica + boutiques par l'équipe La Niche",
      "Mode « Pour un ami » avec rapport vendeur",
      "Balades guidées avec route optimisée",
      "Wishlist + historique illimités",
    ],
    limits: {
      recommendations: "30 / mois",
      guidedBalades: "10 / mois",
    },
    concierge: true,
    priceLabel: "2,99 € / mois",
    cta: "Passer Basic",
  },
  {
    tier: "premium",
    name: "Illimité",
    badge: "Sans limite",
    tagline: "Pour les collectionneurs et les nez curieux",
    features: [
      "Tout ce qui est dans Basic",
      "Recommandations illimitées",
      "Balades guidées illimitées",
      "Badge Abonné La Niche sur ton profil",
      "Accès prioritaire aux drops exclusifs",
    ],
    limits: {
      recommendations: "Illimitées",
      guidedBalades: "Illimitées",
    },
    concierge: true,
    priceLabel: "9,99 € / mois",
    cta: "Passer Illimité",
  },
];

export default function AbonnementPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[60dvh] items-center justify-center">
          <p className="text-[10px] uppercase tracking-widest text-outline">
            Chargement…
          </p>
        </main>
      }
    >
      <AbonnementContent />
    </Suspense>
  );
}

function AbonnementContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const { subscription, setSubscription } = useStore();
  const [confirming, setConfirming] = useState<SubscriptionTier | null>(null);

  const limitHit = from === "recommendations" || from === "balade";

  function pickTier(tier: SubscriptionTier) {
    if (tier === subscription) return;
    if (tier === "free") {
      // Downgrade confirmation via inline button
      setConfirming("free");
      return;
    }
    setConfirming(tier);
  }

  function confirmTier() {
    if (!confirming) return;
    setSubscription(confirming);
    setConfirming(null);
    // Bounce back to where the user came from, or to the profile.
    if (from === "recommendations") router.push("/recommendations");
    else if (from === "balade") router.push("/balade");
    else router.push("/profile");
  }

  return (
    <div className="px-6 pt-4 pb-12">
      {/* Context banner */}
      {limitHit && (
        <div className="mb-6 border border-primary bg-primary/5 p-4 flex items-start gap-3">
          <Icon name="lock" size={16} className="text-primary mt-0.5 flex-shrink-0" />
          <div className="flex-1 text-[12px] leading-relaxed">
            <p className="font-bold mb-0.5">Limite atteinte.</p>
            <p className="text-on-surface-variant">
              {from === "recommendations"
                ? "Tu as utilisé tes 5 recommandations gratuites ce mois-ci. Passe sur un plan pour continuer à découvrir des parfums."
                : "Tu as utilisé tes balades guidées gratuites ce mois-ci. Passe sur un plan pour relancer."}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="mb-10">
        <p className="text-[10px] uppercase tracking-[0.3em] text-outline mb-2">
          Abonnement
        </p>
        <h1 className="text-5xl font-medium leading-[0.9] tracking-tighter">
          Choisis ton
          <br />
          niveau d&apos;accès.
        </h1>
        <p className="text-sm text-on-surface-variant mt-4 max-w-md leading-relaxed">
          Chaque recommandation mobilise l&apos;équipe La Niche, des
          recherches Fragrantica et les catalogues des boutiques partenaires.
          Les plans payants financent ces requêtes et te donnent plus de
          marge pour explorer.
        </p>
      </header>

      {/* Plans */}
      <div className="flex flex-col gap-3 mb-10">
        {PLANS.map((plan) => {
          const current = plan.tier === subscription;
          return (
            <article
              key={plan.tier}
              className={clsx(
                "relative border p-5 transition-all",
                current
                  ? "border-primary bg-surface-container-lowest"
                  : "border-outline-variant bg-background hover:border-primary/50",
                plan.tier === "premium" && !current && "bg-primary/[0.02]",
              )}
            >
              {/* Badge */}
              {plan.badge && (
                <span
                  className={clsx(
                    "absolute -top-2.5 right-4 text-[9px] uppercase tracking-[0.25em] font-bold px-2 py-0.5",
                    plan.tier === "premium"
                      ? "bg-primary text-on-primary"
                      : "bg-on-background text-on-primary",
                  )}
                >
                  {plan.badge}
                </span>
              )}

              {/* Title row */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h2 className="text-2xl font-bold tracking-tight">
                    {plan.name}
                  </h2>
                  <p className="text-[11px] text-outline uppercase tracking-widest mt-1">
                    {plan.tagline}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-mono font-bold tracking-tight">
                    {plan.priceLabel}
                  </p>
                  {current && (
                    <p className="text-[9px] uppercase tracking-widest text-primary font-bold mt-1 flex items-center gap-1 justify-end">
                      <Icon name="check_circle" filled size={12} />
                      Actuel
                    </p>
                  )}
                </div>
              </div>

              {/* Limits grid */}
              <div className="grid grid-cols-2 gap-px bg-outline-variant/40 border border-outline-variant/40 mb-4">
                <div className="bg-background px-3 py-2">
                  <p className="text-[9px] uppercase tracking-widest text-outline mb-0.5">
                    Recos
                  </p>
                  <p className="text-sm font-mono font-bold">
                    {plan.limits.recommendations}
                  </p>
                </div>
                <div className="bg-background px-3 py-2">
                  <p className="text-[9px] uppercase tracking-widest text-outline mb-0.5">
                    Balades guidées
                  </p>
                  <p className="text-sm font-mono font-bold">
                    {plan.limits.guidedBalades}
                  </p>
                </div>
              </div>

              {/* Features */}
              <ul className="flex flex-col gap-1.5 mb-4">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-[12px] leading-relaxed text-on-surface-variant"
                  >
                    <Icon
                      name="check"
                      size={12}
                      className={clsx(
                        "mt-1 flex-shrink-0",
                        plan.tier === "free" ? "text-outline" : "text-primary",
                      )}
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {current ? (
                <button
                  type="button"
                  disabled
                  className="w-full py-3 border border-outline-variant rounded-full text-[10px] uppercase tracking-widest font-bold text-outline"
                >
                  Plan actuel
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => pickTier(plan.tier)}
                  className={clsx(
                    "w-full py-3 rounded-full text-[10px] uppercase tracking-widest font-bold transition-all active:scale-95",
                    plan.tier === "free"
                      ? "border border-outline-variant hover:border-primary"
                      : "bg-primary text-on-primary hover:opacity-90",
                  )}
                >
                  {plan.tier === "free" ? "Revenir au gratuit" : plan.cta}
                </button>
              )}
            </article>
          );
        })}
      </div>

      {/* Confirmation sheet */}
      {confirming && (
        <ConfirmSheet
          tier={confirming}
          onConfirm={confirmTier}
          onCancel={() => setConfirming(null)}
        />
      )}

      {/* Disclaimer */}
      <div className="border-t border-outline-variant/40 pt-6 flex flex-col gap-3">
        <p className="text-[10px] text-outline leading-relaxed">
          ⓘ Les paiements réels ne sont pas encore branchés — le bouton
          «&nbsp;S&apos;abonner&nbsp;» bascule ton plan localement pour que tu
          testes l&apos;expérience. Stripe arrive bientôt.
        </p>
        <Link
          href="/profile"
          className="text-[10px] uppercase tracking-widest text-outline hover:text-on-background transition-colors self-start"
        >
          ← Retour au profil
        </Link>
      </div>
    </div>
  );
}

function ConfirmSheet({
  tier,
  onConfirm,
  onCancel,
}: {
  tier: SubscriptionTier;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const price = TIER_PRICE_EUR[tier];
  const limit = TIER_LIMITS[tier];
  const recs =
    limit.recommendations === Infinity ? "illimitées" : limit.recommendations;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-on-background/30 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden
      />
      <div className="relative w-full bg-background border-t border-outline-variant max-w-screen-md mx-auto">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-8 h-1 bg-outline-variant rounded-full" />
        </div>
        <div className="px-6 pb-8 pt-2">
          {tier === "free" ? (
            <>
              <p className="text-[10px] uppercase tracking-[0.3em] text-outline mb-2">
                Confirmation
              </p>
              <h2 className="text-2xl font-bold tracking-tight mb-3">
                Revenir au plan gratuit ?
              </h2>
              <p className="text-sm text-on-surface-variant leading-relaxed mb-6">
                Tu perdras l&apos;accès aux recommandations illimitées et au
                badge. Tes données restent intactes.
              </p>
            </>
          ) : (
            <>
              <p className="text-[10px] uppercase tracking-[0.3em] text-outline mb-2">
                Confirmation d&apos;abonnement
              </p>
              <h2 className="text-2xl font-bold tracking-tight mb-3">
                Passer sur {tier === "basic" ? "Basic" : "Illimité"} —{" "}
                <span className="font-mono">{price} €/mois</span>
              </h2>
              <ul className="flex flex-col gap-1 mb-6 text-sm text-on-surface-variant">
                <li className="flex items-center gap-2">
                  <Icon name="check" size={14} className="text-primary" />
                  {recs === "illimitées"
                    ? "Recommandations illimitées"
                    : `${recs} recommandations par mois`}
                </li>
                <li className="flex items-center gap-2">
                  <Icon name="check" size={14} className="text-primary" />
                  Rapport vendeur + mode pour un ami
                </li>
                {tier === "premium" && (
                  <li className="flex items-center gap-2">
                    <Icon name="verified" size={14} className="text-primary" />
                    Badge Abonné La Niche
                  </li>
                )}
              </ul>
              <p className="text-[10px] text-outline mb-6 leading-relaxed">
                Placeholder — aucun paiement n&apos;est réellement effectué
                pour le moment. Tu peux tester l&apos;expérience sans carte.
              </p>
            </>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-3 border border-outline-variant rounded-full text-[10px] uppercase tracking-widest font-bold hover:border-primary transition-all"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="flex-1 py-3 bg-primary text-on-primary rounded-full text-[10px] uppercase tracking-widest font-bold active:scale-95 transition-all"
            >
              {tier === "free" ? "Confirmer" : "S'abonner"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
