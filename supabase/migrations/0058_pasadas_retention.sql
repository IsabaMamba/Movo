-- =====================================================================
-- 0058_pasadas_retention.sql — Pasadas keeps six months, then a count.
--
-- Decided by Alejandro on 2 November (3 Nov handoff, backend item 8): the
-- detail of each past session — who went, who arrived — is kept for six
-- months; after that only a monthly count remains. The organizer keeps
-- their roster exactly as long. Until now nothing expired: every roster
-- since the first session was still there, which is a list of where people
-- were, kept for no reason anybody could state.
--
--   * purge_pasadas(), nightly where pg_cron exists: for every session that
--     ended more than six months ago and was not purged yet, it adds to
--     attendance_monthly — per person, per month: sessions they arrived at,
--     and sessions they organized and closed — and then deletes the
--     session's roster, its check-in code and attempts. The session row
--     itself stays (title, place, organizer: what was public anyway), with
--     pasadas_purged_at set so it is counted once.
--   * attendance_monthly is owner-only, written by the job alone.
--   * my_monthly_attendance() is what Pasadas shows under its list: «En
--     abril fuiste a 6 sesiones».
--
-- The opt-in attendance history (0021) keeps its own 90 days; it is a
-- different thing (recommendations) and is not touched.
-- =====================================================================

alter table public.activities
  add column pasadas_purged_at timestamptz;

comment on column public.activities.pasadas_purged_at is
  'When purge_pasadas() folded this session into attendance_monthly and deleted its roster. See 0058.';

create table public.attendance_monthly (
  user_id   uuid not null references public.profiles (id) on delete cascade,
  month     date not null check (extract(day from month) = 1),
  went      integer not null default 0 check (went >= 0),
  organized integer not null default 0 check (organized >= 0),
  primary key (user_id, month)
);

comment on table public.attendance_monthly is
  'Per person and month: sessions arrived at and sessions organized, for sessions older than six '
  'months whose rosters were deleted. Owner-only; written by purge_pasadas(). See 0058.';

alter table public.attendance_monthly enable row level security;
revoke all on public.attendance_monthly from anon, authenticated;
grant select on public.attendance_monthly to authenticated;

create policy attendance_monthly_own on public.attendance_monthly
  for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------- purge

create or replace function public.purge_pasadas()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids      uuid[];
  v_rosters  integer;
begin
  select coalesce(array_agg(a.id), '{}') into v_ids
    from public.activities a
   where a.ends_at < now() - interval '6 months'
     and a.pasadas_purged_at is null;

  if cardinality(v_ids) = 0 then
    return jsonb_build_object('sessions', 0, 'rosters', 0);
  end if;

  -- Arrived, by the month of the session in Costa Rica.
  insert into public.attendance_monthly (user_id, month, went)
  select p.user_id,
         date_trunc('month', a.starts_at at time zone 'America/Costa_Rica')::date,
         count(*)
    from public.activity_participants p
    join public.activities a on a.id = p.activity_id
   where a.id = any (v_ids)
     and p.status = 'attended'
   group by 1, 2
  on conflict (user_id, month) do update
    set went = public.attendance_monthly.went + excluded.went;

  -- Organized and closed: a cancelled session was not organized.
  insert into public.attendance_monthly (user_id, month, organized)
  select a.organizer_id,
         date_trunc('month', a.starts_at at time zone 'America/Costa_Rica')::date,
         count(*)
    from public.activities a
   where a.id = any (v_ids)
     and a.status = 'completed'
   group by 1, 2
  on conflict (user_id, month) do update
    set organized = public.attendance_monthly.organized + excluded.organized;

  delete from public.activity_participants where activity_id = any (v_ids);
  get diagnostics v_rosters = row_count;
  delete from public.check_in_attempts where activity_id = any (v_ids);
  delete from public.check_in_codes    where activity_id = any (v_ids);

  update public.activities set pasadas_purged_at = now() where id = any (v_ids);

  return jsonb_build_object('sessions', cardinality(v_ids), 'rosters', v_rosters);
end;
$$;

comment on function public.purge_pasadas() is
  'Nightly: sessions that ended over six months ago are folded into attendance_monthly and their '
  'rosters deleted. See 0058.';

revoke all on function public.purge_pasadas() from public, anon, authenticated;

-- ----------------------------------------------------------------- read

create or replace function public.my_monthly_attendance()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('month', m.month, 'went', m.went, 'organized', m.organized)
                            order by m.month desc), '[]'::jsonb)
    from public.attendance_monthly m
   where m.user_id = auth.uid();
$$;

comment on function public.my_monthly_attendance() is
  'The caller''s monthly counts for sessions older than six months, newest first. See 0058.';

revoke all on function public.my_monthly_attendance() from public, anon;
grant execute on function public.my_monthly_attendance() to authenticated;

-- 09:57 UTC is 03:57 in Costa Rica, after the other nightly jobs.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
    execute $cmd$
      select cron.schedule('purge-pasadas', '57 9 * * *', 'select public.purge_pasadas()')
    $cmd$;
  else
    raise notice 'pg_cron is not available here; purge_pasadas() is not scheduled';
  end if;
end
$$;
