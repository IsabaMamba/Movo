-- =====================================================================
-- 0002_functions.sql — triggers, helpers, and the RPCs clients call
--
-- Every function that writes participation is SECURITY DEFINER with an
-- empty search_path and fully-qualified names. Clients get EXECUTE on the
-- RPCs and no INSERT/UPDATE grant on activity_participants at all, so
-- capacity can never be bypassed by writing the row directly.
-- =====================================================================

-- ------------------------------------------------------- updated_at

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch        before update on public.profiles         for each row execute function public.touch_updated_at();
create trigger profile_private_touch before update on public.profile_private  for each row execute function public.touch_updated_at();
create trigger communities_touch     before update on public.communities      for each row execute function public.touch_updated_at();
create trigger series_touch          before update on public.activity_series  for each row execute function public.touch_updated_at();
create trigger activities_touch      before update on public.activities       for each row execute function public.touch_updated_at();

-- --------------------------------------------- new auth user -> profile

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := trim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
begin
  -- Sanitize rather than trust: a name that fails the profiles check
  -- constraint would raise here and abort the entire signup transaction.
  if length(v_name) < 2 or length(v_name) > 60 then
    v_name := 'Nuevo usuario';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, v_name)
  on conflict (id) do nothing;

  insert into public.profile_private (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------- RLS helper predicates
--
-- These are SECURITY DEFINER on purpose. A policy on activity_participants
-- that queries activity_participants recurses infinitely; routing the check
-- through a definer function bypasses RLS for that lookup and terminates.

create or replace function public.is_activity_participant(p_activity_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.activity_participants p
     where p.activity_id = p_activity_id
       and p.user_id     = p_user_id
       and p.status in ('joined', 'waitlisted', 'attended')
  );
$$;

create or replace function public.is_activity_organizer(p_activity_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.activities a
     where a.id = p_activity_id and a.organizer_id = p_user_id
  );
$$;

create or replace function public.is_community_member(p_community_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.community_members m
     where m.community_id = p_community_id and m.user_id = p_user_id
  );
$$;

create or replace function public.is_community_organizer(p_community_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.community_members m
     where m.community_id = p_community_id
       and m.user_id      = p_user_id
       and m.role in ('organizer', 'owner')
  );
$$;

-- Symmetric: a block hides both directions.
create or replace function public.is_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
     where (b.blocker_id = p_a and b.blocked_id = p_b)
        or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

-- ------------------------------------------------------ counter upkeep

create or replace function public.sync_activity_counters()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := coalesce(new.activity_id, old.activity_id);
begin
  update public.activities a
     set joined_count = (
           select count(*) from public.activity_participants p
            where p.activity_id = v_id and p.status in ('joined', 'attended')
         ),
         waitlist_count = (
           select count(*) from public.activity_participants p
            where p.activity_id = v_id and p.status = 'waitlisted'
         )
   where a.id = v_id;

  -- Keep published/full in sync with capacity. Deliberately does not touch
  -- draft, cancelled or completed.
  update public.activities a
     set status = case
                    when a.max_participants is not null and a.joined_count >= a.max_participants
                      then 'full'::public.activity_status
                    else 'published'::public.activity_status
                  end
   where a.id = v_id
     and a.status in ('published', 'full');

  return null;
end;
$$;

create trigger activity_participants_counters
  after insert or update or delete on public.activity_participants
  for each row execute function public.sync_activity_counters();

-- ===================================================================
-- RPCs
-- ===================================================================

-- Join. Race-free: the activity row is locked before capacity is read, so
-- two simultaneous joins on the last slot cannot both succeed. Returns the
-- status actually granted — 'joined' or 'waitlisted'.
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
      set status       = excluded.status,
          waitlist_pos = excluded.waitlist_pos,
          joined_at    = now(),
          cancelled_at = null;

  return v_result;
end;
$$;

-- Leave. Promotes the head of the waitlist in the same transaction, so a
-- cancellation never leaves a paid-for slot empty.
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

  if v_was = 'joined' then
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
end;
$$;

-- Check-in. Organizer-only. This is the call that creates attendance data.
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

-- Close-out. Everyone still merely 'joined' becomes a no-show. Run this from
-- the organizer's screen after the session, or from a scheduled job.
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

-- Discovery. SECURITY INVOKER on purpose: RLS on activities still applies,
-- so this cannot leak private or community-only sessions.
create or replace function public.nearby_activities(
  p_lat        double precision,
  p_lng        double precision,
  p_radius_m   integer     default 15000,
  p_categories text[]      default null,
  p_from       timestamptz default now(),
  p_to         timestamptz default null,
  p_limit      integer     default 50,
  p_offset     integer     default 0
)
returns table (
  id             uuid,
  title          text,
  category_id    text,
  starts_at      timestamptz,
  ends_at        timestamptz,
  location_name  text,
  district       text,
  lat            double precision,
  lng            double precision,
  distance_m     double precision,
  joined_count   integer,
  max_participants integer,
  skill          skill_level,
  difficulty     smallint,
  price_crc      integer,
  cover_url      text,
  organizer_id   uuid,
  status         activity_status
)
language sql
stable
as $$
  with origin as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as g
  )
  select a.id,
         a.title,
         a.category_id,
         a.starts_at,
         a.ends_at,
         l.name,
         l.district,
         extensions.st_y(l.geog::extensions.geometry),
         extensions.st_x(l.geog::extensions.geometry),
         extensions.st_distance(l.geog, o.g),
         a.joined_count,
         a.max_participants,
         a.skill,
         a.difficulty,
         a.price_crc,
         a.cover_url,
         a.organizer_id,
         a.status
    from public.activities a
    join public.locations  l on l.id = a.location_id
   cross join origin o
   where a.status in ('published', 'full')
     and a.starts_at >= p_from
     and (p_to is null or a.starts_at <= p_to)
     and (p_categories is null or a.category_id = any (p_categories))
     and extensions.st_dwithin(l.geog, o.g, p_radius_m)
     and not public.is_blocked(auth.uid(), a.organizer_id)
   order by a.starts_at, extensions.st_distance(l.geog, o.g)
   limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

-- Materialize occurrences of a recurring series up to a horizon.
-- Idempotent: the partial unique index on (series_id, starts_at) makes
-- re-running it a no-op for dates already generated.
create or replace function public.generate_series_occurrences(
  p_series_id uuid,
  p_until     date default (current_date + 60)
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s       public.activity_series%rowtype;
  v_date    date;
  v_step    integer;
  v_start   timestamptz;
  v_created integer := 0;
begin
  select * into v_s from public.activity_series where id = p_series_id;
  if not found then
    raise exception 'series not found' using errcode = 'P0002';
  end if;

  if v_s.organizer_id <> auth.uid() then
    raise exception 'only the organizer can generate occurrences' using errcode = '42501';
  end if;

  v_step := case v_s.frequency
              when 'weekly'   then 7
              when 'biweekly' then 14
              -- Monthly is approximated as every 4 weeks so the weekday holds.
              when 'monthly'  then 28
            end;

  v_date := current_date;
  v_date := v_date + ((7 + v_s.weekday - extract(dow from v_date)::integer) % 7);

  while v_date <= p_until loop
    v_start := (v_date + v_s.local_start_time) at time zone v_s.timezone;

    insert into public.activities (
      series_id, organizer_id, community_id, category_id, location_id,
      title, description, starts_at, ends_at, max_participants,
      skill, difficulty, price_crc, attributes, visibility, status, source
    ) values (
      v_s.id, v_s.organizer_id, v_s.community_id, v_s.category_id, v_s.location_id,
      v_s.title, v_s.description, v_start,
      v_start + make_interval(mins => v_s.duration_minutes),
      v_s.max_participants, v_s.skill, v_s.difficulty, v_s.price_crc,
      v_s.attributes, 'public', 'published', 'native'
    )
    on conflict (series_id, starts_at) where series_id is not null do nothing;

    if found then
      v_created := v_created + 1;
    end if;

    v_date := v_date + v_step;
  end loop;

  return v_created;
end;
$$;

-- ------------------------------------------------------------- grants
--
-- Note what is absent: no table-level INSERT/UPDATE on
-- activity_participants. Joining is only possible through join_activity.

revoke all on function public.join_activity(uuid)                        from public;
revoke all on function public.leave_activity(uuid)                       from public;
revoke all on function public.check_in(uuid, uuid)                       from public;
revoke all on function public.close_activity(uuid)                       from public;
revoke all on function public.generate_series_occurrences(uuid, date)    from public;

grant execute on function public.join_activity(uuid)                     to authenticated;
grant execute on function public.leave_activity(uuid)                    to authenticated;
grant execute on function public.check_in(uuid, uuid)                    to authenticated;
grant execute on function public.close_activity(uuid)                    to authenticated;
grant execute on function public.generate_series_occurrences(uuid, date) to authenticated;
grant execute on function public.nearby_activities(
  double precision, double precision, integer, text[], timestamptz, timestamptz, integer, integer
) to authenticated, anon;
