-- =====================================================================
-- 0033_self_check_in.sql — the person who arrives marks «Llegué», with the
-- session's code, and the organizer watches the list fill in.
--
-- Until now only the organizer checked people in (check_in(), 0010), one by
-- one, from 30 minutes before the start. The 16 October handoff (Asistencia
-- v2; docs/design/handoff-2026-10-16.md, backend item 2) moves it to the
-- phone of whoever arrives. The code exists because a plain «Llegué» can be
-- tapped from the sofa, and attendance is the number Movo will one day show
-- a sponsor.
--
--   * Every session gets a 4-digit code the first time its organizer asks
--     for it (check_in_code()), drawn from gen_random_uuid() rather than
--     random(). The organizer can draw a new one (new_check_in_code()) —
--     for when it has been shared beyond the people standing there.
--   * self_check_in(activity, code) is open from 15 minutes before the
--     start to 45 minutes after it, to somebody who is going (`joined`).
--     It answers rather than raises for the outcomes a person can cause —
--     `checked_in`, `already`, `wrong_code`, `locked` — because a raise
--     would roll back the failed-attempt count it has to keep.
--   * Five wrong codes lock that person out of self check-in for that
--     session. The organizer can still mark them; nothing else is lost.
--   * checked_in_by says who did it: the person themselves, or whoever
--     organizes. No new column.
--   * undo_check_in(activity, person) lets the organizer take back either
--     kind before the session is closed. It also removes the attendance
--     history row the check-in wrote (0021), if the person keeps one:
--     history is where somebody went, and they did not.
--
-- check_in(), close_activity() and remind_unclosed_sessions() are
-- unchanged: the organizer path still works exactly as it did, and closing
-- still turns everyone not marked into no_show.
--
-- Codes and attempt counts have no client grants at all. The organizer
-- reads the code through check_in_code(); nobody reads the attempts.
-- =====================================================================

create table public.check_in_codes (
  activity_id uuid primary key references public.activities (id) on delete cascade,
  code        text not null check (code ~ '^[0-9]{4}$'),
  created_at  timestamptz not null default now()
);

create table public.check_in_attempts (
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  failures    integer not null default 0 check (failures >= 0),
  last_at     timestamptz not null default now(),
  primary key (activity_id, user_id)
);

revoke all on public.check_in_codes    from anon, authenticated;
revoke all on public.check_in_attempts from anon, authenticated;
alter table public.check_in_codes    enable row level security;
alter table public.check_in_attempts enable row level security;

comment on table public.check_in_codes is
  'One 4-digit code per session for self check-in. No client grants; the '
  'organizer reads it through check_in_code(). See 0033.';
comment on table public.check_in_attempts is
  'Wrong codes per person per session; five lock self check-in. No client '
  'grants. See 0033.';

-- ------------------------------------------------------------ helpers

-- Four digits from a v4 UUID's random bits. random() is seeded per backend
-- and not meant for anything a person might try to guess.
create or replace function public.random_check_in_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select lpad(
    ((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))::bit(48)::bigint) % 10000)::text,
    4, '0');
$$;

revoke all on function public.random_check_in_code() from public, anon, authenticated;

create or replace function public.can_run_check_in(p_act public.activities, p_caller uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_act.organizer_id = p_caller
      or (p_act.community_id is not null
          and public.is_community_organizer(p_act.community_id, p_caller));
$$;

revoke all on function public.can_run_check_in(public.activities, uuid) from public, anon, authenticated;

-- ------------------------------------------------------- the organizer

create or replace function public.check_in_code(p_activity_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_act    public.activities%rowtype;
  v_code   text;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_act from public.activities where id = p_activity_id;
  if not found then
    raise exception 'activity not found' using errcode = 'P0002';
  end if;
  if not public.can_run_check_in(v_act, v_caller) then
    raise exception 'only the organizer can see the check-in code' using errcode = '42501';
  end if;
  if v_act.status not in ('published', 'full') then
    raise exception 'Esta sesión no está abierta para marcar llegadas.' using errcode = '22023';
  end if;

  insert into public.check_in_codes (activity_id, code)
  values (p_activity_id, public.random_check_in_code())
  on conflict (activity_id) do nothing;

  select code into v_code from public.check_in_codes where activity_id = p_activity_id;
  return v_code;
end;
$$;

create or replace function public.new_check_in_code(p_activity_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_act    public.activities%rowtype;
  v_old    text;
  v_code   text;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_act from public.activities where id = p_activity_id;
  if not found then
    raise exception 'activity not found' using errcode = 'P0002';
  end if;
  if not public.can_run_check_in(v_act, v_caller) then
    raise exception 'only the organizer can change the check-in code' using errcode = '42501';
  end if;
  if v_act.status not in ('published', 'full') then
    raise exception 'Esta sesión no está abierta para marcar llegadas.' using errcode = '22023';
  end if;

  select code into v_old from public.check_in_codes where activity_id = p_activity_id;
  -- A new code is a different code.
  loop
    v_code := public.random_check_in_code();
    exit when v_old is null or v_code <> v_old;
  end loop;

  insert into public.check_in_codes (activity_id, code)
  values (p_activity_id, v_code)
  on conflict (activity_id) do update set code = excluded.code, created_at = now();
  return v_code;
end;
$$;

create or replace function public.undo_check_in(p_activity_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_act    public.activities%rowtype;
  v_local  timestamp;
  v_district text;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_act from public.activities where id = p_activity_id for update;
  if not found then
    raise exception 'activity not found' using errcode = 'P0002';
  end if;
  if not public.can_run_check_in(v_act, v_caller) then
    raise exception 'only the organizer can undo a check-in' using errcode = '42501';
  end if;
  if v_act.status not in ('published', 'full') then
    raise exception 'La sesión ya se cerró: la asistencia no se puede cambiar.' using errcode = '22023';
  end if;

  update public.activity_participants
     set status = 'joined', checked_in_at = null, checked_in_by = null
   where activity_id = p_activity_id and user_id = p_user_id and status = 'attended';
  if not found then
    raise exception 'Esa persona no tiene la llegada marcada.' using errcode = 'P0002';
  end if;

  -- The history row this check-in wrote (0021), if the person keeps one.
  -- Rows carry no activity id by design, so it is found by the same values
  -- record_attendance_history() derives, and only one is removed.
  select v_act.starts_at at time zone 'America/Costa_Rica', l.district_code
    into v_local, v_district
    from public.locations l where l.id = v_act.location_id;
  if v_district is not null then
    delete from public.attendance_history h
     where h.ctid = (
       select h2.ctid from public.attendance_history h2
        where h2.user_id = p_user_id
          and h2.district_code = v_district
          and h2.category_id = v_act.category_id
          and h2.week_of = date_trunc('week', v_local)::date
          and h2.band = public.time_band_for(extract(hour from v_local)::integer)
        limit 1
     );
  end if;
end;
$$;

-- ---------------------------------------------------------- the person

create or replace function public.self_check_in(p_activity_id uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_act    public.activities%rowtype;
  v_status public.participation_status;
  v_fails  integer;
  v_code   text;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_act from public.activities where id = p_activity_id for update;
  if not found then
    raise exception 'activity not found' using errcode = 'P0002';
  end if;
  if v_act.status not in ('published', 'full') then
    raise exception 'Esta sesión no está abierta para marcar llegadas.' using errcode = '22023';
  end if;
  if now() < v_act.starts_at - interval '15 minutes' then
    raise exception 'Todavía no: puedes marcar tu llegada desde 15 minutos antes del inicio.'
      using errcode = '22023';
  end if;
  if now() > v_act.starts_at + interval '45 minutes' then
    raise exception 'Ya pasó el tiempo para marcar tu llegada. Pídele a quien organiza que te marque.'
      using errcode = '22023';
  end if;

  select status into v_status from public.activity_participants
   where activity_id = p_activity_id and user_id = v_caller;
  if v_status = 'attended' then
    return 'already';
  end if;
  if v_status is distinct from 'joined' then
    raise exception 'Solo quien va a esta sesión puede marcar su llegada.' using errcode = '42501';
  end if;

  select failures into v_fails from public.check_in_attempts
   where activity_id = p_activity_id and user_id = v_caller;
  if coalesce(v_fails, 0) >= 5 then
    return 'locked';
  end if;

  select code into v_code from public.check_in_codes where activity_id = p_activity_id;
  -- No code yet is the organizer's step missing, not a wrong guess: it is
  -- not counted against the person.
  if v_code is null then
    raise exception 'Quien organiza todavía no abrió el código de hoy.' using errcode = '22023';
  end if;
  if btrim(coalesce(p_code, '')) <> v_code then
    insert into public.check_in_attempts (activity_id, user_id, failures)
    values (p_activity_id, v_caller, 1)
    on conflict (activity_id, user_id)
      do update set failures = public.check_in_attempts.failures + 1, last_at = now();
    return case when coalesce(v_fails, 0) + 1 >= 5 then 'locked' else 'wrong_code' end;
  end if;

  update public.activity_participants
     set status = 'attended', checked_in_at = now(), checked_in_by = v_caller
   where activity_id = p_activity_id and user_id = v_caller;
  return 'checked_in';
end;
$$;

revoke all on function public.check_in_code(uuid)           from public, anon;
revoke all on function public.new_check_in_code(uuid)       from public, anon;
revoke all on function public.undo_check_in(uuid, uuid)     from public, anon;
revoke all on function public.self_check_in(uuid, text)     from public, anon;
grant execute on function public.check_in_code(uuid)        to authenticated;
grant execute on function public.new_check_in_code(uuid)    to authenticated;
grant execute on function public.undo_check_in(uuid, uuid)  to authenticated;
grant execute on function public.self_check_in(uuid, text)  to authenticated;
