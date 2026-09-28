-- =====================================================================
-- 0023_close_reminder.sql — the organizer is reminded, once, to close a
-- session that has ended.
--
-- Found on the live project on 28 September: seven sessions had passed and
-- were still `published`, the oldest from 8 September. Organizar lists them
-- under «Pendientes de cerrar», but only for somebody who opens Organizar,
-- and an organizer who forgot is exactly the one who does not.
--
-- The roadmap (status.md, P1 #11) rules out closing them automatically: a
-- close marks everybody not checked in as `no_show`, and a job cannot know
-- who came. So a reminder, and the organizer does the marking.
--
--   * One hour after the session ends — enough for the walk back to the car,
--     soon enough that who came is still remembered.
--   * Once per session: `activities.close_reminded_at`. Somebody who
--     ignores one reminder does not get a second, or a daily one.
--   * Only for sessions that ended within the last 30 days. The backlog on
--     the day this runs is reminded; a session from last year is not worth a
--     notice that arrives out of nowhere.
--   * To the organizer only. Community organizers can check people in, but
--     only the organizer can close (close_activity(), 0010).
--
-- pg_cron runs remind_unclosed_sessions() hourly where it exists, the same
-- conditional as 0021 and 0022.
-- =====================================================================

alter table public.activities
  add column close_reminded_at timestamptz;

comment on column public.activities.close_reminded_at is
  'When remind_unclosed_sessions() told the organizer the session had ended '
  'and was not closed. Null if never.';

create index activities_unclosed_idx
  on public.activities (ends_at)
  where status in ('published', 'full') and close_reminded_at is null;

create or replace function public.remind_unclosed_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reminded integer;
begin
  with due as (
    select a.id, a.organizer_id, a.title, a.starts_at
      from public.activities a
     where a.status in ('published', 'full')
       and a.close_reminded_at is null
       and a.ends_at <= now() - interval '1 hour'
       and a.ends_at >  now() - interval '30 days'
     for update skip locked
  ),
  stamped as (
    update public.activities a
       set close_reminded_at = now()
      from due
     where a.id = due.id
    returning a.id
  ),
  notified as (
    insert into public.notifications (user_id, type, payload)
    select due.organizer_id, 'close_reminder',
           jsonb_build_object('activity_id', due.id, 'title', due.title, 'starts_at', due.starts_at)
      from due
      join stamped on stamped.id = due.id
    returning 1
  )
  select count(*) into v_reminded from stamped;

  return v_reminded;
end;
$$;

revoke all on function public.remind_unclosed_sessions() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
    execute $cmd$
      select cron.schedule(
        'remind-unclosed-sessions',
        '5 * * * *',
        'select public.remind_unclosed_sessions()'
      )
    $cmd$;
  else
    raise notice 'pg_cron is not available here; remind_unclosed_sessions() is not scheduled';
  end if;
end
$$;
