"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useShopRole } from "@/lib/role";
import { useShopMode } from "@/lib/service-mode";

const ROOT_PATHS = new Set([
  "/",
  "/pour-un-client",
  "/clients",
  "/newsletter",
  "/settings",
  "/choix-boutique",
]);

export function TopHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { isBoutique } = useShopRole();
  const mode = useShopMode();
  const isRoot = ROOT_PATHS.has(pathname);
  const isKiosk = mode === "in_service";

  return (
    <header className="fixed top-0 left-0 w-full z-40 bg-background/70 backdrop-blur-xl border-b border-outline-variant/40">
      <nav className="flex justify-between items-center px-6 py-4 w-full max-w-screen-md mx-auto safe-top">
        {isRoot ? (
          <span className="w-6" aria-hidden />
        ) : (
          <button
            type="button"
            className="text-on-background hover:opacity-70 active:scale-95 transition-all duration-200"
            aria-label="Retour"
            onClick={() => router.back()}
          >
            <Icon name="arrow_back" />
          </button>
        )}

        <Link href={isBoutique ? "/pour-un-client" : "/choix-boutique"} aria-label="Accueil">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-laniche.png"
            alt="La Niche"
            className="h-12 w-auto object-contain dark:invert"
          />
        </Link>

        {isKiosk ? (
          <span
            className="text-outline flex items-center gap-1 text-[10px] uppercase tracking-widest"
            aria-label="Mode boutique actif"
          >
            <Icon name="lock" size={14} />
            Boutique
          </span>
        ) : (
          <Link
            href="/settings"
            className="text-on-background hover:opacity-70 active:scale-95 transition-all duration-200"
            aria-label="Réglages"
          >
            <Icon name="settings" />
          </Link>
        )}
      </nav>
    </header>
  );
}
