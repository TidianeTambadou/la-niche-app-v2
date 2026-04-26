"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const REF_KEY = "la-niche.referral-code";

function RejoindrePage() {
  const router = useRouter();
  const params = useSearchParams();
  const ref = params.get("ref");

  useEffect(() => {
    if (ref) {
      try {
        localStorage.setItem(REF_KEY, ref.toUpperCase());
      } catch {
        /* ignore */
      }
    }
    router.replace("/login");
  }, [ref, router]);

  return (
    <main className="min-h-[100dvh] flex items-center justify-center">
      <p className="text-[10px] uppercase tracking-widest text-outline animate-pulse">
        Redirection…
      </p>
    </main>
  );
}

export default function Page() {
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
      <RejoindrePage />
    </Suspense>
  );
}
