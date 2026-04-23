"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/lib/auth";
import { readProfileFromUser } from "@/lib/profile";

const NAV = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/search", label: "Search", icon: "search" },
  { href: "/scan", label: "Scan", icon: "qr_code_scanner" },
  { href: "/balade", label: "Balade", icon: "directions_walk" },
  { href: "/wishlist", label: "Wishlist", icon: "favorite" },
  { href: "/profile", label: "Profile", icon: "person" },
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export function Drawer({ open, onClose }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const profile = readProfileFromUser(user);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Close on route change
  useEffect(() => {
    if (open) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function onSignOut() {
    await signOut();
    onClose();
    router.push("/login");
  }

  return (
    <div
      className={clsx(
        "fixed inset-0 z-50 transition-opacity duration-300",
        open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
      )}
      onClick={onClose}
      role={open ? "dialog" : undefined}
      aria-modal={open ? true : undefined}
      aria-label="Menu principal"
      aria-hidden={!open}
    >
      <div className="absolute inset-0 bg-primary/40 backdrop-blur-sm" />

      <aside
        className={clsx(
          "absolute top-0 left-0 bottom-0 w-[88%] max-w-[360px] bg-background flex flex-col transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-5 border-b border-outline-variant/40 flex items-center justify-between safe-top">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-laniche.png"
            alt="La Niche"
            className="h-6 w-auto object-contain dark:invert"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le menu"
            className="text-on-background hover:opacity-70 active:scale-95 transition-all"
          >
            <Icon name="close" />
          </button>
        </header>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <p className="text-[10px] uppercase tracking-widest text-outline mb-3 px-4">
            Navigation
          </p>
          <ul className="space-y-px">
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={clsx(
                      "flex items-center gap-4 px-4 py-3 transition-colors",
                      active
                        ? "bg-primary text-on-primary"
                        : "hover:bg-surface-container-low",
                    )}
                  >
                    <Icon name={item.icon} filled={active} size={20} />
                    <span className="text-sm uppercase tracking-widest font-medium">
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 pt-6 border-t border-outline-variant/40">
            <p className="text-[10px] uppercase tracking-widest text-outline mb-3 px-4">
              ADN olfactif
            </p>
            <Link
              href="/onboarding"
              className="flex items-center gap-4 px-4 py-3 hover:bg-surface-container-low transition-colors"
            >
              <Icon name="biotech" size={20} />
              <div className="flex-1 min-w-0">
                <span className="block text-sm uppercase tracking-widest font-medium">
                  {profile ? "Refaire mon profil" : "Démarrer le profilage"}
                </span>
                <span className="block text-[10px] uppercase tracking-widest text-outline mt-0.5">
                  {profile
                    ? `Mis à jour ${new Date(profile.completed_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}`
                    : "5 questions, 1 minute"}
                </span>
              </div>
              <Icon name="arrow_forward" size={16} className="text-outline" />
            </Link>
          </div>
        </nav>

        <div className="px-6 py-4 border-t border-outline-variant/40">
          <p className="text-[10px] uppercase tracking-widest text-outline mb-3">
            Apparence
          </p>
          <ThemeToggle />
        </div>

        <footer className="px-6 py-5 border-t border-outline-variant/40 safe-bottom">
          {user ? (
            <div className="flex flex-col gap-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-outline">
                Connecté
              </p>
              <p className="text-sm font-medium truncate">{user.email}</p>
              <button
                type="button"
                onClick={onSignOut}
                className="text-[10px] uppercase tracking-widest font-bold border border-outline-variant px-4 py-2 hover:border-error hover:text-error transition-colors flex items-center gap-2 self-start"
              >
                <Icon name="logout" size={14} />
                Déconnexion
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="block w-full py-3 bg-primary text-on-primary rounded-full text-center text-[10px] uppercase tracking-widest font-bold active:scale-95 transition-transform"
            >
              Se connecter
            </Link>
          )}
        </footer>
      </aside>
    </div>
  );
}
