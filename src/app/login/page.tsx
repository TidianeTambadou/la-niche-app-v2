"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

type Mode = "signin" | "signup" | "magic";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";
  const { user, loading: authLoading } = useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // If already logged in, bounce to redirect target.
  useEffect(() => {
    if (!authLoading && user) {
      router.replace(redirect);
    }
  }, [authLoading, user, redirect, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Renseigne une adresse email.");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmed,
          password,
        });
        if (error) throw error;
        router.push(redirect);
        router.refresh();
      } else if (mode === "signup") {
        const onboardingRedirect = "/onboarding";
        const { data, error } = await supabase.auth.signUp({
          email: trimmed,
          password,
          options: {
            emailRedirectTo:
              typeof window !== "undefined"
                ? `${window.location.origin}${onboardingRedirect}`
                : undefined,
          },
        });
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
        const { error } = await supabase.auth.signInWithOtp({
          email: trimmed,
          options: {
            emailRedirectTo:
              typeof window !== "undefined"
                ? `${window.location.origin}${redirect}`
                : undefined,
          },
        });
        if (error) throw error;
        setInfo("Lien de connexion envoyé. Ouvre-le depuis ta boîte mail.");
      }
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Une erreur est survenue.";
      setError(message);
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
              <label
                htmlFor="password"
                className="text-[10px] uppercase tracking-[0.2em] font-bold text-outline block mb-2"
              >
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="•••••••••"
                className="w-full bg-transparent border-b border-outline-variant py-2 text-base focus:outline-none focus:border-primary placeholder:text-outline/50 transition-colors"
              />
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
