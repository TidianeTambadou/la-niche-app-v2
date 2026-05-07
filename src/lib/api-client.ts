"use client";

import { supabase } from "@/lib/supabase";

/**
 * Fetch wrapper that automatically attaches the current Supabase access
 * token. Throws when there's no session — callers should guard with
 * useRequireAuth before calling.
 */
export async function authedFetch<T = unknown>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("not_authenticated");

  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });

  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
    throw new Error(j.detail ?? j.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}
