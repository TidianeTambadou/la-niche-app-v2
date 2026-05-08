"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useAuth, useRequireAuth } from "@/lib/auth";
import { useShopRole } from "@/lib/role";
import { useGuardOutOfService } from "@/lib/service-mode";
import { supabase } from "@/lib/supabase";

export default function SettingsPage() {
  useRequireAuth();
  useGuardOutOfService("/pour-un-client", { bypassable: true });
  const router = useRouter();
  const { user } = useAuth();
  const { shop, isBoutique, loading } = useShopRole();

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="px-6 py-6 flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Réglages</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          {isBoutique && shop
            ? `Compte boutique — ${shop.name}`
            : user?.email ?? "Compte utilisateur"}
        </p>
      </header>

      {isBoutique && !loading && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs uppercase tracking-widest font-medium text-outline">
            Boutique
          </h2>
          <SettingsLink
            href="/settings/horaires"
            icon="schedule"
            title="Horaires d'ouverture"
            description="L'app passe en mode boutique automatiquement pendant les heures d'ouverture (newsletter et réglages cachés)."
          />
          <SettingsLink
            href="/settings/questions"
            icon="reorder"
            title="Questionnaire client"
            description="Réordonner, ajouter ou retirer des questions du formulaire « Pour un client »."
          />
          <SettingsLink
            href="/newsletter/stock"
            icon="inventory_2"
            title="Stock parfums"
            description="Gérer le catalogue utilisé par la newsletter."
          />
          <SettingsLink
            href="/settings/diagnostic"
            icon="troubleshoot"
            title="Diagnostic IA"
            description="Vérifier la connexion OpenRouter, Resend, Twilio si quelque chose coince."
          />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-widest font-medium text-outline">
          Compte
        </h2>
        <button
          type="button"
          onClick={signOut}
          className="flex items-center justify-between gap-4 w-full px-4 py-4 border border-outline-variant rounded-2xl active:scale-[0.99] transition-transform"
        >
          <span className="flex items-center gap-3">
            <Icon name="logout" />
            <span className="text-sm font-medium">Se déconnecter</span>
          </span>
          <Icon name="chevron_right" className="text-outline" />
        </button>
      </section>
    </div>
  );
}

function SettingsLink({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start justify-between gap-4 w-full px-4 py-4 border border-outline-variant rounded-2xl active:scale-[0.99] transition-transform"
    >
      <span className="flex items-start gap-3">
        <Icon name={icon} className="mt-0.5" />
        <span className="flex flex-col">
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-xs text-on-surface-variant mt-0.5">
            {description}
          </span>
        </span>
      </span>
      <Icon name="chevron_right" className="text-outline mt-0.5" />
    </Link>
  );
}
