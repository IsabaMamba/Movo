-- =====================================================================
-- 0013_series_mutations.sql — a series is edited through functions, not
-- through a direct UPDATE
--
-- `0008` revoked the direct UPDATE on `activities` because the grant let an
-- organizer write any column of their own session through PostgREST —
-- joined_count, status, waitlist_count — the numbers attendance and every
-- sponsor conversation are read from.
--
-- `activity_series` kept the same shape of grant: `activity_series_write` is
-- a FOR ALL policy over `insert, update, delete`. So everything 0008 forbade
-- for a session has been available on a series the whole time:
--
--   * **Price after the fact.** 0008 refuses a price change once anybody
--     joined and calls it a bait-and-switch. Changing `price_minor` on the
--     series is the same act one level up: every occurrence generated after
--     it carries the new price, and the people already on the earlier ones
--     are told nothing.
--   * **Moving the session under people.** 0008 locks `starts_at` and
--     `location_id` once the roster is non-empty, because Movo delivers no
--     notifications and moving a session sends people to the wrong place at
--     the wrong time with no way to find out. `local_start_time`, `weekday`
--     and `location_id` on a series were not locked at all.
--   * **Silent divergence.** Editing a series never touched the occurrences
--     already generated from it, and nothing reconciled them. The series and
--     its sessions drifted apart with no error and no record.
--
-- Three things here:
--
--   1. `update_series()` — the same invariants 0008 applies to a session,
--      applied to the template, and **propagated to the future occurrences
--      that nobody has joined yet**, so the two stop drifting.
--   2. `cancel_series()` — deactivates the template and cancels every future
--      occurrence through `cancel_activity()`, so each one notifies its own
--      participants exactly as a single cancellation does.
--   3. `generate_series_occurrences()` is replaced to refuse an inactive
--      series. It never checked `is_active`, so a cancelled series would have
--      gone on generating sessions — which would have made `cancel_series()`
--      a lie the first time anybody used it.
--
-- INSERT stays granted, exactly as it does on `activities`: creating is not
-- the dangerous verb, and `createSeries()` in `src/lib/activities.ts` uses it.
-- =====================================================================

revoke update, delete on public.activity_series from authenticated;

-- DELETE goes too. `activities.series_id` is `on delete set null`, so deleting
-- a template turned every future date into a standalone session, still
-- published and nobody told: cancel_series() without the cancelling.
-- `activity_series_write` is FOR ALL and now governs INSERT alone, which is
-- what createSeries() uses, so the policy stays as it is.

-- ------------------------------------------------------- update_series

create or replace function public.update_series(
  p_series_id        uuid,
  p_title            text,
  p_description      text,
  p_local_start_time time,
  p_weekday          smallint,
  p_duration_minutes integer,
  p_location_id      uuid,
  p_max_participants integer
)
returns public.activity_series
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller  uuid := auth.uid();
  v_s       public.activity_series%rowtype;
  v_on_list integer;
  v_peak    integer;
  v_result  public.activity_series%rowtype;
  v_new_cur public.currency_code;
  v_moved   boolean;
  v_occ     record;
  v_start   timestamptz;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_s from public.activity_series where id = p_series_id for update;
  if not found then
    raise exception 'series not found' using errcode = 'P0002';
  end if;

  if v_s.organizer_id <> v_caller then
    raise exception 'only the organizer can edit a series' using errcode = '42501';
  end if;

  if not v_s.is_active then
    raise exception 'series is cancelled' using errcode = '22023';
  end if;

  if p_duration_minutes is null or p_duration_minutes < 15 then
    raise exception 'duration must be at least 15 minutes' using errcode = '22023';
  end if;

  if p_weekday is null or p_weekday < 0 or p_weekday > 6 then
    raise exception 'weekday must be 0-6' using errcode = '22023';
  end if;

  -- Anybody on a future occurrence of this series. One person is enough: the
  -- lock is about not moving a session under somebody who is planning to turn
  -- up, and that is as true of one person as of thirty.
  select count(*) into v_on_list
    from public.activity_participants p
    join public.activities a on a.id = p.activity_id
   where a.series_id = p_series_id
     and a.starts_at > now()
     and a.status in ('published', 'full')
     and p.status in ('joined', 'waitlisted');

  if v_on_list > 0 then
    if p_local_start_time is distinct from v_s.local_start_time
       or p_weekday is distinct from v_s.weekday
       or p_location_id is distinct from v_s.location_id
       or p_duration_minutes is distinct from v_s.duration_minutes then
      raise exception
        'time and venue are locked: % people are on upcoming sessions of this series. Cancel and publish a new series, or edit the individual session',
        v_on_list using errcode = '22023';
    end if;
  end if;

  -- Same rule update_activity() applies in 0008: price_minor is in the series'
  -- currency, and a venue quoted in another one would reinterpret it silently.
  if p_location_id is distinct from v_s.location_id then
    select currency into v_new_cur from public.locations where id = p_location_id;
    if v_new_cur is null then
      raise exception 'location not found' using errcode = 'P0002';
    end if;
    if v_new_cur <> v_s.currency then
      raise exception 'new location uses a different currency' using errcode = '22023';
    end if;
  end if;

  -- Capacity rises freely. It can fall only to the fullest future occurrence,
  -- because lowering it past that would leave sessions over capacity with
  -- nobody removed — and choosing who to remove is not a thing software
  -- should do quietly.
  if p_max_participants is not null then
    if p_max_participants < 2 then
      raise exception 'capacity must be at least 2' using errcode = '22023';
    end if;

    select coalesce(max(a.joined_count), 0) into v_peak
      from public.activities a
     where a.series_id = p_series_id
       and a.starts_at > now()
       and a.status in ('published', 'full');

    if p_max_participants < v_peak then
      raise exception 'capacity cannot go below %, the fullest upcoming session', v_peak
        using errcode = '22023';
    end if;
  end if;

  update public.activity_series
     set title            = trim(p_title),
         description      = nullif(trim(coalesce(p_description, '')), ''),
         local_start_time = p_local_start_time,
         weekday          = p_weekday,
         duration_minutes = p_duration_minutes,
         location_id      = p_location_id,
         max_participants = p_max_participants,
         updated_at       = now()
   where id = p_series_id
  returning * into v_result;

  -- The divergence fix. Future occurrences that nobody has joined follow the
  -- template; ones with people on them do not move, because the roster is
  -- exactly the reason 0008 locks a session. Those keep whatever they had and
  -- the organizer edits them one at a time if they want to.
  update public.activities a
     set title            = v_result.title,
         description      = v_result.description,
         location_id      = v_result.location_id,
         max_participants = v_result.max_participants,
         ends_at          = a.starts_at + make_interval(mins => v_result.duration_minutes)
   where a.series_id = p_series_id
     and a.starts_at > now()
     and a.status in ('published', 'full')
     and a.joined_count = 0
     and a.waitlist_count = 0;

  -- The dates themselves have to follow a change of day or hour. The update
  -- above never touches starts_at, so without this the existing dates stayed
  -- at the old time and the next generate_series_occurrences() added a second
  -- session every week at the new one: its on-conflict key is
  -- (series_id, starts_at), and the two starts differ.
  --
  -- Reached only when nobody is on any upcoming date; otherwise the lock above
  -- already refused. Each date keeps its week, shifting by the weekday
  -- difference and taking the new local hour. A date that would land in the
  -- past is cancelled rather than left at the old hour; nobody is on it, so
  -- nobody is told. Only when the day or hour actually changed, so a rename
  -- does not snap a date that was moved on its own back to the template.
  v_moved := p_local_start_time is distinct from v_s.local_start_time
          or p_weekday is distinct from v_s.weekday;

  if v_moved then
    for v_occ in
      select a.id, a.starts_at
        from public.activities a
       where a.series_id = p_series_id
         and a.starts_at > now()
         and a.status in ('published', 'full')
         and a.joined_count = 0
         and a.waitlist_count = 0
       order by a.starts_at
    loop
      v_start := (((v_occ.starts_at at time zone v_result.timezone)::date
                   + (v_result.weekday - v_s.weekday)::integer)
                  + v_result.local_start_time) at time zone v_result.timezone;

      if v_start > now() then
        update public.activities
           set starts_at = v_start,
               ends_at   = v_start + make_interval(mins => v_result.duration_minutes)
         where id = v_occ.id;
      else
        perform public.cancel_activity(
          v_occ.id, 'La serie cambió de horario y esta fecha quedó en el pasado');
      end if;
    end loop;
  end if;

  return v_result;
end;
$$;

comment on function public.update_series(uuid, text, text, time, smallint, integer, uuid, integer) is
  'The only way a series changes. Price and category are absent from the '
  'signature on purpose: 0008 calls a post-hoc price change a bait-and-switch, '
  'and changing the category changes the shape of `attributes`. Propagates to '
  'future occupied-by-nobody occurrences so the template and its sessions stop '
  'drifting.';

revoke all on function public.update_series(
  uuid, text, text, time, smallint, integer, uuid, integer
) from public, anon;
grant execute on function public.update_series(
  uuid, text, text, time, smallint, integer, uuid, integer
) to authenticated;

-- ------------------------------------------------------- cancel_series

create or replace function public.cancel_series(p_series_id uuid, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller    uuid := auth.uid();
  v_s         public.activity_series%rowtype;
  v_activity  uuid;
  v_cancelled integer := 0;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_s from public.activity_series where id = p_series_id for update;
  if not found then
    raise exception 'series not found' using errcode = 'P0002';
  end if;

  if v_s.organizer_id <> v_caller then
    raise exception 'only the organizer can cancel a series' using errcode = '42501';
  end if;

  update public.activity_series
     set is_active = false, updated_at = now()
   where id = p_series_id;

  -- Each occurrence goes through cancel_activity() rather than a bulk UPDATE,
  -- so every one writes its own notification rows to its own participants.
  -- A bulk update would leave the sessions cancelled and nobody told.
  --
  -- Past occurrences are left exactly as they are: they happened, and their
  -- attendance is the only record that they did.
  for v_activity in
    select a.id from public.activities a
     where a.series_id = p_series_id
       and a.starts_at > now()
       and a.status in ('draft', 'published', 'full')
     order by a.starts_at
  loop
    perform public.cancel_activity(v_activity, p_reason);
    v_cancelled := v_cancelled + 1;
  end loop;

  return v_cancelled;
end;
$$;

comment on function public.cancel_series(uuid, text) is
  'Deactivates the template and cancels every future occurrence through '
  'cancel_activity(), so each notifies its own participants. Past occurrences '
  'are untouched — they happened, and their attendance says so.';

revoke all on function public.cancel_series(uuid, text) from public, anon;
grant execute on function public.cancel_series(uuid, text) to authenticated;

-- ------------------------------ generate_series_occurrences, with the guard

-- Replaced in full rather than altered, because a column rename does not
-- rewrite a function body and neither does adding a guard. This is the
-- definition as it stands after 0005, taken from pg_get_functiondef rather
-- than retyped, with exactly one guard inserted — a first draft of this
-- migration paraphrased it from memory and silently dropped the `visibility`
-- and `source` columns and the `on conflict` clause.

CREATE OR REPLACE FUNCTION public.generate_series_occurrences(p_series_id uuid, p_until date DEFAULT (CURRENT_DATE + 60))
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- The only change in this function. It never checked is_active, so a
  -- cancelled series would have kept generating sessions and cancel_series()
  -- would have been a lie the first time anybody used it.
  if not v_s.is_active then
    raise exception 'series is cancelled and generates nothing' using errcode = '22023';
  end if;

  v_step := case v_s.frequency
              when 'weekly'   then 7
              when 'biweekly' then 14
              when 'monthly'  then 28
            end;

  v_date := current_date;
  v_date := v_date + ((7 + v_s.weekday - extract(dow from v_date)::integer) % 7);

  while v_date <= p_until loop
    v_start := (v_date + v_s.local_start_time) at time zone v_s.timezone;

    insert into public.activities (
      series_id, organizer_id, community_id, category_id, location_id,
      title, description, starts_at, ends_at, max_participants,
      skill, difficulty, price_minor, currency, attributes, visibility, status, source
    ) values (
      v_s.id, v_s.organizer_id, v_s.community_id, v_s.category_id, v_s.location_id,
      v_s.title, v_s.description, v_start,
      v_start + make_interval(mins => v_s.duration_minutes),
      v_s.max_participants, v_s.skill, v_s.difficulty, v_s.price_minor, v_s.currency,
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
$function$;

grant execute on function public.generate_series_occurrences(uuid, date) to authenticated;
