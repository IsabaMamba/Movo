-- =====================================================================
-- 0022_solo_session_warning.sql — when a session is about to be two
-- strangers alone, both of them are told in time to decide.
--
-- docs/security.md lists "group minimum of 3, 1:1 off" as a blocker for the
-- first public session. Capacity already covers half of it: the organizer is
-- not a participant (join_activity() refuses them), so the smallest cap, 2,
-- is three people. What capacity cannot cover is a session only one person
-- joins, and that happens at any cap, including none.
--
-- Decided on 28 September 2026: warn, do not cancel. From 24 hours before the
-- start, a published session with exactly one person joined gets two
-- notices — one to the organizer, one to that person — saying it would be a
-- meeting alone, and the organizer decides. Cancelling automatically would
-- throw away sessions people wanted; saying nothing is the risk this exists
-- to name.
--
--   * Once per session. `activities.solo_warned_at` records it. A second
--     person joining afterwards does not un-warn anybody, and nobody is told
--     twice if the count bounces.
--   * The count is checked when the job runs, not when the window opens, so a
--     session that drops to one person at T-3h is warned at T-3h.
--   * Nothing names anybody. The organizer is told "one person"; the person
--     is told the organizer would be alone with them — which is exactly what
--     they already know from the session page.
--
-- pg_cron runs warn_solo_sessions() every 15 minutes where it exists, the
-- same conditional as 0021.
-- =====================================================================

alter table public.activities
  add column solo_warned_at timestamptz;

comment on column public.activities.solo_warned_at is
  'When warn_solo_sessions() told the organizer and the only participant that '
  'the session would be a meeting alone. Null if never.';

create index activities_solo_window_idx
  on public.activities (starts_at)
  where status in ('published', 'full') and solo_warned_at is null;

create or replace function public.warn_solo_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_warned integer;
begin
  with due as (
    select a.id, a.organizer_id, a.title, a.starts_at, p.user_id as participant_id
      from public.activities a
      join public.activity_participants p
        on p.activity_id = a.id and p.status = 'joined'
     where a.status in ('published', 'full')
       and a.solo_warned_at is null
       and a.starts_at >  now()
       and a.starts_at <= now() + interval '24 hours'
       and a.joined_count = 1
     -- joined_count is trigger-maintained; the join is what names the person,
     -- and the row lock stops two overlapping runs from warning twice.
     for update of a skip locked
  ),
  stamped as (
    update public.activities a
       set solo_warned_at = now()
      from due
     where a.id = due.id
    returning a.id
  ),
  to_organizer as (
    insert into public.notifications (user_id, type, payload)
    select due.organizer_id, 'solo_session_organizer',
           jsonb_build_object('activity_id', due.id, 'title', due.title, 'starts_at', due.starts_at)
      from due
      join stamped on stamped.id = due.id
    returning 1
  ),
  to_participant as (
    insert into public.notifications (user_id, type, payload)
    select due.participant_id, 'solo_session_participant',
           jsonb_build_object('activity_id', due.id, 'title', due.title, 'starts_at', due.starts_at)
      from due
      join stamped on stamped.id = due.id
    returning 1
  )
  -- The two inserts are not read here. Postgres runs a data-modifying CTE to
  -- completion whether or not anything reads it, and all four parts see the
  -- same snapshot, so the stamp and the notices land together or not at all.
  select count(*) into v_warned from stamped;

  return v_warned;
end;
$$;

-- The scheduler's, not a client's: a client calling it early would only warn
-- sooner, but notices that arrive because somebody pressed a button are
-- notices nobody can reason about.
revoke all on function public.warn_solo_sessions() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
    execute $cmd$
      select cron.schedule(
        'warn-solo-sessions',
        '*/15 * * * *',
        'select public.warn_solo_sessions()'
      )
    $cmd$;
  else
    raise notice 'pg_cron is not available here; warn_solo_sessions() is not scheduled';
  end if;
end
$$;
