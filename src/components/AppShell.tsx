import { TopHeader } from "@/components/TopHeader";
import { BottomTabBar } from "@/components/BottomTabBar";
import { ConciergeWidget } from "@/components/ConciergeWidget";

/**
 * App shell: persistent top header + bottom tab bar + floating concierge.
 * The shell stays mounted across navigation; pages render inside <main>.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopHeader />
      <main className="flex-1 pt-24 pb-24 w-full max-w-screen-md mx-auto">
        {children}
      </main>
      <BottomTabBar />
      <ConciergeWidget />
    </>
  );
}
