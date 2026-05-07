"use client";

import { useState } from "react";
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
        className="text-on-background hover:opacity-70 active:scale-95 transition-all duration-200"
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
        className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-primary border border-primary/40 rounded-full px-2 py-0.5"
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
        className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-outline hover:text-on-background"
      >
        <Icon name="lock" size={14} />
        Boutique
      </button>
      {unlockOpen && (
        <UnlockModal
          onClose={() => setUnlockOpen(false)}
          onSuccess={() => {
            setUnlockOpen(false);
            router.push("/settings");
          }}
        />
      )}
    </>
  );
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
      className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-screen-md bg-surface rounded-t-3xl p-6 flex flex-col gap-4"
      >
        <header className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Déverrouiller les réglages</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="text-outline"
          >
            <Icon name="close" />
          </button>
        </header>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          Pendant les heures d'ouverture, l'app cache les réglages pour qu'aucun
          client ne tombe dessus. Saisis ton mot de passe boutique pour les
          rouvrir le temps de la session.
        </p>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
          className="w-full px-4 py-3 bg-surface-container rounded-2xl border border-outline-variant text-sm"
        />
        {error && <p className="text-sm text-error">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full py-3 bg-primary text-on-primary rounded-full text-sm font-bold uppercase tracking-widest disabled:opacity-50"
        >
          {busy ? "Vérification…" : "Déverrouiller"}
        </button>
      </form>
    </div>
  );
}
