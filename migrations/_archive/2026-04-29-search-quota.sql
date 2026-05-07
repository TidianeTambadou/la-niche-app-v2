-- =====================================================================
-- 2026-04-29 — Add `searches` quota counter
--
-- Run once in the Supabase SQL Editor. Idempotent.
--
-- Why: search calls also burn tokens (Fragella + Tavily fallback). Free
-- users now get a hard cap of 10 searches/month. The quota.ts module is
-- updated to bump this counter on every server-side search call (cache
-- hits don't count — only outbound API requests).
--
-- Re-creates increment_user_usage() to accept 'searches' as a kind.
-- =====================================================================

alter table public.user_usage
  add column if not exists searches integer not null default 0;

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
  if p_kind not in ('recos','balades','scans','asks','searches') then
    raise exception 'invalid kind: %', p_kind;
  end if;

  insert into public.user_usage (user_id, period_start, recos, balades, scans, asks, searches)
  values (
    p_user_id,
    v_period,
    case when p_kind = 'recos'    then p_delta else 0 end,
    case when p_kind = 'balades'  then p_delta else 0 end,
    case when p_kind = 'scans'    then p_delta else 0 end,
    case when p_kind = 'asks'     then p_delta else 0 end,
    case when p_kind = 'searches' then p_delta else 0 end
  )
  on conflict (user_id, period_start) do update set
    recos     = public.user_usage.recos     + (case when p_kind = 'recos'    then p_delta else 0 end),
    balades   = public.user_usage.balades   + (case when p_kind = 'balades'  then p_delta else 0 end),
    scans     = public.user_usage.scans     + (case when p_kind = 'scans'    then p_delta else 0 end),
    asks      = public.user_usage.asks      + (case when p_kind = 'asks'     then p_delta else 0 end),
    searches  = public.user_usage.searches  + (case when p_kind = 'searches' then p_delta else 0 end),
    updated_at = now();

  execute format(
    'select %I from public.user_usage where user_id = $1 and period_start = $2',
    p_kind
  ) into v_new using p_user_id, v_period;

  return v_new;
end;
$$;

grant execute on function public.increment_user_usage(uuid, text, integer) to service_role;
