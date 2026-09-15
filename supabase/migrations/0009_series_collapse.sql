-- =====================================================================
-- 0009_series_collapse.sql — a recurring session is one card, not nine.
--
-- The first real series (a weekly 5K, created 15 September) filled Descubrir
-- with nine identical cards, one per Tuesday for the next 60 days. It pushed
-- every other session down the list, and it spent nine of the fifty rows
-- nearby_activities() returns on a single club.
--
-- createSeries() already says a run club is one object that meets every
-- Tuesday, not forty unrelated rows. Discovery now agrees:
--
--   * Occurrences of the same series collapse to the next one that still
--     matches every filter — radius, category, date window, and status. If
--     this Tuesday is full or cancelled, next Tuesday is the card.
--   * `series_upcoming` says how many matching dates are left, so the card
--     can say "9 fechas" instead of hiding that the others exist.
--   * The collapse happens before LIMIT/OFFSET, so a busy series can no
--     longer crowd other sessions out of the page.
--
-- Adding columns changes the function's return type, which CREATE OR
-- REPLACE cannot do, so it is dropped and recreated. Still SECURITY INVOKER,
-- as 0002 decided: RLS on activities applies to the caller.
-- =====================================================================

drop function if exists public.nearby_activities(
  double precision, double precision, integer, text[], timestamptz, timestamptz, integer, integer
);

create function public.nearby_activities(
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
  id               uuid,
  title            text,
  category_id      text,
  starts_at        timestamptz,
  ends_at          timestamptz,
  location_name    text,
  district         text,
  lat              double precision,
  lng              double precision,
  distance_m       double precision,
  joined_count     integer,
  max_participants integer,
  skill            skill_level,
  difficulty       smallint,
  price_minor      integer,
  currency         public.currency_code,
  cover_url        text,
  organizer_id     uuid,
  status           activity_status,
  -- New. Null for a one-off session.
  series_id        uuid,
  -- New. Matching dates in this series, including the one returned. 1 for a
  -- one-off session.
  series_upcoming  integer
)
language sql
stable
as $$
  with origin as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as g
  ),
  matched as (
    select a.id, a.title, a.category_id, a.starts_at, a.ends_at,
           l.name     as location_name,
           l.district as district,
           extensions.st_y(l.geog::extensions.geometry) as lat,
           extensions.st_x(l.geog::extensions.geometry) as lng,
           extensions.st_distance(l.geog, o.g)          as distance_m,
           a.joined_count, a.max_participants, a.skill, a.difficulty,
           a.price_minor, a.currency, a.cover_url, a.organizer_id, a.status,
           a.series_id,
           row_number() over w_series                     as series_rank,
           count(*)     over (partition by coalesce(a.series_id, a.id)) as series_upcoming
      from public.activities a
      join public.locations  l on l.id = a.location_id
     cross join origin o
     where a.status in ('published', 'full')
       and a.starts_at >= p_from
       and (p_to is null or a.starts_at <= p_to)
       and (p_categories is null or a.category_id = any (p_categories))
       and extensions.st_dwithin(l.geog, o.g, p_radius_m)
       and not public.is_blocked(auth.uid(), a.organizer_id)
    window w_series as (partition by coalesce(a.series_id, a.id) order by a.starts_at, a.id)
  )
  select m.id, m.title, m.category_id, m.starts_at, m.ends_at,
         m.location_name, m.district, m.lat, m.lng, m.distance_m,
         m.joined_count, m.max_participants, m.skill, m.difficulty,
         m.price_minor, m.currency, m.cover_url, m.organizer_id, m.status,
         m.series_id, m.series_upcoming::integer
    from matched m
   where m.series_rank = 1
   order by m.starts_at, m.distance_m
   limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

grant execute on function public.nearby_activities(
  double precision, double precision, integer, text[], timestamptz, timestamptz, integer, integer
) to authenticated, anon;
