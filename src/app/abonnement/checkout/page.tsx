"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  PayPalScriptProvider,
  PayPalButtons,
} from "@paypal/react-paypal-js";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/lib/auth";
import {
  TIER_LABELS,
  TIER_PRICE_EUR,
  TIER_PRICE_EUR_ANNUAL,
  TIER_HAS_CONTEST,
  useStore,
  type SubscriptionTier,
  type BillingCycle,
} from "@/lib/store";

/* -------------------------------------------------------------------------
 * Page de checkout — l'étape qui transforme un click "S'abonner" en abo
 * réel. Lit (tier, cycle) depuis ?tier=…&cycle=…, résout le plan PayPal
 * dans l'env public, et affiche les Smart Buttons. PayPal s'occupe du
 * popup de paiement ; à l'approbation, le webhook /api/paypal/webhook
 * écrit `user_subscription` côté serveur et le client refresh /api/usage
 * avant de rebondir sur le profil.
 * --------------------------------------------------------------------- */

const VALID_TIERS = new Set<SubscriptionTier>(["curieux", "initie", "mecene"]);

export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutLoader />}>
      <CheckoutContent />
    </Suspense>
  );
}

function CheckoutLoader() {
  return (
    <main className="px-6 pt-12 text-center">
      <p className="text-[10px] uppercase tracking-widest text-outline">
        Chargement…
      </p>
    </main>
  );
}

function CheckoutContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { refreshUsage } = useStore();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tierParam = params.get("tier") ?? "";
  const cycleParam = params.get("cycle") ?? "monthly";
  const tier = (VALID_TIERS.has(tierParam as SubscriptionTier)
    ? tierParam
    : null) as SubscriptionTier | null;
  const cycle: BillingCycle = cycleParam === "annual" ? "annual" : "monthly";

  const planId = useMemo(() => {
    if (!tier) return null;
    return resolvePlanId(tier, cycle);
  }, [tier, cycle]);

  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

  /* ─── Guards ──────────────────────────────────────────────────────── */

  if (authLoading) return <CheckoutLoader />;

  if (!user) {
    // Re-route to login then back here.
    if (typeof window !== "undefined") {
      const next = `/abonnement/checkout?tier=${tierParam}&cycle=${cycleParam}`;
      router.replace(`/login?redirect=${encodeURIComponent(next)}`);
    }
    return <CheckoutLoader />;
  }

  if (!tier) {
    return (
      <ErrorState
        title="Palier introuvable"
        message="Le palier sélectionné n'existe pas. Reviens à la page d'abonnement et choisis-en un."
      />
    );
  }

  if (!planId) {
    return (
      <ErrorState
        title="Configuration PayPal incomplète"
        message={`Aucun plan PayPal configuré pour ${TIER_LABELS[tier]} (${cycle}). Vérifie les variables NEXT_PUBLIC_PAYPAL_PLAN_* en production.`}
      />
    );
  }

  if (!clientId) {
    return (
      <ErrorState
        title="PayPal non configuré"
        message="NEXT_PUBLIC_PAYPAL_CLIENT_ID est manquant côté client."
      />
    );
  }

  /* ─── Render ──────────────────────────────────────────────────────── */

  const monthly = TIER_PRICE_EUR[tier];
  const annual = TIER_PRICE_EUR_ANNUAL[tier];
  const display = cycle === "annual" ? annual : monthly;
  const suffix = cycle === "annual" ? "/an" : "/mois";

  return (
    <div className="px-6 pt-4 pb-12">
      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.3em] text-outline mb-2">
          Checkout
        </p>
        <h1 className="text-4xl font-bold tracking-tighter leading-none">
          Finalise ton abonnement
        </h1>
      </header>

      {/* Récap */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="border border-primary bg-primary/[0.04] p-5 mb-6"
      >
        <p className="text-[10px] uppercase tracking-[0.3em] text-primary font-bold mb-3">
          Récap
        </p>
        <div className="flex items-baseline justify-between mb-2">
          <p className="text-2xl font-bold tracking-tight">
            {TIER_LABELS[tier]}
          </p>
          <p className="text-xl font-mono font-bold">
            {display.toFixed(display % 1 === 0 ? 0 : 2).replace(".", ",")} €
            <span className="text-[11px] text-outline ml-1">{suffix}</span>
          </p>
        </div>
        <p className="text-[11px] text-outline uppercase tracking-widest">
          {cycle === "annual" ? "Facturation annuelle" : "Facturation mensuelle"}
        </p>
        {TIER_HAS_CONTEST[tier] && (
          <p className="mt-3 text-[12px] text-on-surface-variant flex items-start gap-2">
            <Icon name="card_giftcard" filled size={13} className="text-primary mt-0.5" />
            Concours du mois inclus
            {tier === "mecene" ? " — chances doublées" : ""}
          </p>
        )}
        {cycle === "annual" && (
          <p className="mt-2 text-[10px] uppercase tracking-widest text-primary font-bold">
            ~2 mois offerts
          </p>
        )}
      </motion.div>

      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-6 border border-error/50 bg-error-container/20 px-4 py-3"
        >
          <p className="text-xs text-error">{error}</p>
        </motion.div>
      )}

      {paying && (
        <div className="mb-4 flex items-center gap-2 text-[10px] uppercase tracking-widest text-outline">
          <Icon name="progress_activity" size={12} className="animate-spin" />
          Activation en cours…
        </div>
      )}

      {/* PayPal Smart Buttons */}
      <div className={paying ? "opacity-40 pointer-events-none" : ""}>
        <PayPalScriptProvider
          options={{
            clientId,
            currency: "EUR",
            intent: "subscription",
            vault: true,
            components: "buttons",
          }}
        >
          <PayPalButtons
            style={{ layout: "vertical", color: "blue", shape: "rect", label: "subscribe" }}
            createSubscription={(_data, actions) =>
              actions.subscription.create({
                plan_id: planId,
                // CRUCIAL : le webhook lit ce champ pour savoir à quel
                // user.id écrire dans user_subscription.
                custom_id: user.id,
                application_context: {
                  brand_name: "La Niche",
                  user_action: "SUBSCRIBE_NOW",
                  // return_url / cancel_url ne sont pas utilisés en popup-mode
                  // (PayPal close le popup et appelle onApprove/onCancel) mais
                  // le typage du SDK les exige.
                  return_url: typeof window !== "undefined" ? `${window.location.origin}/profile?welcome=1` : "https://laniche.app/profile",
                  cancel_url: typeof window !== "undefined" ? `${window.location.origin}/abonnement` : "https://laniche.app/abonnement",
                  payment_method: {
                    payer_selected: "PAYPAL",
                    payee_preferred: "IMMEDIATE_PAYMENT_REQUIRED",
                  },
                },
              })
            }
            onApprove={async () => {
              setPaying(true);
              setError(null);
              // Le webhook upsert user_subscription côté serveur. On laisse
              // 1.5s pour laisser PayPal envoyer l'event et notre handler
              // l'écrire, puis on tire /api/usage pour refléter le nouveau
              // tier sur le client.
              await new Promise((r) => setTimeout(r, 1500));
              await refreshUsage();
              router.push("/profile?welcome=1");
            }}
            onCancel={() => {
              setError(
                "Paiement annulé. Tu peux relancer quand tu veux — rien n'a été débité.",
              );
            }}
            onError={(err) => {
              console.error("[paypal] button error:", err);
              setError(
                "Le paiement a échoué. Réessaie, ou contacte la conciergerie si ça persiste.",
              );
            }}
          />
        </PayPalScriptProvider>
      </div>

      <p className="mt-6 text-[10px] text-outline leading-relaxed">
        Tu seras redirigé vers PayPal pour confirmer. Tu peux annuler ton abo
        à tout moment depuis ton profil — la résiliation prend effet à la fin
        de la période en cours.
      </p>

      <div className="mt-8 pt-6 border-t border-outline-variant/40">
        <Link
          href="/abonnement"
          className="text-[10px] uppercase tracking-widest font-bold border-b border-primary pb-0.5"
        >
          ← Choisir un autre palier
        </Link>
      </div>
    </div>
  );
}

/* ─── Helpers ───────────────────────────────────────────────────────── */

function resolvePlanId(tier: SubscriptionTier, cycle: BillingCycle): string | null {
  // Les env NEXT_PUBLIC_* sont inlined au build par Next.js. Si une seule
  // est manquante côté production, le checkout pour ce palier est cassé —
  // on renvoie null et l'UI affiche un message clair.
  const map: Partial<Record<SubscriptionTier, Record<BillingCycle, string | undefined>>> = {
    curieux: {
      monthly: process.env.NEXT_PUBLIC_PAYPAL_PLAN_CURIEUX_MONTHLY,
      annual: process.env.NEXT_PUBLIC_PAYPAL_PLAN_CURIEUX_ANNUAL,
    },
    initie: {
      monthly: process.env.NEXT_PUBLIC_PAYPAL_PLAN_INITIE_MONTHLY,
      annual: process.env.NEXT_PUBLIC_PAYPAL_PLAN_INITIE_ANNUAL,
    },
    mecene: {
      monthly: process.env.NEXT_PUBLIC_PAYPAL_PLAN_MECENE_MONTHLY,
      annual: process.env.NEXT_PUBLIC_PAYPAL_PLAN_MECENE_ANNUAL,
    },
  };
  return map[tier]?.[cycle] ?? null;
}

function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <div className="px-6 pt-12 pb-12">
      <div className="border border-error/50 bg-error-container/20 px-5 py-6">
        <p className="text-[10px] uppercase tracking-[0.3em] text-error font-bold mb-2">
          Erreur
        </p>
        <h1 className="text-2xl font-bold tracking-tight mb-3">{title}</h1>
        <p className="text-sm text-on-surface-variant leading-relaxed">{message}</p>
      </div>
      <Link
        href="/abonnement"
        className="mt-6 inline-block text-[10px] uppercase tracking-widest font-bold border-b border-primary pb-0.5"
      >
        ← Retour aux paliers
      </Link>
    </div>
  );
}
