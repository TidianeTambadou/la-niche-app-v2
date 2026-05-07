-- ─── Referral & Points system ─────────────────────────────────────────────
-- Run this once in the Supabase SQL editor.

-- 1. Referral codes: one stable code per user
create table if not exists public.referral_codes (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  code         text not null unique,
  display_name text not null default 'Anonyme',
  created_at   timestamptz not null default now()
);

-- 2. Referral relationships (a person can only be referred once)
create table if not exists public.referrals (
  id              uuid primary key default gen_random_uuid(),
  referrer_id     uuid not null references auth.users(id) on delete cascade,
  referred_id     uuid not null references auth.users(id) on delete cascade,
  code            text not null,
  created_at      timestamptz not null default now(),
  subscription_tier text,        -- null=free, 'basic', 'premium'
  subscribed_at   timestamptz,
  unique(referred_id)
);

-- 3. Points balance: one row per user
create table if not exists public.points_balance (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  points     integer not null default 0,
  updated_at timestamptz not null default now()
);

-- 4. Points log: immutable audit trail
create table if not exists public.points_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  amount     integer not null,
  reason     text not null,  -- 'referral_signup' | 'referral_basic' | 'referral_premium' | 'self_basic' | 'self_premium'
  meta       jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ─── Row Level Security ────────────────────────────────────────────────────

alter table public.referral_codes   enable row level security;
alter table public.referrals        enable row level security;
alter table public.points_balance   enable row level security;
alter table public.points_log       enable row level security;

-- referral_codes: public read (anyone can look up a code to validate it)
create policy "public_read_referral_codes"
  on public.referral_codes for select using (true);

-- referrals: user sees referrals they sent or received
create policy "user_reads_own_referrals"
  on public.referrals for select
  using (auth.uid() = referrer_id or auth.uid() = referred_id);

-- points_balance: public read (needed for leaderboard)
create policy "public_read_points_balance"
  on public.points_balance for select using (true);

-- points_log: user reads own log
create policy "user_reads_own_points_log"
  on public.points_log for select
  using (auth.uid() = user_id);

-- ─── Grants ────────────────────────────────────────────────────────────────

grant select on public.referral_codes to anon, authenticated;
grant select on public.referrals      to authenticated;
grant select on public.points_balance to anon, authenticated;
grant select on public.points_log     to authenticated;

-- ─── Leaderboard view ─────────────────────────────────────────────────────
-- All writes are done by the service-role key from API routes, so no
-- INSERT/UPDATE policies are needed for regular users.

create or replace view public.leaderboard_view as
select
  rc.user_id,
  rc.display_name,
  coalesce(pb.points, 0)                                    as points,
  rank() over (order by coalesce(pb.points, 0) desc)        as rank,
  count(r.id)                                               as referral_count
from public.referral_codes rc
left join public.points_balance pb on pb.user_id = rc.user_id
left join public.referrals r on r.referrer_id = rc.user_id
group by rc.user_id, rc.display_name, pb.points
order by points desc;

grant select on public.leaderboard_view to anon, authenticated;
