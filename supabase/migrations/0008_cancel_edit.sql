-- =====================================================================
-- 0008_cancel_edit.sql — organizers can cancel and edit a session.
--
-- Until now `status = 'cancelled'` was rendered by Organizar and written by
-- nothing. The only mutation path for an organizer was the table-wide UPDATE
-- grant from 0003, which is why this migration does two things at once:
--
--   1. It adds cancel_activity() and update_activity(), with the invariants a
--      session carries once other people are counting on it.
--
--   2. It REVOKES that direct UPDATE. The grant let an organizer write any
--      column of their own session through PostgREST — joined_count, status,
--      waitlist_count — which are the numbers attendance and every sponsor
--      conversation downstream are read from. Participation already went
--      through RPCs for exactly this reason (0003); editing now matches.
--      Nothing in the app used the grant.
--
-- Decisions worth knowing before changing any of this:
--
--   * Once anybody is on the roster, the time and the venue are locked.
--     Movo sends no notifications yet, so moving a session people already
--     joined would send them to the wrong place at the wrong time with no
--     way to find out. The organizer cancels — which does notify, into the
--     inbox — and publishes a new one.
--   * Capacity can go up freely and down only to joined_count. Raising it
--     promotes the waitlist in order in the same transaction, the way
--     leave_activity already did, so a freed slot never sits empty while
--     somebody waits for it.
--   * Price and category are not editable. Changing the price after people
--     joined is a bait-and-switch, and changing the category changes the
--     shape of `attributes`.
--   * Cancelling keeps every participant row as it was. The session's status
--     carries the cancellation; rewriting participants to 'cancelled' would
--     make it look as if each of them had left.
--   * A cancelled session can no longer be checked in or closed. Closing one
--     would turn everybody who was told not to come into a permanent
--     no_show.
-- =====================================================================

-- ------------------------------------------------------------ columns

alter table public.activities
  add column cancelled_at  timestamptz,
  add column cancel_reason text check (length(cancel_reason) <= 280);

comment on column public.activities.cancel_reason is
  'Shown to everyone on the roster. "Llueve" is the most useful sentence '
  'this column will ever hold, so it is optional but never hidden.';

-- ------------------------------------------------------------ direct update

revoke update on public.activities from authenticated;
drop policy if exists activities_update_own on public.activities;

-- ------------------------------------------------------------ helpers

-- Waitlist positions are shown to people ("puesto 3"). Promoting the head
-- used to leave the rest numbered from 2, which reads as a queue that did
-- not move.
create or replace function public.renumber_waitlist(p_activity_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.activity_participants p
     set waitlist_pos = r.pos
    from (
      select user_id, row_number() over (order by waitlist_pos, joined_at) as pos
        from public.activity_participants
       where activity_id = p_activity_id and status = 'waitlisted'
    ) r
   where p.activity_id = p_activity_id
     and p.user_id = r.user_id
     and p.waitlist_pos is distinct from r.pos;
$$;

revoke all on function public.renumber_waitlist(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------ cancel

create or replace function public.cancel_activity(p_activity_id uuid, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller   uuid := auth.uid();
  v_act      public.activities%rowtype;
  v_reason   text := nullif(trim(p_reason), '');
  v_notified integer;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_act from public.activities where id = p_activity_id for update;
  if not found then
    raise exception 'activity not found' using errcode = 'P0002';
  end if;

  if v_act.organizer_id <> v_caller then
    raise exception 'only the organizer can cancel an activity' using errcode = '42501';
  end if;

  if v_act.status = 'cancelled' then
    return 0;
  end if;

  if v_act.status = 'completed' then
    raise exception 'activity is already closed' using errcode = '22023';
  end if;

  update public.activities
     set status        = 'cancelled',
         cancelled_at  = now(),
         cancel_reason = v_reason
   where id = p_activity_id;

  -- There is no push channel yet, so the inbox row is the only trace of the
  -- cancellation outside the session itself. Written now so that whatever
  -- delivers notifications later has something to deliver.
  insert into public.notifications (user_id, type, payload)
  select p.user_id,
         'activity_cancelled',
         jsonb_build_object(
           'activity_id', p_activity_id,
           'title',       v_act.title,
           'starts_at',   v_act.starts_at,
           'reason',      v_reason
         )
    from public.activity_participants p
   where p.activity_id = p_activity_id
     and p.status in ('joined', 'waitlisted');
  get diagnostics v_notified = row_count;

  return v_notified;
end;
$$;

grant execute on function public.cancel_activity(uuid, text) to authenticated;

-- ------------------------------------------------------------ edit

create or replace function public.update_activity(
  p_activity_id      uuid,
  p_title            text,
  p_meeting_point    text,
  p_starts_at        timestamptz,
  p_duration_minutes integer,
  p_location_id      uuid,
  p_max_participants integer
)
returns public.activities
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller   uuid := auth.uid();
  v_act      public.activities%rowtype;
  v_on_list  integer;
  v_old_cur  public.currency_code;
  v_new_cur  public.currency_code;
  v_promoted uuid;
  v_result   public.activities%rowtype;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_act from public.activities where id = p_activity_id for update;
  if not found then
    raise exception 'activity not found' using errcode = 'P0002';
  end if;

  if v_act.organizer_id <> v_caller then
    raise exception 'only the organizer can edit an activity' using errcode = '42501';
  end if;

  if v_act.status not in ('draft', 'published', 'full') then
    raise exception 'activity can no longer be edited (status: %)', v_act.status
      using errcode = '22023';
  end if;

  if v_act.starts_at <= now() then
    raise exception 'activity has already started' using errcode = '22023';
  end if;

  if p_duration_minutes is null or p_duration_minutes < 15 then
    raise exception 'duration must be at least 15 minutes' using errcode = '22023';
  end if;

  if p_starts_at is null or p_starts_at <= now() then
    raise exception 'new start time is in the past' using errcode = '22023';
  end if;

  select count(*) into v_on_list
    from public.activity_participants
   where activity_id = p_activity_id and status in ('joined', 'waitlisted');

  if v_on_list > 0
     and (p_starts_at <> v_act.starts_at or p_location_id <> v_act.location_id) then
    raise exception 'time and place are locked once people have joined'
      using errcode = '22023';
  end if;

  if p_location_id <> v_act.location_id then
    select currency into v_old_cur from public.locations where id = v_act.location_id;
    select currency into v_new_cur from public.locations where id = p_location_id;
    if v_new_cur is null then
      raise exception 'location not found' using errcode = 'P0002';
    end if;
    -- price_minor would be silently reinterpreted in another currency.
    if v_new_cur <> v_old_cur then
      raise exception 'new location uses a different currency' using errcode = '22023';
    end if;
  end if;

  if p_max_participants is not null and p_max_participants < v_act.joined_count then
    raise exception 'capacity cannot drop below the % people already going', v_act.joined_count
      using errcode = '22023';
  end if;

  update public.activities
     set title            = trim(p_title),
         meeting_point    = nullif(trim(p_meeting_point), ''),
         starts_at        = p_starts_at,
         ends_at          = p_starts_at + make_interval(mins => p_duration_minutes),
         location_id      = p_location_id,
         max_participants = p_max_participants
   where id = p_activity_id;

  -- Promote into whatever room the new capacity made, in queue order. LIMIT
  -- NULL is no limit, which is what an uncapped session should do with its
  -- whole waitlist.
  for v_promoted in
    select user_id
      from public.activity_participants
     where activity_id = p_activity_id and status = 'waitlisted'
     order by waitlist_pos, joined_at
     limit case
             when p_max_participants is null then null
             else greatest(p_max_participants - v_act.joined_count, 0)
           end
  loop
    update public.activity_participants
       set status = 'joined', waitlist_pos = null
     where activity_id = p_activity_id and user_id = v_promoted;

    insert into public.notifications (user_id, type, payload)
    values (v_promoted, 'waitlist_promoted',
            jsonb_build_object('activity_id', p_activity_id, 'title', trim(p_title)));
  end loop;

  perform public.renumber_waitlist(p_activity_id);

  -- The counter trigger only runs when a participant row changes. A capacity
  -- change with nobody waiting touches no participant, so full/published has
  -- to be settled here too.
  update public.activities a
     set status = case
                    when a.max_participants is not null and a.joined_count >= a.max_participants
                      then 'full'::public.activity_status
                    else 'published'::public.activity_status
                  end
   where a.id = p_activity_id
     and a.status in ('published', 'full');

  select * into v_result from public.activities where id = p_activity_id;
  return v_result;
end;
$$;

grant execute on function public.update_activity(uuid, text, text, timestamptz, integer, uuid, integer)
  to authenticated;

-- ------------------------------------------------------------ guards on existing RPCs

create or replace function public.leave_activity(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user      uuid := auth.uid();
  v_was       public.participation_status;
  v_act       public.activities%rowtype;
  v_promote   uuid;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_act from public.activities where id = p_activity_id for update;
  if not found then
    raise exception 'activity not found' using errcode = 'P0002';
  end if;

  select status into v_was
    from public.activity_participants
   where activity_id = p_activity_id and user_id = v_user;

  if v_was is null or v_was = 'cancelled' then
    return;
  end if;

  update public.activity_participants
     set status = 'cancelled', cancelled_at = now(), waitlist_pos = null
   where activity_id = p_activity_id and user_id = v_user;

  -- New: no promotion into a session that is not happening. It would send
  -- somebody a "you're in" for an event that was already called off.
  if v_was = 'joined' and v_act.status in ('published', 'full') then
    select user_id into v_promote
      from public.activity_participants
     where activity_id = p_activity_id and status = 'waitlisted'
     order by waitlist_pos
     limit 1;

    if v_promote is not null then
      update public.activity_participants
         set status = 'joined', waitlist_pos = null
       where activity_id = p_activity_id and user_id = v_promote;

      insert into public.notifications (user_id, type, payload)
      values (v_promote, 'waitlist_promoted',
              jsonb_build_object('activity_id', p_activity_id, 'title', v_act.title));
    end if;
  end if;

  perform public.renumber_waitlist(p_activity_id);
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

  -- Everybody on a cancelled session was told not to come. Closing it would
  -- record every one of them as a no_show, permanently.
  if v_act.status = 'cancelled' then
    raise exception 'activity was cancelled' using errcode = '22023';
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
