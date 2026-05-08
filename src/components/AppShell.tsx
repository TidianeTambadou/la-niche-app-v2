"use client";

import { usePathname } from "next/navigation";
import { TopHeader } from "@/components/TopHeader";
import { BottomTabBar } from "@/components/BottomTabBar";

const NAV_FREE_PREFIXES = ["/login"];

/**
 * App shell: persistent top header + bottom tab bar. Pages in
 * `NAV_FREE_PREFIXES` escape the shell entirely (login owns its full surface).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const navFree = NAV_FREE_PREFIXES.some((p) => pathname.startsWith(p));

  if (navFree) {
    return <>{children}</>;
  }

  return (
    <>
      <TopHeader />
      <main className="flex-1 pt-32 pb-24 w-full max-w-screen-md mx-auto">
        {children}
      </main>
      <BottomTabBar />
    </>
  );
}
