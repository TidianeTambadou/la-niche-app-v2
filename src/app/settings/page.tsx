"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useAuth, useRequireAuth } from "@/lib/auth";
import { useShopRole } from "@/lib/role";
import { useGuardOutOfService } from "@/lib/service-mode";
import { supabase } from "@/lib/supabase";
import { DataLabel } from "@/components/brutalist/DataLabel";

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
      <header className="relative pl-6">
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
        <DataLabel>
          {isBoutique ? "BOUTIQUE_ADMIN" : "USER_ACCOUNT"}
        </DataLabel>
        <h1 className="font-sans font-black text-3xl tracking-tighter uppercase leading-none mt-2">
          RÉGLAGES
        </h1>
        <p className="font-cormorant italic text-base opacity-70 mt-3">
          «{" "}
          {isBoutique && shop
            ? shop.name
            : user?.email ?? "Compte utilisateur"}
          {" "}»
        </p>
      </header>

      {isBoutique && !loading && (
        <section className="flex flex-col gap-3">
          <DataLabel emphasis="high">SECTION:BOUTIQUE</DataLabel>
          <SettingsLink
            href="/settings/horaires"
            icon="schedule"
            title="Horaires d'ouverture"
            description="L'app passe en mode boutique automatiquement pendant les heures d'ouverture."
          />
          <SettingsLink
            href="/settings/questions"
            icon="reorder"
            title="Questionnaire client"
            description="Réordonner, ajouter ou retirer des questions du formulaire."
          />
          <SettingsLink
            href="/newsletter/stock"
            icon="inventory_2"
            title="Stock parfums"
            description="Gérer le catalogue utilisé par la newsletter."
          />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <DataLabel emphasis="high">SECTION:COMPTE</DataLabel>
        <button
          type="button"
          onClick={signOut}
          className="flex items-center justify-between gap-4 w-full px-4 py-4 border-2 border-on-background bg-background hover:bg-on-background hover:text-background transition-colors duration-150"
        >
          <span className="flex items-center gap-3">
            <Icon name="logout" />
            <span className="font-sans font-bold uppercase tracking-tight text-sm">
              Se déconnecter
            </span>
          </span>
          <Icon name="chevron_right" className="opacity-60" />
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
      className="flex items-start justify-between gap-4 w-full px-4 py-4 border-2 border-on-background bg-background hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[4px_4px_0px_0px_currentColor] transition-all duration-150"
    >
      <span className="flex items-start gap-3 min-w-0">
        <Icon name={icon} className="mt-0.5 flex-shrink-0" />
        <span className="flex flex-col min-w-0">
          <span className="font-sans font-bold uppercase tracking-tight text-sm">
            {title}
          </span>
          <span className="text-xs opacity-70 mt-0.5">
            {description}
          </span>
        </span>
      </span>
      <Icon name="chevron_right" className="opacity-40 mt-0.5 flex-shrink-0" />
    </Link>
  );
}
