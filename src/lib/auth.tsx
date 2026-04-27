"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type AuthState = {
  user: User | null;
  session: Session | null;
  /** True until the initial session check resolves (or times out). */
  loading: boolean;
  /** Human-readable error from the last initialization attempt, or null. */
  error: string | null;
  signOut: () => Promise<void>;
  /** Re-run the session init — call this when the user taps a "retry" CTA. */
  retry: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

/** If getSession doesn't resolve in this window, unblock the UI.
 *  Supabase sometimes hangs on token refresh when the network is flaky,
 *  leaving the whole app stuck on a loading spinner. Better to show the
 *  login page with an error than to freeze. */
const SESSION_INIT_TIMEOUT_MS = 6000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label}_TIMEOUT`)),
      ms,
    );
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    withTimeout(
      supabase.auth.getSession(),
      SESSION_INIT_TIMEOUT_MS,
      "GET_SESSION",
    )
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.session);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("[auth] getSession failed:", msg);
        setError(msg);
        // Don't block the UI forever — fall through to a logged-out state.
        // Any valid session cached by Supabase will still surface via
        // onAuthStateChange below if it arrives later.
        setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (cancelled) return;
      setSession(sess);
      setLoading(false);
      setError(null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [retryTick]);

  const signOut = useCallback(async () => {
    try {
      await withTimeout(supabase.auth.signOut(), 5000, "SIGN_OUT");
    } catch (e) {
      // Even on failure, clear local state optimistically — the user
      // expects logout to "work" from their POV.
      console.warn("[auth] signOut failed, clearing local state anyway:", e);
    }
    setSession(null);
  }, []);

  const retry = useCallback(() => setRetryTick((n) => n + 1), []);

  const value = useMemo<AuthState>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      error,
      signOut,
      retry,
    }),
    [session, loading, error, signOut, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/**
 * Hard auth gate. Use at the top of any page that requires a logged-in user.
 * If the auth state is settled and there's no user, replaces the URL with
 * `/login?redirect=<current-path>` so the user lands back here after signup.
 *
 * Returns the same `{user, loading}` you'd get from useAuth — components can
 * still render a spinner while loading=true, and check user before doing
 * anything that needs an authenticated identity.
 */
export function useRequireAuth(): { user: User | null; loading: boolean } {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user) return;
    const here = pathname + (search.toString() ? `?${search.toString()}` : "");
    router.replace(`/login?redirect=${encodeURIComponent(here)}`);
  }, [user, loading, pathname, search, router]);

  return { user, loading };
}
