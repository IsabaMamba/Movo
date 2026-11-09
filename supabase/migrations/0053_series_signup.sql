-- =====================================================================
-- 0053_series_signup.sql — how people join a series: whole, single dates, or both.
--
-- 16 October handoff, backend item 3: «two activity_series flags: allow
-- whole-series sign-up, allow single dates». 0048 built join_series() and
-- left both always on. Some series need one way only:
--
--   * Whole series only: a course or a training block that builds week on
--     week. A date cannot be joined on its own; join_series() is the way in.
--     Missing one date afterwards is still allowed — leave_series() with a
--     date — because life happens, and the organizer is told.
--   * Single dates only: a drop-in club where nobody should hold eight
--     Saturdays they may not use. join_series() and invite_to_series() say
--     no.
--
-- At least one stays on. Both are on by default, so every existing series
-- keeps behaving exactly as before.
--
-- The single-date rule is a trigger on activity_participants rather than a
-- change to join_activity(), so it holds for every way a place is taken.
-- join_series() marks its own transaction with `movo.series_join`, which the
-- trigger reads; a client cannot set it, because PostgREST runs one call per
-- transaction and exposes no way to set a GUC.
--
-- The template row is readable only by its organizer and group (0003), so
-- series_signup() tells anybody the two flags and nothing else.
-- =====================================================================

alter table public.activity_series
  add column allow_whole_signup boolean not null default true,
  add column allow_single_dates boolean not null default true,
  add constraint activity_series_some_signup check (allow_whole_signup or allow_single_dates);

comment on column public.activity_series.allow_whole_signup is
  'join_series() is allowed. See 0053.';
comment on column public.activity_series.allow_single_dates is
  'A date can be joined on its own; when false only join_series() takes places. See 0053.';

-- ------------------------------------------------------------ read the rule

create or replace function public.series_signup(p_series_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'allow_whole',  s.allow_whole_signup,
    'allow_single', s.allow_single_dates
  )
    from public.activity_series s
   where s.id = p_series_id;
$$;

comment on function public.series_signup(uuid) is
  'The two sign-up flags of a series, for anybody who can see one of its dates. See 0053.';

revoke all on function public.series_signup(uuid) from public;
grant execute on function public.series_signup(uuid) to anon, authenticated;

-- ------------------------------------------------------------- set the rule

create or replace function public.set_series_signup(
  p_series_id    uuid,
  p_allow_whole  boolean,
  p_allow_single boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.activity_series
     where id = p_series_id and organizer_id = auth.uid()
  ) then
    raise exception 'Solo quien organiza la serie puede cambiar esto.' using errcode = '42501';
  end if;
  if not coalesce(p_allow_whole, false) and not coalesce(p_allow_single, false) then
    raise exception 'a series needs at least one way to join' using errcode = '22023';
  end if;

  -- People already on dates keep them: the rule is about the next sign-up.
  update public.activity_series
     set allow_whole_signup = p_allow_whole,
         allow_single_dates = p_allow_single,
         updated_at         = now()
   where id = p_series_id;
end;
$$;

comment on function public.set_series_signup(uuid, boolean, boolean) is
  'The organizer sets whether the series takes whole sign-ups, single dates, or both. See 0053.';

revoke all on function public.set_series_signup(uuid, boolean, boolean) from public, anon;
grant execute on function public.set_series_signup(uuid, boolean, boolean) to authenticated;

-- ------------------------------------------------- single dates, enforced

create or replace function public.enforce_series_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series uuid;
  v_single boolean;
  v_owner  uuid;
begin
  -- Only a new place: a waitlist promotion or a check-in is not a sign-up.
  if new.status not in ('joined', 'waitlisted') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status in ('joined', 'waitlisted') then
    return new;
  end if;

  select a.series_id, s.allow_single_dates, a.organizer_id
    into v_series, v_single, v_owner
    from public.activities a
    join public.activity_series s on s.id = a.series_id
   where a.id = new.activity_id;

  if v_series is null or v_single or new.user_id = v_owner then
    return new;
  end if;

  if coalesce(current_setting('movo.series_join', true), '') <> v_series::text then
    raise exception 'series takes whole sign-ups only' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_series_signup() from public, anon, authenticated;

create trigger activity_participants_series_signup
  before insert or update of status on public.activity_participants
  for each row execute function public.enforce_series_signup();

-- ------------------------------------------------------------ join_series

-- As in 0048, plus the whole-series flag and the mark the trigger reads.
create or replace function public.join_series(p_series_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_act     record;
  v_status  public.participation_status;
  v_joined  jsonb := '[]'::jsonb;
  v_waiting jsonb := '[]'::jsonb;
  v_pos     integer;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.activity_series
     where id = p_series_id and not allow_whole_signup
  ) then
    raise exception 'series takes single dates only' using errcode = '22023';
  end if;

  perform set_config('movo.series_join', p_series_id::text, true);

  for v_act in
    select id, starts_at
      from public.activities
     where series_id = p_series_id
       and status in ('published', 'full')
       and starts_at > now()
     order by starts_at
  loop
    v_status := public.join_activity(v_act.id);

    if v_status = 'waitlisted' then
      select waitlist_pos into v_pos
        from public.activity_participants
       where activity_id = v_act.id and user_id = v_user;
      v_waiting := v_waiting || jsonb_build_object(
        'activity_id', v_act.id, 'starts_at', v_act.starts_at, 'position', v_pos);
    else
      v_joined := v_joined || jsonb_build_object(
        'activity_id', v_act.id, 'starts_at', v_act.starts_at);
    end if;
  end loop;

  perform set_config('movo.series_join', '', true);

  if jsonb_array_length(v_joined) + jsonb_array_length(v_waiting) = 0 then
    raise exception 'series has no upcoming dates' using errcode = '22023';
  end if;

  return jsonb_build_object('joined', v_joined, 'waitlisted', v_waiting);
end;
$$;

-- ------------------------------------------------------- invite_to_series

-- As in 0052, refusing a series that takes single dates only: an invitation
-- to «toda la serie» would lead to a button that says no.
create or replace function public.invite_to_series(p_series_id uuid, p_user_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_series public.activity_series;
  v_name   text;
  v_count  integer;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_series from public.activity_series where id = p_series_id;
  if not found or v_series.organizer_id <> v_user then
    raise exception 'Solo quien organiza la serie puede invitar.' using errcode = '42501';
  end if;
  if not v_series.is_active then
    raise exception 'series is not active' using errcode = '22023';
  end if;
  if not v_series.allow_whole_signup then
    raise exception 'series takes single dates only' using errcode = '22023';
  end if;
  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    return 0;
  end if;
  if cardinality(p_user_ids) > 50 then
    raise exception 'at most 50 people at a time' using errcode = '22023';
  end if;

  select display_name into v_name from public.profiles where id = v_user;

  with fresh as (
    insert into public.series_invitations (series_id, user_id, invited_by)
    select p_series_id, c.user_id, v_user
      from public.series_invite_candidates(p_series_id) c
     where c.user_id = any (p_user_ids)
       and not c.invited
    on conflict do nothing
    returning user_id
  ), sent as (
    insert into public.notifications (user_id, type, payload)
    select f.user_id, 'series_invitation',
           jsonb_build_object(
             'series_id',        p_series_id,
             'title',            v_series.title,
             'weekday',          v_series.weekday,
             'local_start_time', to_char(v_series.local_start_time, 'HH24:MI'),
             'name',             v_name
           )
      from fresh f
    returning 1
  )
  select count(*)::integer into v_count from fresh;

  return v_count;
end;
$$;
