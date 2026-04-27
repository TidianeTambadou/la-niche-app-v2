"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@/components/Icon";
import {
  useStore,
  TIER_LIMITS,
  TIER_PRICE_EUR,
  TIER_PRICE_EUR_ANNUAL,
  TIER_LABELS,
  TIER_HAS_CONTEST,
  type SubscriptionTier,
  type BillingCycle,
} from "@/lib/store";

/* -------------------------------------------------------------------------
 * Page d'abonnement — 4 paliers (Découverte / Curieux / Initié / Mécène),
 * toggle Mensuel / Annuel (-2 mois ~), badges et concours du mois sur les
 * paliers supérieurs. Animations framer-motion pour pousser à la conversion :
 *   - stagger d'apparition des cartes
 *   - shimmer sur le badge "Concours du mois"
 *   - pulse sur l'économie annuelle quand le toggle bascule
 *   - hover scale + tilt sur la carte recommandée
 *   - pop sur le prix qui change avec le cycle
 *
 * Paiement : placeholder localStorage. PayPal arrive en phase 3.
 * --------------------------------------------------------------------- */

type PaidTier = Exclude<SubscriptionTier, "free">;

type Plan = {
  tier: SubscriptionTier;
  badge: string | null;
  /** Met en avant la carte (Initié — sweet spot). */
  recommended?: boolean;
  tagline: string;
  /** Argumentaire émotionnel court sous le titre, pousse à la conversion. */
  pitch: string;
  features: string[];
  /** Avantages exclusifs (rare = orange/primary), affichés différemment. */
  perks: string[];
};

const PLANS: Plan[] = [
  {
    tier: "free",
    badge: null,
    tagline: "Pour découvrir l'app",
    pitch: "Aperçu strict du système — l'usage régulier passe par un palier payant.",
    features: [
      "2 recommandations / mois",
      "0 balade guidée",
      "10 recherches / mois",
      "1 scan de flacon / mois",
      "Wishlist illimitée",
    ],
    perks: [],
  },
  {
    tier: "curieux",
    badge: "Le bon début",
    tagline: "Pour vraiment utiliser l'app",
    pitch: "Tu commences à explorer sérieusement — c'est le moment de débrider.",
    features: [
      "25 recommandations / mois",
      "10 balades guidées / mois",
      "200 recherches / mois",
      "20 scans / mois",
      "30 questions au concierge IA",
      "Mode « pour un ami » + rapport vendeur",
    ],
    perks: ["Badge Curieux sur ton profil"],
  },
  {
    tier: "initie",
    badge: "Recommandé",
    recommended: true,
    tagline: "Pour les nez curieux",
    pitch: "Le palier qu'on conseille — tout ce qu'il faut pour devenir un vrai connaisseur.",
    features: [
      "60 recommandations / mois",
      "25 balades guidées / mois",
      "Recherches + scans + concierge illimités",
      "Carte signée La Niche illimitée",
    ],
    perks: [
      "Badge Initié distinctif",
      "Concours du mois — un parfum à gagner",
    ],
  },
  {
    tier: "mecene",
    badge: "Rare",
    tagline: "Pour les collectionneurs",
    pitch: "Tu soutiens une parfumerie indépendante. Et tu en récoltes les fruits.",
    features: [
      "Tout illimité (fair-use 200 recos / 50 balades par mois)",
      "Concierge HUMAIN — WhatsApp direct, réponse sous 24h",
      "Tout ce qui est dans Initié",
    ],
    perks: [
      "Badge Mécène (rareté visuelle)",
      "Concours du mois — chances doublées",
    ],
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
  const { subscription, billingCycle, setSubscription } = useStore();

  // Toggle local — l'utilisateur peut comparer mensuel/annuel sans engager.
  // Initialisé sur le cycle déjà choisi (ou monthly par défaut).
  const [cycle, setCycle] = useState<BillingCycle>(billingCycle);
  const [confirming, setConfirming] = useState<{
    tier: SubscriptionTier;
    cycle: BillingCycle;
  } | null>(null);

  const limitHit =
    from === "recommendations" ||
    from === "balade" ||
    from === "search" ||
    from === "scan" ||
    from === "concierge";

  const limitMessage =
    from === "recommendations"
      ? "Tu as utilisé tes recommandations gratuites ce mois-ci. Passe à un palier supérieur pour continuer à découvrir."
      : from === "balade"
        ? "Tes balades guidées sont réservées aux paliers payants. Passe Curieux pour relancer."
        : from === "search"
          ? "Quota de recherches atteint. Chaque autocomplete consomme des tokens IA — débride avec un palier payant."
          : from === "scan"
            ? "Quota de scans atteint. Chaque scan = vision IA + extraction Fragrantica. Passe à un palier supérieur."
            : from === "concierge"
              ? "Concierge IA verrouillé. Curieux débloque 30 questions/mois, Initié + Mécène c'est illimité."
              : "";

  function pickTier(tier: SubscriptionTier) {
    if (tier === subscription && cycle === billingCycle) return;
    setConfirming({ tier, cycle: tier === "free" ? "monthly" : cycle });
  }

  function confirmTier() {
    if (!confirming) return;
    // Downgrade vers free → bascule locale (PayPal n'est pas appelé ; le
    // futur Cancel-button du profile cancelera la subscription côté PayPal,
    // ce qui déclenchera BILLING.SUBSCRIPTION.CANCELLED → status=cancelled
    // → quota.ts traite le user comme free).
    if (confirming.tier === "free") {
      setSubscription("free", "monthly");
      setConfirming(null);
      router.push("/profile");
      return;
    }
    // Tiers payants → checkout PayPal. La subscription est créée par le SDK,
    // le webhook upsert user_subscription, le client refresh /api/usage et
    // arrive sur /profile avec ?welcome=1.
    setConfirming(null);
    router.push(
      `/abonnement/checkout?tier=${confirming.tier}&cycle=${confirming.cycle}`,
    );
  }

  return (
    <div className="px-6 pt-4 pb-12">
      {/* Limit-hit context banner */}
      {limitHit && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6 border border-primary bg-primary/5 p-4 flex items-start gap-3"
        >
          <Icon
            name="lock"
            size={16}
            className="text-primary mt-0.5 flex-shrink-0"
          />
          <div className="flex-1 text-[12px] leading-relaxed">
            <p className="font-bold mb-0.5">Limite atteinte.</p>
            <p className="text-on-surface-variant">{limitMessage}</p>
          </div>
        </motion.div>
      )}

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <p className="text-[10px] uppercase tracking-[0.3em] text-outline mb-2">
          Abonnement
        </p>
        <h1 className="text-5xl font-medium leading-[0.9] tracking-tighter">
          Choisis ton
          <br />
          niveau d&apos;accès.
        </h1>
        <p className="text-sm text-on-surface-variant mt-4 max-w-md leading-relaxed">
          Chaque recommandation mobilise notre équipe et nos archives. Ton
          abonnement finance ce travail — et te donne les clés pour
          vraiment explorer.
        </p>
      </motion.header>

      {/* Cycle toggle */}
      <CycleToggle cycle={cycle} setCycle={setCycle} />

      {/* Plans */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: {
            transition: { staggerChildren: 0.08, delayChildren: 0.1 },
          },
        }}
        className="flex flex-col gap-4 mb-10"
      >
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.tier}
            plan={plan}
            cycle={cycle}
            current={
              plan.tier === subscription &&
              (plan.tier === "free" || cycle === billingCycle)
            }
            onPick={() => pickTier(plan.tier)}
          />
        ))}
      </motion.div>

      {/* Confirmation sheet */}
      <AnimatePresence>
        {confirming && (
          <ConfirmSheet
            tier={confirming.tier}
            cycle={confirming.cycle}
            onConfirm={confirmTier}
            onCancel={() => setConfirming(null)}
          />
        )}
      </AnimatePresence>

      {/* Disclaimer */}
      <div className="border-t border-outline-variant/40 pt-6 flex flex-col gap-3">
        <p className="text-[10px] text-outline leading-relaxed">
          ⓘ Paiement sécurisé par PayPal. Tu peux annuler ton abonnement à
          tout moment depuis ton profil — la résiliation prend effet à la
          fin de la période en cours.
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

/* ─── Cycle toggle (mensuel / annuel) ───────────────────────────────────── */

function CycleToggle({
  cycle,
  setCycle,
}: {
  cycle: BillingCycle;
  setCycle: (c: BillingCycle) => void;
}) {
  return (
    <div className="mb-8 flex flex-col items-center gap-2">
      <div className="relative inline-flex items-center bg-surface-container-low border border-outline-variant rounded-full p-1">
        {(["monthly", "annual"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCycle(c)}
            className={clsx(
              "relative z-10 px-5 py-2 text-[10px] uppercase tracking-[0.2em] font-bold transition-colors",
              cycle === c ? "text-on-primary" : "text-outline",
            )}
          >
            {cycle === c && (
              <motion.span
                layoutId="cycle-pill"
                className="absolute inset-0 bg-primary rounded-full -z-10"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            {c === "monthly" ? "Mensuel" : "Annuel"}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        {cycle === "annual" ? (
          <motion.p
            key="annual-hint"
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="text-[10px] uppercase tracking-widest font-bold text-primary flex items-center gap-1.5"
          >
            <Icon name="local_offer" size={10} filled />
            ~2 mois offerts sur l&apos;annuel
          </motion.p>
        ) : (
          <motion.p
            key="monthly-hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-[10px] uppercase tracking-widest text-outline"
          >
            Sans engagement · résiliable à tout moment
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Plan card ─────────────────────────────────────────────────────────── */

function PlanCard({
  plan,
  cycle,
  current,
  onPick,
}: {
  plan: Plan;
  cycle: BillingCycle;
  current: boolean;
  onPick: () => void;
}) {
  const limit = TIER_LIMITS[plan.tier];
  const cardVariants = {
    hidden: { opacity: 0, y: 18 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.45 } },
  };

  return (
    <motion.article
      variants={cardVariants}
      whileHover={
        plan.tier !== "free" && !current
          ? { y: -3, transition: { duration: 0.2 } }
          : undefined
      }
      className={clsx(
        "relative border p-5 transition-colors",
        current
          ? "border-primary bg-surface-container-lowest"
          : plan.recommended
            ? "border-primary/60 bg-primary/[0.04]"
            : plan.tier === "mecene"
              ? "border-outline-variant bg-gradient-to-br from-surface-container-low via-background to-primary/[0.03]"
              : "border-outline-variant bg-background hover:border-primary/50",
      )}
    >
      {/* Badge */}
      {plan.badge && (
        <motion.span
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 300 }}
          className={clsx(
            "absolute -top-2.5 right-4 text-[9px] uppercase tracking-[0.25em] font-bold px-2 py-0.5",
            plan.recommended
              ? "bg-primary text-on-primary"
              : plan.tier === "mecene"
                ? "bg-on-background text-on-primary"
                : "bg-on-background text-on-primary",
          )}
        >
          {plan.badge}
        </motion.span>
      )}

      {/* Title row + price */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight">
            {TIER_LABELS[plan.tier]}
          </h2>
          <p className="text-[11px] text-outline uppercase tracking-widest mt-1">
            {plan.tagline}
          </p>
        </div>
        <PriceBlock tier={plan.tier} cycle={cycle} current={current} />
      </div>

      {/* Pitch (emotional hook) */}
      <p className="text-[12px] text-on-surface-variant leading-relaxed mb-4 italic">
        {plan.pitch}
      </p>

      {/* Limits grid */}
      <div className="grid grid-cols-2 gap-px bg-outline-variant/40 border border-outline-variant/40 mb-4">
        <div className="bg-background px-3 py-2">
          <p className="text-[9px] uppercase tracking-widest text-outline mb-0.5">
            Recos
          </p>
          <p className="text-sm font-mono font-bold">
            {limit.recommendations === Infinity
              ? "Illimitées"
              : `${limit.recommendations} / mois`}
          </p>
        </div>
        <div className="bg-background px-3 py-2">
          <p className="text-[9px] uppercase tracking-widest text-outline mb-0.5">
            Balades guidées
          </p>
          <p className="text-sm font-mono font-bold">
            {limit.guidedBalades === Infinity
              ? "Illimitées"
              : `${limit.guidedBalades} / mois`}
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

      {/* Perks (badge + concours du mois) — animated separately */}
      {plan.perks.length > 0 && (
        <ul className="flex flex-col gap-1.5 mb-4 pt-3 border-t border-outline-variant/40">
          {plan.perks.map((p) => {
            const isContest = /concours du mois/i.test(p);
            return (
              <li
                key={p}
                className="flex items-start gap-2 text-[12px] leading-relaxed text-on-background font-medium"
              >
                <Icon
                  name={isContest ? "card_giftcard" : "verified"}
                  filled
                  size={13}
                  className="mt-0.5 flex-shrink-0 text-primary"
                />
                {isContest ? (
                  <ShimmerText>{p}</ShimmerText>
                ) : (
                  <span>{p}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* CTA */}
      {current ? (
        <button
          type="button"
          disabled
          className="w-full py-3 border border-outline-variant rounded-full text-[10px] uppercase tracking-widest font-bold text-outline flex items-center justify-center gap-2"
        >
          <Icon name="check_circle" filled size={12} />
          Plan actuel
        </button>
      ) : (
        <motion.button
          type="button"
          onClick={onPick}
          whileTap={{ scale: 0.97 }}
          className={clsx(
            "w-full py-3 rounded-full text-[10px] uppercase tracking-widest font-bold transition-all",
            plan.tier === "free"
              ? "border border-outline-variant hover:border-primary"
              : plan.recommended
                ? "bg-primary text-on-primary shadow-[0_8px_24px_-12px] shadow-primary/60"
                : "bg-primary text-on-primary hover:opacity-90",
          )}
        >
          {plan.tier === "free" ? "Revenir au gratuit" : `Passer ${TIER_LABELS[plan.tier]}`}
        </motion.button>
      )}

      {/* Sparkle overlay on Mécène */}
      {plan.tier === "mecene" && !current && <SparkleLayer />}
    </motion.article>
  );
}

/* ─── Price block — animates between monthly/annual ─────────────────────── */

function PriceBlock({
  tier,
  cycle,
  current,
}: {
  tier: SubscriptionTier;
  cycle: BillingCycle;
  current: boolean;
}) {
  const monthly = TIER_PRICE_EUR[tier];
  const annual = TIER_PRICE_EUR_ANNUAL[tier];
  const annualSavings = useMemo(() => {
    if (tier === "free") return 0;
    return monthly * 12 - annual;
  }, [tier, monthly, annual]);

  if (tier === "free") {
    return (
      <div className="text-right flex-shrink-0">
        <p className="text-lg font-mono font-bold tracking-tight">0 €</p>
        {current && (
          <p className="text-[9px] uppercase tracking-widest text-primary font-bold mt-1 flex items-center gap-1 justify-end">
            <Icon name="check_circle" filled size={12} />
            Actuel
          </p>
        )}
      </div>
    );
  }

  const display = cycle === "annual" ? annual : monthly;
  const suffix = cycle === "annual" ? "/an" : "/mois";

  return (
    <div className="text-right flex-shrink-0">
      <AnimatePresence mode="wait">
        <motion.p
          key={`${tier}-${cycle}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          className="text-lg font-mono font-bold tracking-tight"
        >
          {display.toFixed(display % 1 === 0 ? 0 : 2).replace(".", ",")} €
          <span className="text-[10px] text-outline ml-0.5">{suffix}</span>
        </motion.p>
      </AnimatePresence>
      {cycle === "annual" && annualSavings > 0 && (
        <motion.p
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 380 }}
          className="text-[9px] uppercase tracking-widest text-primary font-bold mt-0.5"
        >
          −{annualSavings.toFixed(0)} €
        </motion.p>
      )}
      {current && (
        <p className="text-[9px] uppercase tracking-widest text-primary font-bold mt-1 flex items-center gap-1 justify-end">
          <Icon name="check_circle" filled size={12} />
          Actuel
        </p>
      )}
    </div>
  );
}

/* ─── Shimmer effect — concours du mois ─────────────────────────────────── */

function ShimmerText({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-block overflow-hidden">
      <span className="relative z-10">{children}</span>
      <motion.span
        aria-hidden
        initial={{ x: "-100%" }}
        animate={{ x: "200%" }}
        transition={{
          repeat: Infinity,
          repeatDelay: 2.5,
          duration: 1.4,
          ease: "easeInOut",
        }}
        className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/30 to-transparent pointer-events-none"
      />
    </span>
  );
}

/* ─── Sparkle layer — Mécène ───────────────────────────────────────────── */

function SparkleLayer() {
  // Trois étoiles fixes dans la carte Mécène, qui pulsent en décalé.
  const sparkles = [
    { top: "12%", left: "8%", delay: 0 },
    { top: "60%", right: "12%", delay: 0.7 },
    { top: "82%", left: "18%", delay: 1.3 },
  ];
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {sparkles.map((s, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: [0, 1, 0], scale: [0.4, 1, 0.4] }}
          transition={{
            repeat: Infinity,
            duration: 2.4,
            delay: s.delay,
            ease: "easeInOut",
          }}
          style={{
            top: s.top,
            left: s.left,
            right: s.right,
          }}
          className="absolute"
        >
          <Icon name="auto_awesome" size={10} className="text-primary/70" filled />
        </motion.span>
      ))}
    </div>
  );
}

/* ─── Confirmation sheet ────────────────────────────────────────────────── */

function ConfirmSheet({
  tier,
  cycle,
  onConfirm,
  onCancel,
}: {
  tier: SubscriptionTier;
  cycle: BillingCycle;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isFree = tier === "free";
  const monthly = TIER_PRICE_EUR[tier];
  const annual = TIER_PRICE_EUR_ANNUAL[tier];
  const display = cycle === "annual" ? annual : monthly;
  const suffix = cycle === "annual" ? "/an" : "/mois";
  const limit = TIER_LIMITS[tier];
  const recs =
    limit.recommendations === Infinity ? "illimitées" : limit.recommendations;
  const hasContest = TIER_HAS_CONTEST[tier];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end"
      role="dialog"
      aria-modal="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className="absolute inset-0 bg-on-background/30 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden
      />
      <motion.div
        initial={{ y: 40 }}
        animate={{ y: 0 }}
        exit={{ y: 40 }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}
        className="relative w-full bg-background border-t border-outline-variant max-w-screen-md mx-auto"
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-8 h-1 bg-outline-variant rounded-full" />
        </div>
        <div className="px-6 pb-8 pt-2">
          {isFree ? (
            <>
              <p className="text-[10px] uppercase tracking-[0.3em] text-outline mb-2">
                Confirmation
              </p>
              <h2 className="text-2xl font-bold tracking-tight mb-3">
                Revenir au plan Découverte ?
              </h2>
              <p className="text-sm text-on-surface-variant leading-relaxed mb-6">
                Tu perdras l&apos;accès aux recommandations étendues, au
                concierge IA et à ton badge. Tes données restent intactes.
              </p>
            </>
          ) : (
            <>
              <p className="text-[10px] uppercase tracking-[0.3em] text-outline mb-2">
                Confirmation d&apos;abonnement
              </p>
              <h2 className="text-2xl font-bold tracking-tight mb-3">
                Passer {TIER_LABELS[tier]} —{" "}
                <span className="font-mono">
                  {display.toFixed(display % 1 === 0 ? 0 : 2).replace(".", ",")} €
                </span>
                <span className="text-base text-outline">{suffix}</span>
              </h2>
              <ul className="flex flex-col gap-1.5 mb-6 text-sm text-on-surface-variant">
                <li className="flex items-center gap-2">
                  <Icon name="check" size={14} className="text-primary" />
                  {recs === "illimitées"
                    ? "Recommandations illimitées (fair-use 200/mois)"
                    : `${recs} recommandations / mois`}
                </li>
                <li className="flex items-center gap-2">
                  <Icon name="check" size={14} className="text-primary" />
                  Mode « pour un ami » + rapport vendeur
                </li>
                <li className="flex items-center gap-2">
                  <Icon name="verified" size={14} className="text-primary" />
                  Badge {TIER_LABELS[tier]} sur ton profil
                </li>
                {hasContest && (
                  <li className="flex items-center gap-2">
                    <Icon name="card_giftcard" size={14} className="text-primary" />
                    Concours du mois
                    {tier === "mecene" ? " (chances doublées)" : ""}
                  </li>
                )}
              </ul>
              <p className="text-[10px] text-outline mb-6 leading-relaxed">
                Tu seras redirigé vers PayPal pour confirmer le paiement.
                Tu peux annuler à tout moment.
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
            <motion.button
              type="button"
              onClick={onConfirm}
              whileTap={{ scale: 0.96 }}
              className="flex-1 py-3 bg-primary text-on-primary rounded-full text-[10px] uppercase tracking-widest font-bold transition-all"
            >
              {isFree ? "Confirmer" : "S'abonner"}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
