"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Drawer } from "@/components/Drawer";

const ROOT_TABS = [
  "/",
  "/search",
  "/scan",
  "/balade",
  "/wishlist",
  "/profile",
];

export function TopHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // On nested pages (anything that's not a root tab), show a back arrow
  // instead of the menu button. The drawer is reachable from any root tab.
  const isRootTab = ROOT_TABS.includes(pathname);

  return (
    <>
      <header className="fixed top-0 left-0 w-full z-40 bg-background/70 backdrop-blur-xl border-b border-outline-variant/40">
        <nav className="flex justify-between items-center px-6 py-4 w-full max-w-screen-md mx-auto safe-top">
          {isRootTab ? (
            <button
              type="button"
              className="text-on-background hover:opacity-70 active:scale-95 transition-all duration-200"
              aria-label="Ouvrir le menu"
              onClick={() => setDrawerOpen(true)}
            >
              <Icon name="menu" />
            </button>
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

          <Link href="/" aria-label="Accueil">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-laniche.png"
              alt="La Niche"
              className="h-12 w-auto object-contain dark:invert"
            />
          </Link>

          <Link
            href="/profile"
            className="text-on-background hover:opacity-70 active:scale-95 transition-all duration-200"
            aria-label="Profil"
          >
            <Icon name="person" />
          </Link>
        </nav>
      </header>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
