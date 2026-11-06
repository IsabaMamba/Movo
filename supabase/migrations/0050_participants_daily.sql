-- =====================================================================
-- 0050_participants_daily.sql — «Quién se une o sale», once a day.
--
-- Avisos v3, type participants_daily: «[n] personas se unieron a [sesión]:
-- [nombre], [nombre] y [n] más. · [nombre] no puede ir el [día].» Off by
-- default (0049): most organizers want the list, not a phone that rings
-- every time somebody taps «Unirme». Those who switch it on get one notice
-- per session per day, at 19:00 Costa Rica, covering the last 24 hours.
--
-- The function writes for every organizer with movement; the 0049 trigger
-- drops the rows of everybody who has it off. That keeps one rule in one
-- place instead of two lists of who wants what.
--
-- Names are display names, which the organizer already sees on the roster.
-- At most two who joined and one who left are named; the rest are a count.
-- =====================================================================

create or replace function public.notify_participants_daily()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_written integer := 0;
  v_row     record;
begin
  for v_row in
    select a.id, a.title, a.organizer_id, a.starts_at,
           count(*) filter (where p.status = 'joined'
                              and p.joined_at > now() - interval '24 hours') as joined,
           count(*) filter (where p.status = 'cancelled'
                              and p.cancelled_at > now() - interval '24 hours') as left_count,
           (array_agg(pr.display_name order by p.joined_at desc)
              filter (where p.status = 'joined'
                        and p.joined_at > now() - interval '24 hours'))[1:2] as joined_names,
           (array_agg(pr.display_name order by p.cancelled_at desc)
              filter (where p.status = 'cancelled'
                        and p.cancelled_at > now() - interval '24 hours'))[1:1] as left_names
      from public.activities a
      join public.activity_participants p on p.activity_id = a.id
      join public.profiles pr on pr.id = p.user_id
     where a.status in ('published', 'full')
       and a.starts_at > now()
       and p.user_id <> a.organizer_id
     group by a.id, a.title, a.organizer_id, a.starts_at
  loop
    continue when v_row.joined = 0 and v_row.left_count = 0;

    insert into public.notifications (user_id, type, payload)
    values (
      v_row.organizer_id,
      'participants_daily',
      jsonb_build_object(
        'activity_id', v_row.id,
        'title',       v_row.title,
        'starts_at',   v_row.starts_at,
        'joined',      v_row.joined,
        'names',       to_jsonb(coalesce(v_row.joined_names, '{}'::text[])),
        'left',        v_row.left_count,
        'left_names',  to_jsonb(coalesce(v_row.left_names, '{}'::text[]))
      )
    );
    v_written := v_written + 1;
  end loop;

  return v_written;
end;
$$;

comment on function public.notify_participants_daily() is
  'Daily digest to organizers: who joined or left each upcoming session in the last 24 h. Dropped by 0049 for those who keep it off. See 0050.';

revoke all on function public.notify_participants_daily() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
    -- 01:00 UTC is 19:00 in Costa Rica, which has no daylight saving.
    execute $cmd$
      select cron.schedule(
        'participants-daily',
        '0 1 * * *',
        'select public.notify_participants_daily()'
      )
    $cmd$;
  else
    raise notice 'pg_cron is not available here; notify_participants_daily() is not scheduled';
  end if;
end
$$;
