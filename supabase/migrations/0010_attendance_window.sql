-- =====================================================================
-- 0010_attendance_window.sql — attendance can only be recorded around the
-- session it describes.
--
-- Found in live testing on 15 September. Canchas de fonseca started at 18:00;
-- all three participants were checked in hours earlier, and the session was
-- closed at 13:00 — before it began — which recorded somebody as a permanent
-- no_show for a session that had not happened. Attendance is the number an
-- organizer eventually shows a sponsor, so a check-in that can be written
-- days ahead is not attendance.
--
--   * check_in() opens 30 minutes before the start. Enough for the person
--     standing at the portón while people arrive early; not enough to fill in
--     the roster from the sofa the night before.
--   * close_activity() requires the session to have started. Closing earlier
--     turns everyone not yet marked into a no_show for something that has not
--     taken place.
--   * join_activity() now clears checked_in_at / checked_in_by when a person
--     re-joins. Leaving and coming back used to keep the old check-in stamp,
--     which is how a live row ended up as `no_show` with a check-in time.
--
-- A cancelled session is still refused first, so its error is unchanged.
-- Rows already written early on the live project are left as they are.
-- =====================================================================

create or replace function public.join_activity(p_activity_id uuid)
returns public.participation_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_act      public.activities%rowtype;
  v_existing public.participation_status;
  v_result   public.participation_status;
  v_next_pos integer;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_act
    from public.activities
   where id = p_activity_id
   for update;

  if not found then
    raise exception 'activity not found' using errcode = 'P0002';
  end if;

  if v_act.status not in ('published', 'full') then
    raise exception 'activity is not open for joining (status: %)', v_act.status
      using errcode = '22023';
  end if;

  if v_act.starts_at <= now() then
    raise exception 'activity has already started' using errcode = '22023';
  end if;

  if v_act.organizer_id = v_user then
    raise exception 'organizer is already attending' using errcode = '22023';
  end if;

  if public.is_blocked(v_user, v_act.organizer_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  if v_act.visibility = 'community'
     and v_act.community_id is not null
     and not public.is_community_member(v_act.community_id, v_user) then
    raise exception 'community members only' using errcode = '42501';
  end if;

  select status into v_existing
    from public.activity_participants
   where activity_id = p_activity_id and user_id = v_user;

  if v_existing in ('joined', 'waitlisted', 'attended') then
    return v_existing;
  end if;

  if v_act.max_participants is not null and v_act.joined_count >= v_act.max_participants then
    v_result := 'waitlisted';
    select coalesce(max(waitlist_pos), 0) + 1 into v_next_pos
      from public.activity_participants
     where activity_id = p_activity_id;
  else
    v_result   := 'joined';
    v_next_pos := null;
  end if;

  insert into public.activity_participants
              (activity_id, user_id, status, waitlist_pos, joined_at, cancelled_at)
       values (p_activity_id, v_user, v_result, v_next_pos, now(), null)
  on conflict (activity_id, user_id) do update
      set status        = excluded.status,
          waitlist_pos  = excluded.waitlist_pos,
          joined_at     = now(),
          cancelled_at  = null,
          -- New: a re-join is a new attendance, not the old one resumed.
          checked_in_at = null,
          checked_in_by = null;

  return v_result;
end;
$$;

create or replace function public.check_in(p_activity_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_act    public.activities%rowtype;
begin
  select * into v_act from public.activities where id = p_activity_id;
  if not found then
    raise exception 'activity not found' using errcode = 'P0002';
  end if;

  if v_act.organizer_id <> v_caller
     and not (v_act.community_id is not null
              and public.is_community_organizer(v_act.community_id, v_caller)) then
    raise exception 'only the organizer can check participants in' using errcode = '42501';
  end if;

  if v_act.status = 'cancelled' then
    raise exception 'activity was cancelled' using errcode = '22023';
  end if;

  if now() < v_act.starts_at - interval '30 minutes' then
    raise exception 'check-in opens 30 minutes before the start' using errcode = '22023';
  end if;

  update public.activity_participants
     set status        = 'attended',
         checked_in_at = now(),
         checked_in_by = v_caller,
         waitlist_pos  = null
   where activity_id = p_activity_id
     and user_id     = p_user_id
     and status in ('joined', 'waitlisted', 'no_show');

  if not found then
    raise exception 'participant not found on this activity' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.close_activity(p_activity_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller  uuid := auth.uid();
  v_act     public.activities%rowtype;
  v_no_show integer;
begin
  select * into v_act from public.activities where id = p_activity_id for update;
  if not found then
    raise exception 'activity not found' using errcode = 'P0002';
  end if;

  if v_act.organizer_id <> v_caller then
    raise exception 'only the organizer can close an activity' using errcode = '42501';
  end if;

  if v_act.status = 'cancelled' then
    raise exception 'activity was cancelled' using errcode = '22023';
  end if;

  -- New: nobody can be absent from something that has not started.
  if now() < v_act.starts_at then
    raise exception 'activity has not started yet' using errcode = '22023';
  end if;

  update public.activity_participants
     set status = 'no_show'
   where activity_id = p_activity_id and status = 'joined';
  get diagnostics v_no_show = row_count;

  update public.activity_participants
     set status = 'cancelled', waitlist_pos = null
   where activity_id = p_activity_id and status = 'waitlisted';

  update public.activities
     set status = 'completed'
   where id = p_activity_id;

  return v_no_show;
end;
$$;
