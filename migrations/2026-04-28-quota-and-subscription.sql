-- =====================================================================
-- 2026-04-28 — Server-side quota tracking + subscription source of truth
--
-- Run once in the Supabase SQL Editor of the same project as the rest.
-- Idempotent — safe to re-run.
--
-- What it does:
--   PART A — Creates public.user_subscription (one row per user, the truth
--            for the user's tier + billing cycle + PayPal references).
--   PART B — Creates public.user_usage (one row per user × billing month,
--            with per-feature counters: recos, balades, scans, asks).
--   PART C — Adds increment_user_usage() RPC for atomic counter bumps.
--   PART D — RLS: user can read their own subscription + usage; writes
--            only via the service-role admin client (server API routes).
-- =====================================================================

-- =====================================================================
-- PART A — Subscription source of truth
-- =====================================================================

create table if not exists public.user_subscription (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  -- Canonical tier slug. Must match TIER values in src/lib/store.tsx.
  tier                   text not null default 'free'
                          check (tier in ('free','curieux','initie','mecene')),
  billing_cycle          text not null default 'monthly'
                          check (billing_cycle in ('monthly','annual')),
  -- 'active': period is current and feature access is granted.
  -- 'paused': PayPal paused (treat as free until resumed).
  -- 'cancelled': user cancelled — keep `tier` so we know what they HAD,
  --   but the quota gate treats them as free.
  -- 'past_due': payment failed; PayPal retries — treat as free meanwhile.
  status                 text not null default 'active'
                          check (status in ('active','paused','cancelled','past_due')),
  -- When the current paid period ends (UTC). Null for free users.
  current_period_end     timestamptz,
  -- PayPal references (filled by the webhook handler in phase 2b).
  paypal_subscription_id text,
  paypal_plan_id         text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_user_subscription_paypal_id
  on public.user_subscription (paypal_subscription_id)
  where paypal_subscription_id is not null;

-- =====================================================================
-- PART B — Per-month usage counters
-- =====================================================================

create table if not exists public.user_usage (
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- First day of the billing month UTC ('2026-04-01'). The quota window
  -- rolls over when a request hits a fresh month and the row is upserted.
  period_start  date not null,
  recos         integer not null default 0,
  balades       integer not null default 0,
  scans         integer not null default 0,
  asks          integer not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (user_id, period_start)
);

create index if not exists idx_user_usage_period
  on public.user_usage (period_start);

-- =====================================================================
-- PART C — Atomic counter bumps
--
-- Used by the server when a metered call succeeds. The function:
--   1. Computes the current period (first day of month UTC).
--   2. Upserts the row, incrementing the right column by `delta`.
--   3. Returns the new value of that column.
-- The CASE-WHEN gate keeps the column name validated against the table
-- schema — passing an arbitrary string can't write to anywhere else.
-- =====================================================================

create or replace function public.increment_user_usage(
  p_user_id uuid,
  p_kind    text,
  p_delta   integer default 1
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date := date_trunc('month', now() at time zone 'utc')::date;
  v_new    integer;
begin
  if p_kind not in ('recos','balades','scans','asks') then
    raise exception 'invalid kind: %', p_kind;
  end if;

  insert into public.user_usage (user_id, period_start, recos, balades, scans, asks)
  values (
    p_user_id,
    v_period,
    case when p_kind = 'recos'   then p_delta else 0 end,
    case when p_kind = 'balades' then p_delta else 0 end,
    case when p_kind = 'scans'   then p_delta else 0 end,
    case when p_kind = 'asks'    then p_delta else 0 end
  )
  on conflict (user_id, period_start) do update set
    recos     = public.user_usage.recos     + (case when p_kind = 'recos'   then p_delta else 0 end),
    balades   = public.user_usage.balades   + (case when p_kind = 'balades' then p_delta else 0 end),
    scans     = public.user_usage.scans     + (case when p_kind = 'scans'   then p_delta else 0 end),
    asks      = public.user_usage.asks      + (case when p_kind = 'asks'    then p_delta else 0 end),
    updated_at = now();

  -- Re-fetch the new value of the relevant column.
  execute format(
    'select %I from public.user_usage where user_id = $1 and period_start = $2',
    p_kind
  ) into v_new using p_user_id, v_period;

  return v_new;
end;
$$;

-- Allow the service role to call it (admin client in API routes).
grant execute on function public.increment_user_usage(uuid, text, integer) to service_role;

-- =====================================================================
-- PART D — Row Level Security
-- =====================================================================

alter table public.user_subscription enable row level security;
alter table public.user_usage        enable row level security;

drop policy if exists "user_reads_own_subscription" on public.user_subscription;
create policy "user_reads_own_subscription"
  on public.user_subscription
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_reads_own_usage" on public.user_usage;
create policy "user_reads_own_usage"
  on public.user_usage
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Writes happen only through the service role (API routes / RPC) — no
-- write policy for authenticated users. This prevents tampering: a user
-- can't reset their own usage counter or upgrade their own tier.

-- =====================================================================
-- Verification (run manually after the migration completes)
--   select count(*) from public.user_subscription;  -- expect 0
--   select count(*) from public.user_usage;         -- expect 0
--   select public.increment_user_usage(
--     auth.uid(), 'recos', 1
--   );                                              -- requires a session
-- =====================================================================
