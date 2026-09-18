-- =====================================================================
-- 0015_zone_heat_blocking.sql — two corrections to 0014, neither of which
-- changes what the heat map is for.
--
-- 1. zone_heat() did not filter is_blocked(). Every other read path does:
--    the activities_read policy, nearby_activities() in 0002 and 0005, the
--    series collapse in 0009. An aggregate is a read path like any other,
--    and SECURITY DEFINER means it does not inherit the policy — the
--    predicate has to be written into the query. A count is a channel: in
--    a district with few sessions it answers "is that person organizing
--    this week" about the person who blocked you, which is the adversary
--    at the top of docs/security.md.
--
-- 2. locations_set_zone() only resolved on INSERT or when the point moved,
--    so a venue that predates the grid could never acquire a zone — the
--    backfill documented in scripts/load-zones.mjs changes no point and so
--    ran into a guard that was false. It now also resolves a row that has
--    no code yet, which makes the trigger converge: any touch of an
--    unplaced venue places it.
--
-- 0014 is not applied to the live project, so this replaces functions that
-- have never run anywhere. It is a separate migration rather than an edit
-- because migrations already merged are not edited — see CONTRIBUTING.
-- =====================================================================

create or replace function public.locations_set_zone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- `district_code is null` is the backfill case: the venue was created
  -- before the boundaries were loaded, resolved against an empty table, and
  -- would otherwise stay unplaced for as long as its point never changes.
  if tg_op = 'INSERT'
     or new.geog is distinct from old.geog
     or new.district_code is null then
    new.district_code := public.resolve_zone(new.geog);
  end if;
  return new;
end;
$$;

comment on function public.locations_set_zone() is
  'Keeps locations.district_code in step with the point. Resolves on insert, '
  'when the point moves, and when the row has no code yet — the last case is '
  'a venue older than the zone table, which no amount of waiting would fix.';

create or replace function public.zone_heat(
  p_kind  public.zone_kind,
  p_from  timestamptz default now(),
  p_to    timestamptz default now() + interval '7 days'
)
returns table (
  code      text,
  name      text,
  lng       double precision,
  lat       double precision,
  area_km2  numeric,
  sessions  integer,
  joined    integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with lvl as (
    select case p_kind
             when 'provincia' then 1
             when 'canton'    then 3
             else 5
           end as len
  ),
  counted as (
    select left(l.district_code, (select len from lvl)) as zcode,
           count(*)::integer                            as sessions,
           coalesce(sum(a.joined_count), 0)::integer    as joined
      from public.activities a
      join public.locations  l on l.id = a.location_id
     where l.district_code is not null
       and a.status in ('published', 'full')
       and a.visibility = 'public'
       and a.starts_at >= p_from
       and a.starts_at <  p_to
       -- Added in 0015. Null auth.uid() — the loader, the SQL editor — is
       -- not blocked by anybody, so is_blocked() is false and nothing is
       -- hidden from an operator who could read the rows anyway.
       and not public.is_blocked(auth.uid(), a.organizer_id)
     group by 1
  )
  select z.code,
         z.name,
         extensions.st_x(z.centroid::extensions.geometry),
         extensions.st_y(z.centroid::extensions.geometry),
         z.area_km2,
         c.sessions,
         c.joined
    from counted c
    join public.zones z on z.code = c.zcode and z.kind = p_kind;
$$;

comment on function public.zone_heat(public.zone_kind, timestamptz, timestamptz) is
  'Session counts per zone for a window, with each zone''s centroid and area '
  'so the client can size and place its blob. Returns only zones that have '
  'something: a zone missing from the result has no sessions, which the map '
  'draws as terrain rather than as a cold blob. SECURITY DEFINER because the '
  'aggregate is the privacy boundary — a caller must not be able to read the '
  'rows behind it. Private and member-only sessions are excluded on purpose, '
  'and since 0015 so are sessions by an organizer the caller has blocked or '
  'been blocked by: a count in a small district is an answer about a person. '
  'What this counts is scheduled public sessions, never attendance — if that '
  'ever changes, docs/security.md requires a minimum per zone first.';

revoke all on function public.zone_heat(public.zone_kind, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.zone_heat(public.zone_kind, timestamptz, timestamptz)
  to authenticated;
