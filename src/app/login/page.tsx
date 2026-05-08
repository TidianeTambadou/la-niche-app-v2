"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { GridBackground } from "@/components/brutalist/GridBackground";
import { DataLabel } from "@/components/brutalist/DataLabel";
import { BrutalistButton } from "@/components/brutalist/BrutalistButton";

type Mode = "signin" | "signup" | "magic";

/** Hard cap on any single auth call — if Supabase hangs (flaky wifi, cold
 *  project), we surface a retryable error instead of an infinite spinner. */
const AUTH_CALL_TIMEOUT_MS = 12000;

function withAuthTimeout<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error("NETWORK_TIMEOUT")), AUTH_CALL_TIMEOUT_MS);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Map Supabase / browser-fetch errors to friendly French copy. Supabase
 *  returns English strings; Safari's generic network error is literally
 *  "Load failed". We translate both so users know what to do next. */
function translateAuthError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid_credentials")) {
    return "Email ou mot de passe incorrect.";
  }
  if (m.includes("email not confirmed")) {
    return "Email pas encore confirmé — ouvre le lien reçu par mail.";
  }
  if (m.includes("user already registered") || m.includes("already registered")) {
    return "Un compte existe déjà avec cet email. Bascule sur « Connexion » ou utilise le lien magique.";
  }
  if (m.includes("password should be at least")) {
    return "Mot de passe trop court : 8 caractères minimum.";
  }
  if (m.includes("weak password") || m.includes("password is too weak")) {
    return "Mot de passe trop faible. Ajoute des chiffres ou des caractères spéciaux.";
  }
  if (m.includes("email rate limit") || m.includes("over email send rate")) {
    return "Trop d'envois en peu de temps. Patiente une minute avant de réessayer.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Trop de tentatives. Patiente une minute.";
  }
  if (m.includes("unable to validate email") || m.includes("invalid email")) {
    return "Email invalide.";
  }
  if (
    m.includes("network_timeout") ||
    m.includes("load failed") ||
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("fetch error")
  ) {
    return "Connexion au serveur impossible. Vérifie ta connexion internet et réessaie.";
  }
  if (
    m.includes("database error saving new user") ||
    m.includes("unexpected_failure")
  ) {
    return "Création de compte impossible côté serveur. Un trigger Supabase bloque l'inscription — contacte l'admin pour vérifier la base.";
  }
  return raw;
}

// `useSearchParams` opts the page into dynamic rendering; wrap in Suspense so
// Next.js can pre-render a fallback during `next build`.
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-[100dvh] flex items-center justify-center bg-background">
          <DataLabel>LOADING…</DataLabel>
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
}

/**
 * Resolve where to land after a successful sign-in. Users whose `auth.uid()`
 * is in `public.shops` are boutique accounts and should always go to their
 * dashboard so they can manage stock — unless an explicit `redirect` query
 * param overrides that. Returns `null` when the lookup fails so callers can
 * fall back to the requested redirect.
 */
async function resolvePostLoginRedirect(
  userId: string,
  requested: string,
): Promise<string> {
  // Honour an explicit, non-default redirect first (e.g. /wishlist).
  if (requested && requested !== "/") return requested;
  try {
    const { data } = await supabase
      .from("shops")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (data?.id) return "/boutique";
  } catch {
    /* fall through */
  }
  return requested || "/";
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";
  const { user, loading: authLoading } = useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // If already logged in, bounce to redirect target — boutique accounts
  // land on /boutique unless an explicit redirect was requested.
  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    resolvePostLoginRedirect(user.id, redirect).then((target) => {
      if (!cancelled) router.replace(target);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, redirect, router]);

  async function sendPasswordReset() {
    setError(null);
    setInfo(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Renseigne ton email d'abord, puis tape « Mot de passe oublié ».");
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError("Tu sembles hors-ligne.");
      return;
    }
    setResetting(true);
    try {
      const { error } = await withAuthTimeout(
        supabase.auth.resetPasswordForEmail(trimmed, {
          redirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/login`
              : undefined,
        }),
      );
      if (error) throw error;
      setInfo(
        "Email de réinitialisation envoyé. Ouvre-le pour choisir un nouveau mot de passe.",
      );
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : "Une erreur est survenue.";
      console.warn("[auth] reset failed:", raw);
      setError(translateAuthError(raw));
    } finally {
      setResetting(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setError("Renseigne une adresse email.");
      return;
    }
    // Basic shape check — saves a roundtrip when the input is clearly wrong.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Email invalide.");
      return;
    }
    if (mode !== "magic") {
      if (!password) {
        setError("Renseigne un mot de passe.");
        return;
      }
      if (mode === "signup" && password.length < 8) {
        setError("Mot de passe trop court : 8 caractères minimum.");
        return;
      }
    }
    // Short-circuit when the browser knows we're offline — Safari otherwise
    // hangs for 30s before throwing "Load failed".
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError(
        "Tu sembles hors-ligne. Vérifie ta connexion internet puis réessaie.",
      );
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "signin") {
        const { data: signInData, error } = await withAuthTimeout(
          supabase.auth.signInWithPassword({ email: trimmed, password }),
        );
        if (error) throw error;
        const target = signInData?.user
          ? await resolvePostLoginRedirect(signInData.user.id, redirect)
          : redirect;
        router.push(target);
        router.refresh();
      } else if (mode === "signup") {
        const onboardingRedirect = "/onboarding";
        const { data, error } = await withAuthTimeout(
          supabase.auth.signUp({
            email: trimmed,
            password,
            options: {
              // `app: "mobile"` tells the shared Supabase project's
              // handle_new_user() trigger to skip creating a `shops` row
              // for this user. See migrations/2026-04-24-fix-signup-trigger.sql.
              data: { app: "mobile" },
              emailRedirectTo:
                typeof window !== "undefined"
                  ? `${window.location.origin}${onboardingRedirect}`
                  : undefined,
            },
          }),
        );
        if (error) throw error;
        // Claim referral if the user arrived via a referral link
        if (data.session) {
          const refCode = (() => {
            try { return localStorage.getItem("la-niche.referral-code"); } catch { return null; }
          })();
          if (refCode) {
            fetch("/api/referral", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${data.session.access_token}`,
              },
              body: JSON.stringify({ action: "claim", code: refCode }),
            }).then(() => {
              try { localStorage.removeItem("la-niche.referral-code"); } catch { /* */ }
            }).catch(() => { /* best effort */ });
          }
          router.push(onboardingRedirect);
          router.refresh();
        } else {
          setInfo(
            "Compte créé. Confirme ton email puis tu seras dirigé vers le profilage olfactif.",
          );
        }
      } else {
        const { error } = await withAuthTimeout(
          supabase.auth.signInWithOtp({
            email: trimmed,
            options: {
              // Same marker as signup — OTP creates a user on first use,
              // so the trigger needs to know this is a mobile customer too.
              data: { app: "mobile" },
              emailRedirectTo:
                typeof window !== "undefined"
                  ? `${window.location.origin}${redirect}`
                  : undefined,
            },
          }),
        );
        if (error) throw error;
        setInfo("Lien de connexion envoyé. Ouvre-le depuis ta boîte mail.");
      }
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : "Une erreur est survenue.";
      console.warn(`[auth] ${mode} failed:`, raw);
      setError(translateAuthError(raw));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-[100dvh] relative bg-background flex flex-col justify-between max-w-screen-md mx-auto px-6 pt-10 pb-8 safe-top safe-bottom">
      <GridBackground />
      <header className="relative z-10 mb-8">
        <div className="flex items-center justify-between mb-10">
          <Link href="/" aria-label="Accueil" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-laniche.png"
              alt="Gallery La Niche"
              className="h-20 w-auto object-contain dark:invert"
            />
          </Link>
          <DataLabel>BUILD://v2.0</DataLabel>
        </div>
        <div className="flex items-center gap-4">
          <DataLabel emphasis="high">STEP:00</DataLabel>
          <div className="h-[2px] flex-1 bg-on-background/10 relative">
            <div className="absolute inset-y-0 left-0 w-1/4 bg-on-background" />
          </div>
          <DataLabel>IDENTIFICATION</DataLabel>
        </div>
      </header>

      <section className="relative z-10 flex-1 flex flex-col justify-center pl-6">
        <div className="absolute left-0 top-4 bottom-4 w-[2px] bg-on-background" />
        <h1 className="font-sans font-black text-5xl md:text-6xl tracking-tighter leading-none uppercase mb-6">
          <span className="block">{mode === "signup" ? "CRÉE" : "ENTRE"}</span>
          <span className="block ml-6">{mode === "signup" ? "TON" : "DANS"}</span>
          <span className="block ml-12">
            {mode === "signup" ? "COMPTE" : "LE VESTIAIRE"}
          </span>
        </h1>
        <p className="font-cormorant italic text-lg opacity-60 max-w-md mb-10">
          {mode === "magic"
            ? "« On t'envoie un lien de connexion à usage unique par email. »"
            : "« Ta mémoire olfactive, synchronisée. »"}
        </p>

        <div className="flex gap-6 mb-8 border-b-2 border-on-background pb-3">
          <ModeTab
            active={mode === "signin"}
            onClick={() => {
              setMode("signin");
              setError(null);
              setInfo(null);
            }}
            label="Connexion"
          />
          <ModeTab
            active={mode === "signup"}
            onClick={() => {
              setMode("signup");
              setError(null);
              setInfo(null);
            }}
            label="Création"
          />
          <ModeTab
            active={mode === "magic"}
            onClick={() => {
              setMode("magic");
              setError(null);
              setInfo(null);
            }}
            label="Lien magique"
          />
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <div>
            <label htmlFor="email" className="block mb-2">
              <DataLabel emphasis="high">EMAIL</DataLabel>
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom@domaine.com"
              className="w-full bg-background border-2 border-on-background py-3 px-4 font-mono text-sm focus:outline-none focus:shadow-[4px_4px_0px_0px_currentColor] placeholder:opacity-40 transition-shadow"
            />
          </div>

          {mode !== "magic" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password">
                  <DataLabel emphasis="high">PASSWORD</DataLabel>
                </label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={sendPasswordReset}
                    disabled={resetting}
                    className="font-mono text-[10px] uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity disabled:opacity-30"
                  >
                    {resetting ? "ENVOI…" : "OUBLIÉ ?"}
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  required
                  minLength={mode === "signup" ? 8 : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="•••••••••"
                  className="w-full bg-background border-2 border-on-background py-3 px-4 pr-12 font-mono text-sm focus:outline-none focus:shadow-[4px_4px_0px_0px_currentColor] placeholder:opacity-40 transition-shadow"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={
                    showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 opacity-60 hover:opacity-100 transition-opacity"
                >
                  <Icon
                    name={showPassword ? "visibility_off" : "visibility"}
                    size={18}
                  />
                </button>
              </div>
              {mode === "signup" && (
                <p className="font-mono text-[10px] uppercase tracking-widest opacity-60 mt-2">
                  MIN:08
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="border-2 border-on-background bg-on-background text-background px-4 py-3">
              <p className="font-mono text-xs uppercase tracking-wider">{error}</p>
            </div>
          )}
          {info && (
            <div className="border-2 border-on-background bg-on-background/5 px-4 py-3">
              <p className="font-mono text-xs uppercase tracking-wider opacity-80">
                {info}
              </p>
            </div>
          )}

          <BrutalistButton
            type="submit"
            disabled={submitting}
            size="lg"
            className="w-full"
          >
            {submitting ? (
              <Icon name="progress_activity" size={16} className="animate-spin" />
            ) : (
              <Icon name="arrow_forward" size={16} />
            )}
            {submitting
              ? "…"
              : mode === "signin"
                ? "Se connecter"
                : mode === "signup"
                  ? "Créer mon compte"
                  : "Envoyer le lien"}
          </BrutalistButton>
        </form>
      </section>

      <footer className="relative z-10 mt-8 pt-6 border-t-2 border-on-background flex items-center justify-between gap-4">
        <Link
          href="/"
          className="font-mono text-[10px] uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity"
        >
          ← ACCUEIL
        </Link>
        <span className="font-cormorant italic text-sm opacity-60 text-right max-w-[200px]">
          « Synthesis is the convergence of data and intuition. »
        </span>
      </footer>
    </main>
  );
}

function ModeTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex flex-col items-start group transition-opacity pb-1",
        active ? "opacity-100" : "opacity-40 hover:opacity-100",
      )}
    >
      <span className="font-sans font-bold text-xs tracking-[0.2em] uppercase">
        {label}
      </span>
      <div
        className={clsx(
          "h-[2px] mt-2 bg-on-background transition-all",
          active ? "w-full" : "w-0",
        )}
      />
    </button>
  );
}
