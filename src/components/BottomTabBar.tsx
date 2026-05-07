"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";
import { useShopRole } from "@/lib/role";
import { useShopMode } from "@/lib/service-mode";

type Tab = {
  href: string;
  label: string;
  icon: string;
  activeMatch: (pathname: string) => boolean;
  /** When true, the tab is hidden during in_service (boutique open hours)
   *  so a client handling the device can't reach confidential pages. */
  adminOnly?: boolean;
};

const BOUTIQUE_TABS: Tab[] = [
  {
    href: "/pour-un-client",
    label: "Client",
    icon: "person_add",
    activeMatch: (p) => p.startsWith("/pour-un-client"),
  },
  {
    href: "/clients",
    label: "Mes clients",
    icon: "groups",
    activeMatch: (p) => p.startsWith("/clients"),
  },
  {
    href: "/newsletter",
    label: "Newsletter",
    icon: "send",
    activeMatch: (p) => p.startsWith("/newsletter"),
    adminOnly: true,
  },
  {
    href: "/settings",
    label: "Réglages",
    icon: "tune",
    activeMatch: (p) => p.startsWith("/settings"),
    adminOnly: true,
  },
];

const USER_TABS: Tab[] = [
  {
    href: "/choix-boutique",
    label: "Boutiques",
    icon: "storefront",
    activeMatch: (p) => p === "/" || p.startsWith("/choix-boutique") || p.startsWith("/boutique-form"),
  },
  {
    href: "/settings",
    label: "Compte",
    icon: "person",
    activeMatch: (p) => p.startsWith("/settings"),
  },
];

export function BottomTabBar() {
  const pathname = usePathname();
  const { isBoutique, loading } = useShopRole();
  const mode = useShopMode();

  if (loading) return null;

  const allTabs = isBoutique ? BOUTIQUE_TABS : USER_TABS;
  // Hide admin-only tabs (newsletter, settings) when the boutique is open.
  const tabs =
    mode === "in_service"
      ? allTabs.filter((t) => !t.adminOnly)
      : allTabs;

  return (
    <nav className="fixed bottom-0 left-0 w-full z-40 bg-background/85 backdrop-blur-xl border-t border-outline-variant/40">
      <ul className="flex justify-around items-center w-full max-w-screen-md mx-auto px-2 pt-3 safe-bottom">
        {tabs.map((tab) => {
          const active = tab.activeMatch(pathname);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className={clsx(
                  "flex flex-col items-center gap-1 py-1 active:opacity-50 transition-all",
                  active
                    ? "text-on-background scale-105"
                    : "text-outline hover:text-on-background",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon name={tab.icon} filled={active} size={22} />
                <span className="text-[9px] uppercase tracking-[0.15em] font-medium">
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
