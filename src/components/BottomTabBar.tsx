"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";

type Tab = {
  href: string;
  label: string;
  icon: string;
  /** Pathname prefixes that should mark this tab as active. */
  activeMatch: (pathname: string) => boolean;
};

const TABS: Tab[] = [
  {
    href: "/",
    label: "Home",
    icon: "home",
    activeMatch: (p) => p === "/",
  },
  {
    href: "/search",
    label: "Search",
    icon: "search",
    activeMatch: (p) => p.startsWith("/search"),
  },
  {
    href: "/scan",
    label: "Scan",
    icon: "qr_code_scanner",
    activeMatch: (p) => p.startsWith("/scan"),
  },
  {
    href: "/balade",
    label: "Balade",
    icon: "directions_walk",
    activeMatch: (p) => p.startsWith("/balade"),
  },
  {
    href: "/wishlist",
    label: "Wishlist",
    icon: "favorite",
    activeMatch: (p) => p.startsWith("/wishlist"),
  },
  {
    href: "/profile",
    label: "Profile",
    icon: "person",
    activeMatch: (p) => p.startsWith("/profile"),
  },
];

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 w-full z-40 bg-background/85 backdrop-blur-xl border-t border-outline-variant/40">
      <ul className="flex justify-around items-center w-full max-w-screen-md mx-auto px-2 pt-3 safe-bottom">
        {TABS.map((tab) => {
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
