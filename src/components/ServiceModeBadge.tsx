"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  useShopMode,
  useSettingsBypass,
  setSettingsBypass,
} from "@/lib/service-mode";

/**
 * Right-side widget for the TopHeader. Three states :
 *
 *   - out_service              → classic "Réglages" link (gear icon)
 *   - in_service, locked       → 🔒 Boutique : tap to open the password
 *                                modal that unlocks /settings/* for the
 *                                rest of the tab session.
 *   - in_service, unlocked     → 🔓 Admin : tap to re-lock and bounce
 *                                back to /pour-un-client.
 *
 * Used so the boutique can edit questions / hours mid-day without exposing
 * those screens to a client handling the device.
 */
export function ServiceModeBadge() {
  const router = useRouter();
  const mode = useShopMode();
  const bypass = useSettingsBypass();
  const [unlockOpen, setUnlockOpen] = useState(false);

  if (mode === "out_service") {
    return (
      <Link
        href="/settings"
        className="text-on-background hover:opacity-60 active:scale-95 transition-all duration-150"
        aria-label="Réglages"
      >
        <Icon name="settings" />
      </Link>
    );
  }

  // in_service
  if (bypass) {
    return (
      <button
        type="button"
        onClick={() => {
          setSettingsBypass(false);
          router.replace("/pour-un-client");
        }}
        aria-label="Reverrouiller le mode boutique"
        className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest font-bold border-2 border-on-background bg-on-background text-background px-2 py-0.5"
      >
        <Icon name="lock_open" size={14} />
        Admin
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setUnlockOpen(true)}
        aria-label="Déverrouiller les réglages"
        className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest border-2 border-on-background px-2 py-0.5 hover:bg-on-background hover:text-background transition-colors duration-150"
      >
        <Icon name="lock" size={14} />
        Boutique
      </button>
      {unlockOpen && (
        <PortalModal>
          <UnlockModal
            onClose={() => setUnlockOpen(false)}
            onSuccess={() => {
              setUnlockOpen(false);
              router.push("/settings");
            }}
          />
        </PortalModal>
      )}
    </>
  );
}

/**
 * Renders children into <body> so they escape the TopHeader's stacking
 * context — without this the modal ends up behind the BottomTabBar
 * (both at z-40 globally) because z-index is scoped to its parent
 * stacking root.
 */
function PortalModal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

/* ─── Password modal ─────────────────────────────────────────────── */

function UnlockModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { user } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!user?.email) {
      setError("Session perdue — reconnecte-toi.");
      return;
    }
    if (!password) {
      setError("Mot de passe requis.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (authErr) throw authErr;
      setSettingsBypass(true);
      onSuccess();
    } catch {
      // We swallow the underlying error to avoid leaking enumerated
      // failure types to a client manipulating the device.
      setError("Mot de passe incorrect.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-on-background/40 flex items-end justify-center"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-screen-md bg-background border-t-2 border-on-background p-6 flex flex-col gap-4"
      >
        <header className="flex items-center justify-between pl-4 relative">
          <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
          <div>
            <span className="font-mono text-xs tracking-widest uppercase opacity-60">UNLOCK · ADMIN</span>
            <h3 className="font-sans font-black text-2xl tracking-tighter uppercase mt-1">
              Déverrouiller
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="opacity-60 hover:opacity-100"
          >
            <Icon name="close" />
          </button>
        </header>
        <p className="font-cormorant italic text-base opacity-70 leading-relaxed">
          « Pendant les heures d'ouverture, l'app cache les réglages.
          Saisis ton mot de passe boutique pour les rouvrir. »
        </p>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
          className="w-full px-4 py-3 bg-background border-2 border-on-background font-mono text-sm focus:outline-none focus:shadow-[4px_4px_0px_0px_currentColor] placeholder:opacity-40 transition-shadow"
        />
        {error && (
          <div className="border-2 border-on-background bg-on-background text-background px-3 py-2">
            <p className="font-mono text-xs uppercase tracking-wider">{error}</p>
          </div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full py-3.5 px-6 bg-on-background text-background border-2 border-on-background shadow-[4px_4px_0px_0px_currentColor] hover:shadow-[2px_2px_0px_0px_currentColor] hover:translate-x-[2px] hover:translate-y-[2px] text-sm font-bold uppercase tracking-widest disabled:opacity-50 transition-all duration-150"
        >
          {busy ? "Vérification…" : "Déverrouiller"}
        </button>
      </form>
    </div>
  );
}
