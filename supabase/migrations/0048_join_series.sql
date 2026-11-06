-- =====================================================================
-- 0048_join_series.sql — join a series whole, and leave it whole or one date.
--
-- 16 October handoff, backend item 3, and the 3 November board Perfiles v1
-- · 3–6 (a series seen by a participant). Until now each date of a series
-- had its own roster and nothing joined more than one: the session detail
-- said «unirte a esta no te une a las demás», and the weekly club had to
-- be joined one Saturday at a time.
--
-- Neither function has rules of its own. Each date goes through
-- `join_activity()` and `leave_activity()`, so capacity is locked per date,
-- a full date puts the person on that date's waitlist only, and blocks,
-- group membership, suspensions (0020) and the attendance window (0010)
-- apply exactly as they do to one date. A date that fails rolls the whole
-- call back: joining a series is all of its remaining dates or none.
--
-- There is no membership table. Being «in the series» is being on its
-- upcoming dates. Dates added later (8 more, when the organizer renews)
-- are joined again by each person — never automatically, as the 16 October
-- handoff asks.
--
-- Leaving tells the organizer, which a single session never did: the board
-- promises «a Luis le llega un aviso». The reason is one of three words or
-- none, never free text, so it cannot carry anything the person would not
-- say to a stranger.
-- =====================================================================

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

  -- Soonest first, so when two dates are both nearly full the nearer one is
  -- the one taken, which is the one somebody is likelier to plan around.
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

  if jsonb_array_length(v_joined) + jsonb_array_length(v_waiting) = 0 then
    raise exception 'series has no upcoming dates' using errcode = '22023';
  end if;

  return jsonb_build_object('joined', v_joined, 'waitlisted', v_waiting);
end;
$$;

comment on function public.join_series(uuid) is
  'Join every upcoming date of a series through join_activity(); full dates waitlist. All or none. See 0048.';

create or replace function public.leave_series(
  p_series_id   uuid,
  p_activity_id uuid default null,
  p_reason      text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user      uuid := auth.uid();
  v_left      integer := 0;
  v_act       record;
  v_organizer uuid;
  v_title     text;
  v_date      timestamptz;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_reason is not null and p_reason not in ('trabajo', 'salud', 'viaje') then
    raise exception 'unknown reason' using errcode = '22023';
  end if;

  if p_activity_id is not null and not exists (
    select 1 from public.activities
     where id = p_activity_id and series_id = p_series_id
  ) then
    raise exception 'date is not part of this series' using errcode = '22023';
  end if;

  for v_act in
    select a.id, a.starts_at, a.organizer_id, a.title
      from public.activities a
      join public.activity_participants p
        on p.activity_id = a.id and p.user_id = v_user
     where a.series_id = p_series_id
       and (p_activity_id is null or a.id = p_activity_id)
       and a.status in ('published', 'full')
       and a.starts_at > now()
       and p.status in ('joined', 'waitlisted')
     order by a.starts_at
  loop
    perform public.leave_activity(v_act.id);
    v_left      := v_left + 1;
    v_organizer := v_act.organizer_id;
    v_title     := v_act.title;
    v_date      := coalesce(v_date, v_act.starts_at);
  end loop;

  -- One notice for the whole call, not one per date: leaving a series of
  -- eight should not ring the organizer's phone eight times.
  if v_left > 0 then
    insert into public.notifications (user_id, type, payload)
    values (
      v_organizer,
      case when p_activity_id is null then 'series_left' else 'series_date_left' end,
      jsonb_build_object(
        'series_id',   p_series_id,
        'activity_id', p_activity_id,
        'title',       v_title,
        'starts_at',   v_date,
        'dates',       v_left,
        'reason',      p_reason,
        -- The organizer sees the roster anyway; the notice says who changed it.
        'name',        (select display_name from public.profiles where id = v_user)
      )
    );
  end if;

  return v_left;
end;
$$;

comment on function public.leave_series(uuid, uuid, text) is
  'Leave every upcoming date of a series, or one (p_activity_id), through leave_activity(); one notice to the organizer with an optional reason (trabajo, salud, viaje). See 0048.';

revoke all on function public.join_series(uuid)             from public, anon;
revoke all on function public.leave_series(uuid, uuid, text) from public, anon;
grant execute on function public.join_series(uuid)             to authenticated;
grant execute on function public.leave_series(uuid, uuid, text) to authenticated;
