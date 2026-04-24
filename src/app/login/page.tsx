"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

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
  return raw;
}

// `useSearchParams` opts the page into dynamic rendering; wrap in Suspense so
// Next.js can pre-render a fallback during `next build`.
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-[100dvh] flex items-center justify-center">
          <p className="text-[10px] uppercase tracking-widest text-outline">
            Chargement…
          </p>
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
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

  // If already logged in, bounce to redirect target.
  useEffect(() => {
    if (!authLoading && user) {
      router.replace(redirect);
    }
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
        const { error } = await withAuthTimeout(
          supabase.auth.signInWithPassword({ email: trimmed, password }),
        );
        if (error) throw error;
        router.push(redirect);
        router.refresh();
      } else if (mode === "signup") {
        const onboardingRedirect = "/onboarding";
        const { data, error } = await withAuthTimeout(
          supabase.auth.signUp({
            email: trimmed,
            password,
            options: {
              emailRedirectTo:
                typeof window !== "undefined"
                  ? `${window.location.origin}${onboardingRedirect}`
                  : undefined,
            },
          }),
        );
        if (error) throw error;
        if (data.session) {
          // Email confirmation disabled in Supabase: we already have a session.
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
    <main className="min-h-[100dvh] flex flex-col justify-between max-w-screen-md mx-auto px-6 pt-12 pb-10 safe-top safe-bottom">
      <header className="mb-10">
        <div className="flex items-center justify-between mb-10">
          <Link
            href="/"
            className="text-xl font-semibold tracking-[0.2em] uppercase"
          >
            LA NICHE
          </Link>
          <span className="text-[10px] font-mono text-outline uppercase">
            v1.0
          </span>
        </div>
        <div className="flex items-center gap-6 mb-12">
          <span className="text-[10px] uppercase tracking-[0.3em] font-semibold">
            Étape 00
          </span>
          <div className="h-px flex-1 bg-outline-variant">
            <div className="h-px w-1/4 bg-primary" />
          </div>
          <span className="text-[10px] uppercase tracking-[0.3em] text-on-surface-variant">
            Identification
          </span>
        </div>
      </header>

      <section className="flex-1 flex flex-col justify-center">
        <h1 className="text-5xl md:text-6xl font-extralight tracking-tighter leading-[0.9] mb-4">
          {mode === "signup" ? "Crée ton" : "Entre dans le"}
          <br />
          <span className="italic font-serif">
            {mode === "signup" ? "compte." : "vestiaire."}
          </span>
        </h1>
        <p className="text-sm text-on-surface-variant max-w-md leading-relaxed mb-10">
          {mode === "magic"
            ? "On t'envoie un lien de connexion à usage unique par email."
            : "Ta mémoire olfactive : wishlist, balades, placements corps. Synchronisés sur tous tes écrans."}
        </p>

        <div className="flex gap-6 mb-8 border-b border-outline-variant/40 pb-3">
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
            <label
              htmlFor="email"
              className="text-[10px] uppercase tracking-[0.2em] font-bold text-outline block mb-2"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom@domaine.com"
              className="w-full bg-transparent border-b border-outline-variant py-2 text-base focus:outline-none focus:border-primary placeholder:text-outline/50 transition-colors"
            />
          </div>

          {mode !== "magic" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="password"
                  className="text-[10px] uppercase tracking-[0.2em] font-bold text-outline"
                >
                  Mot de passe
                </label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={sendPasswordReset}
                    disabled={resetting}
                    className="text-[10px] uppercase tracking-widest text-outline hover:text-on-background transition-colors disabled:opacity-40"
                  >
                    {resetting ? "Envoi…" : "Mot de passe oublié ?"}
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
                  className="w-full bg-transparent border-b border-outline-variant py-2 pr-10 text-base focus:outline-none focus:border-primary placeholder:text-outline/50 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={
                    showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"
                  }
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-outline hover:text-on-background transition-colors"
                >
                  <Icon
                    name={showPassword ? "visibility_off" : "visibility"}
                    size={18}
                  />
                </button>
              </div>
              {mode === "signup" && (
                <p className="text-[10px] uppercase tracking-widest text-outline mt-2">
                  8 caractères minimum
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="border border-error/50 bg-error-container/20 px-4 py-3">
              <p className="text-xs text-error">{error}</p>
            </div>
          )}
          {info && (
            <div className="border border-outline-variant bg-surface-container-low px-4 py-3">
              <p className="text-xs text-on-surface-variant">{info}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.3em] font-bold active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <Icon name="progress_activity" size={16} />
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
          </button>
        </form>
      </section>

      <footer className="mt-10 pt-6 border-t border-outline-variant/40 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="text-[10px] uppercase tracking-widest text-outline hover:text-on-background transition-colors"
        >
          ← Retour à l&apos;accueil
        </Link>
        <span className="text-[10px] uppercase tracking-widest text-outline text-right max-w-[180px]">
          Synthesis is the convergence of data and intuition.
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
      <span className="text-xs font-bold tracking-[0.2em] uppercase">
        {label}
      </span>
      <div
        className={clsx(
          "h-0.5 mt-2 bg-primary transition-all",
          active ? "w-full" : "w-0",
        )}
      />
    </button>
  );
}
