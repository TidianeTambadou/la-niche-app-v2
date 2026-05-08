"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ServiceModeBadge } from "@/components/ServiceModeBadge";
import { useShopRole } from "@/lib/role";

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
  const isRoot = ROOT_PATHS.has(pathname);

  return (
    <header className="fixed top-0 left-0 w-full z-40 bg-background border-b-2 border-on-background">
      <nav className="flex justify-between items-center px-6 py-4 w-full max-w-screen-md mx-auto safe-top">
        {isRoot ? (
          <span className="w-6" aria-hidden />
        ) : (
          <button
            type="button"
            className="text-on-background hover:opacity-60 active:scale-95 transition-all duration-150"
            aria-label="Retour"
            onClick={() => router.back()}
          >
            <Icon name="arrow_back" />
          </button>
        )}

        <Link
          href={isBoutique ? "/pour-un-client" : "/choix-boutique"}
          aria-label="Accueil"
          className="flex items-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-laniche.png"
            alt="Gallery La Niche"
            className="h-16 w-auto object-contain dark:invert"
          />
        </Link>

        <ServiceModeBadge />
      </nav>
    </header>
  );
}
