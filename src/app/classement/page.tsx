"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

type LeaderboardRow = {
  user_id: string;
  display_name: string;
  points: number;
  rank: number;
  referral_count: number;
};

export default function ClassementPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [myPoints, setMyPoints] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("leaderboard_view")
        .select("user_id, display_name, points, rank, referral_count")
        .order("points", { ascending: false })
        .limit(50);

      setRows((data as LeaderboardRow[]) ?? []);

      if (user?.id) {
        const me = (data as LeaderboardRow[])?.find(
          (r) => r.user_id === user.id,
        );
        if (me) {
          setMyRank(Number(me.rank));
          setMyPoints(me.points);
        }
      }
      setLoading(false);
    }
    load();
  }, [user?.id]);

  return (
    <div className="pb-24 px-6 pt-6 max-w-screen-md mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link href="/" className="text-outline hover:text-on-background transition-colors">
          <Icon name="arrow_back" size={20} />
        </Link>
        <div>
          <h1 className="text-lg font-bold uppercase tracking-widest">
            Classement
          </h1>
          <p className="text-[10px] uppercase tracking-widest text-outline">
            Concours parrainage · 400€ à gagner
          </p>
        </div>
      </div>

      {/* Prize banner */}
      <div className="bg-primary text-on-primary p-5 mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] font-bold opacity-70 mb-1">
            1ère place
          </p>
          <p className="text-3xl font-black tracking-tight">400€</p>
          <p className="text-[10px] uppercase tracking-widest opacity-70 mt-1">
            à gagner au lancement
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase tracking-widest opacity-60 mb-2">
            Règles
          </p>
          <p className="text-[10px] opacity-80 leading-relaxed max-w-[180px]">
            Parraine des amis. Plus ils s&apos;abonnent, plus tu marques de points.
          </p>
        </div>
      </div>

      {/* Points table */}
      <div className="border border-outline-variant/40 p-4 mb-8 space-y-2">
        <p className="text-[9px] uppercase tracking-[0.3em] font-bold text-outline mb-3">
          Barème des points
        </p>
        {[
          { label: "Ami inscrit via ton lien", pts: "+100 pts" },
          { label: "Ami s'abonne Basic (2,99€/mois)", pts: "+200 pts" },
          { label: "Ami s'abonne Premium (9,99€/mois)", pts: "+500 pts" },
          { label: "Tu souscris Basic toi-même", pts: "+50 pts" },
          { label: "Tu souscris Premium toi-même", pts: "+150 pts" },
        ].map((r) => (
          <div key={r.label} className="flex items-center justify-between">
            <span className="text-[11px] text-on-surface-variant">{r.label}</span>
            <span className="text-[11px] font-bold text-primary">{r.pts}</span>
          </div>
        ))}
      </div>

      {/* My rank */}
      {user && myRank !== null && (
        <div className="border border-primary/40 bg-primary/5 p-4 mb-8 flex items-center justify-between">
          <div>
            <p className="text-[9px] uppercase tracking-widest text-outline mb-1">
              Ton classement
            </p>
            <p className="text-2xl font-black">#{myRank}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-widest text-outline mb-1">
              Tes points
            </p>
            <p className="text-2xl font-black">{myPoints ?? 0}</p>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div>
        <p className="text-[9px] uppercase tracking-[0.3em] font-bold text-outline mb-4">
          Top 50
        </p>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 bg-surface-container animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="border border-outline-variant/40 p-8 text-center">
            <p className="text-sm text-outline">
              Aucun participant pour l&apos;instant.
            </p>
            <p className="text-[10px] uppercase tracking-widest text-outline mt-1">
              Sois le premier !
            </p>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/20">
            {rows.map((row, i) => {
              const isMe = row.user_id === user?.id;
              const medal =
                i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
              return (
                <div
                  key={row.user_id}
                  className={`flex items-center gap-4 py-3 ${isMe ? "bg-primary/5" : ""}`}
                >
                  {/* Rank */}
                  <div className="w-8 text-center shrink-0">
                    {medal ? (
                      <span className="text-base">{medal}</span>
                    ) : (
                      <span className="text-[11px] font-mono text-outline">
                        #{row.rank}
                      </span>
                    )}
                  </div>
                  {/* Monogram */}
                  <div
                    className={`w-8 h-8 flex items-center justify-center text-[11px] font-bold uppercase shrink-0 ${
                      isMe
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container text-on-surface-variant"
                    }`}
                  >
                    {row.display_name[0] ?? "?"}
                  </div>
                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold uppercase tracking-widest truncate ${isMe ? "text-primary" : ""}`}>
                      {row.display_name}
                      {isMe && (
                        <span className="ml-2 text-[8px] opacity-60">
                          (toi)
                        </span>
                      )}
                    </p>
                    <p className="text-[9px] text-outline">
                      {row.referral_count} filleul{Number(row.referral_count) > 1 ? "s" : ""}
                    </p>
                  </div>
                  {/* Points */}
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black">{row.points}</p>
                    <p className="text-[9px] uppercase tracking-widest text-outline">
                      pts
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CTA share link */}
      {user && (
        <div className="mt-10 border-t border-outline-variant/40 pt-8">
          <p className="text-[10px] uppercase tracking-widest text-outline mb-3 text-center">
            Rejoins la compétition
          </p>
          <Link
            href="/profile"
            className="flex items-center justify-center gap-2 w-full py-4 bg-primary text-on-primary text-xs uppercase tracking-[0.3em] font-bold"
          >
            <Icon name="share" size={14} />
            Mon lien de parrainage
          </Link>
        </div>
      )}

      {!user && (
        <div className="mt-10 border-t border-outline-variant/40 pt-8 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-on-primary text-xs uppercase tracking-[0.3em] font-bold"
          >
            <Icon name="arrow_forward" size={14} />
            Participer
          </Link>
        </div>
      )}
    </div>
  );
}
