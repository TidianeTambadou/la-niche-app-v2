"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useShopRole } from "@/lib/role";

/**
 * Home page = pure router. Redirects to the right home for the role:
 *   - logged out      → /login
 *   - boutique        → /pour-un-client
 *   - regular user    → /choix-boutique
 *
 * Renders nothing; effect runs as soon as auth + role resolve.
 */
export default function HomeRedirect() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { isBoutique, loading: roleLoading } = useShopRole();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (roleLoading) return;
    router.replace(isBoutique ? "/pour-un-client" : "/choix-boutique");
  }, [user, authLoading, isBoutique, roleLoading, router]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <span className="material-symbols-outlined animate-spin text-on-surface-variant">
        progress_activity
      </span>
    </div>
  );
}
