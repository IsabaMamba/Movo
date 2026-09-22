-- =====================================================================
-- 0021_attendance_history.sql — attendance history, and the job that
-- deletes it. Together, because docs/security.md promises both and either
-- one alone is the defect: a history without the job is a dataset that
-- grows forever; the job without the history is a control over nothing.
--
-- The shape is the mitigation (docs/security.md, "Attendance history"):
--
--   * OPT-IN. A row in attendance_history_consent is the only thing that
--     makes a check-in write history. No row, no history — and a person who
--     never opens the setting never has a row. Nothing is backfilled: turning
--     it on records from that moment, not from the attendance already on
--     file.
--
--   * COARSE. Each row is a district, a sport, a weekday-or-weekend flag and
--     a time band ("Escazú, running, weekday evening"). Never a venue, never
--     a coordinate, never an activity id — an id would lead straight back to
--     the venue and the minute. The only date is the Monday of the week the
--     session started in. The deletion job needs some date to count ninety
--     days from; a week is the coarsest one that can do that, and a week is
--     what "the session on Tuesday at 18:04" becomes when it is not stored.
--
--   * EXPIRING. purge_attendance_history() deletes rows whose week began
--     more than ninety days ago. It rounds towards deleting: a row goes up to
--     six days early, never late. pg_cron runs it nightly. Reads also stop at
--     ninety days in policy, so a job that fails one night does not turn into
--     a history that shows more than was promised.
--
--   * OWNER-ONLY. One select policy, user_id = auth.uid(). No staff policy,
--     no aggregate, no export. Clients write nothing directly: the check-in
--     trigger writes, and two functions delete.
--
--   * ONE-TAP DELETE. clear_attendance_history() empties it and keeps the
--     setting; set_attendance_history(false) empties it and turns it off.
--     There are no derived recommendation weights yet. When there are, both
--     functions must clear them too — a "deleted" history whose weights
--     survive is still legible.
-- =====================================================================

-- ----------------------------------------------------------- the shape

-- Costa Rica time. madrugada 04–07, mañana 07–12, tarde 12–17, noche 17–04.
-- The 5 a.m. run is its own band because it is its own crowd.
create type public.time_band as enum ('early', 'morning', 'afternoon', 'evening');

create table public.attendance_history_consent (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  consented_at   timestamptz not null default now(),
  -- Which text the person read when they said yes. Ley 8968 consent is
  -- consent to something specific; when the text changes, this says who
  -- agreed to which version.
  notice_version text not null check (length(btrim(notice_version)) between 1 and 40)
);

create table public.attendance_history (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  district_code text not null references public.zones (code),
  category_id   text not null references public.categories (id),
  week_of       date not null check (extract(isodow from week_of) = 1),
  is_weekend    boolean not null,
  band          public.time_band not null
);

create index attendance_history_user_idx on public.attendance_history (user_id, week_of desc);
create index attendance_history_week_idx on public.attendance_history (week_of);

comment on table public.attendance_history is
  'Opt-in, coarse, expiring. District, sport, weekday/weekend and time band, '
  'dated to the week. Deleted after 90 days by purge_attendance_history(). '
  'Readable by its owner only. See docs/security.md.';

-- Supabase grants every privilege on a new table to anon and authenticated
-- (0012's note). Revoke first; grant back only the reads.
revoke all on public.attendance_history_consent from anon, authenticated;
revoke all on public.attendance_history         from anon, authenticated;
grant select on public.attendance_history_consent to authenticated;
grant select on public.attendance_history         to authenticated;

alter table public.attendance_history_consent enable row level security;
alter table public.attendance_history         enable row level security;

create policy attendance_history_consent_read_own on public.attendance_history_consent
  for select to authenticated
  using (user_id = auth.uid());

-- The window is in the policy as well as in the job. The job is what makes
-- the promise true; the policy is what keeps a missed night from breaking it
-- in front of the person it was made to.
create policy attendance_history_read_own on public.attendance_history
  for select to authenticated
  using (
    user_id = auth.uid()
    and week_of >= (now() at time zone 'America/Costa_Rica')::date - 90
  );

-- ------------------------------------------------------------- writing

create or replace function public.time_band_for(p_hour integer)
returns public.time_band
language sql
immutable
set search_path = ''
as $$
  select case
    when p_hour between 4 and 6   then 'early'::public.time_band
    when p_hour between 7 and 11  then 'morning'::public.time_band
    when p_hour between 12 and 16 then 'afternoon'::public.time_band
    else 'evening'::public.time_band
  end;
$$;

-- Fires when a participant becomes `attended` — which only check_in() does.
-- A no_show writes nothing: history is where somebody went, not where they
-- said they would.
create or replace function public.record_attendance_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local    timestamp;
  v_district text;
  v_category text;
begin
  if new.status <> 'attended'
     or (tg_op = 'UPDATE' and old.status = 'attended') then
    return new;
  end if;

  if not exists (select 1 from public.attendance_history_consent where user_id = new.user_id) then
    return new;
  end if;

  select a.starts_at at time zone 'America/Costa_Rica', l.district_code, a.category_id
    into v_local, v_district, v_category
    from public.activities a
    join public.locations l on l.id = a.location_id
   where a.id = new.activity_id;

  -- A venue outside every zone has no district to record. Falling back to
  -- its coordinates is exactly what this table exists not to do.
  if v_district is null then
    return new;
  end if;

  insert into public.attendance_history (user_id, district_code, category_id, week_of, is_weekend, band)
  values (
    new.user_id,
    v_district,
    v_category,
    date_trunc('week', v_local)::date,
    extract(isodow from v_local) in (6, 7),
    public.time_band_for(extract(hour from v_local)::integer)
  );

  return new;
end;
$$;

revoke all on function public.record_attendance_history() from public, anon, authenticated;

create trigger activity_participants_attendance_history
  after insert or update of status on public.activity_participants
  for each row execute function public.record_attendance_history();

-- ------------------------------------------------ the person's controls

-- On: requires the version of the text the person was shown. Saying yes
-- again to a newer text records that version and the moment it was agreed.
-- Off: deletes every row, then the consent. One statement from the person's
-- side, so there is no state where it is off and the rows are still there.
create or replace function public.set_attendance_history(
  p_enabled        boolean,
  p_notice_version text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if p_enabled then
    if p_notice_version is null or length(btrim(p_notice_version)) = 0 then
      raise exception 'consent needs the version of the notice that was shown' using errcode = '22023';
    end if;

    insert into public.attendance_history_consent (user_id, notice_version)
    values (v_caller, btrim(p_notice_version))
    on conflict (user_id) do update
      set notice_version = excluded.notice_version,
          consented_at   = now();
  else
    delete from public.attendance_history         where user_id = v_caller;
    delete from public.attendance_history_consent where user_id = v_caller;
  end if;
end;
$$;

revoke all on function public.set_attendance_history(boolean, text) from public, anon;
grant execute on function public.set_attendance_history(boolean, text) to authenticated;

-- Empties the history and leaves the setting on. Returns how many rows went,
-- so the screen can say what happened rather than that something did.
create or replace function public.clear_attendance_history()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller  uuid := auth.uid();
  v_deleted integer;
begin
  if v_caller is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  delete from public.attendance_history where user_id = v_caller;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.clear_attendance_history() from public, anon;
grant execute on function public.clear_attendance_history() to authenticated;

-- ---------------------------------------------------------- the job

-- Nobody but the scheduler calls this. No client grant: deleting other
-- people's rows early is not a thing a client should be able to ask for,
-- even though it is the safe direction.
create or replace function public.purge_attendance_history()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.attendance_history
   where week_of < (now() at time zone 'America/Costa_Rica')::date - 90;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_attendance_history() from public, anon, authenticated;

-- pg_cron exists on Supabase and not in the plain PostGIS image CI uses, so
-- the schedule is conditional on the extension being installable. Where it
-- is, a failure here fails the migration: "the job's absence is a bug of the
-- same severity as a missing RLS policy", and a migration that quietly
-- skipped it would be that bug. Where it is not, CI tests the function
-- directly and says so.
--
-- cron.schedule() with a job name replaces an existing job of that name, so
-- this is safe to run twice. 09:17 UTC is 03:17 in Costa Rica.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
    execute $cmd$
      select cron.schedule(
        'purge-attendance-history',
        '17 9 * * *',
        'select public.purge_attendance_history()'
      )
    $cmd$;
  else
    raise notice 'pg_cron is not available here; purge_attendance_history() is not scheduled';
  end if;
end
$$;
