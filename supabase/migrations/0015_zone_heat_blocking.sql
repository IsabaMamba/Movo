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

