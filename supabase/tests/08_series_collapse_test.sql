-- =====================================================================
-- 08_series_collapse_test.sql — a series is one row in discovery.
--
-- The weekly 5K created on 15 September filled Descubrir with nine cards.
-- These checks pin the three things 0009 promises: one row per series, the
-- next date that still matches (not merely the earliest row), and a collapse
-- that happens before LIMIT so a series cannot crowd other sessions out.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-000000000001', 'club8@test.cr', '{"display_name":"Club"}');

insert into public.locations (id, name, geog, is_public_venue, is_verified, created_by) values
  ('d1000000-0000-0000-0000-000000000001', 'Parque de prueba',
   extensions.st_setsrid(extensions.st_makepoint(-84.0600, 9.9600), 4326)::extensions.geography,
   true, true, 'd0000000-0000-0000-0000-000000000001');

insert into public.activity_series
  (id, organizer_id, category_id, location_id, title, weekday, local_start_time, duration_minutes)
values
  ('d2000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'running',
   'd1000000-0000-0000-0000-000000000001', '5K semanal', 2, '18:00', 60);

-- Three dates of the series, and a one-off that falls between the first two.
insert into public.activities
  (id, series_id, organizer_id, category_id, location_id, title, starts_at, ends_at, status, visibility)
values
  ('d3000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000001', 'running', 'd1000000-0000-0000-0000-000000000001',
   '5K semanal', now() + interval '1 day', now() + interval '1 day 1 hour', 'published', 'public'),
  ('d3000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000001', 'running', 'd1000000-0000-0000-0000-000000000001',
   '5K semanal', now() + interval '8 days', now() + interval '8 days 1 hour', 'published', 'public'),
  ('d3000000-0000-0000-0000-000000000003', 'd2000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000001', 'running', 'd1000000-0000-0000-0000-000000000001',
   '5K semanal', now() + interval '15 days', now() + interval '15 days 1 hour', 'published', 'public'),
  ('d3000000-0000-0000-0000-000000000009', null,
   'd0000000-0000-0000-0000-000000000001', 'running', 'd1000000-0000-0000-0000-000000000001',
   'Corrida suelta', now() + interval '3 days', now() + interval '3 days 1 hour', 'published', 'public');

-- ------------------------------------------------ one row per series

do $$
declare
  v_rows     integer;
  v_id       uuid;
  v_upcoming integer;
  v_single   record;
begin
  select count(*) into v_rows
    from public.nearby_activities(p_lat := 9.9600, p_lng := -84.0600, p_radius_m := 2000)
   where series_id = 'd2000000-0000-0000-0000-000000000001';
  if v_rows <> 1 then
    raise exception 'FAIL: a three-date series came back as % rows', v_rows;
  end if;

  select id, series_upcoming into v_id, v_upcoming
    from public.nearby_activities(p_lat := 9.9600, p_lng := -84.0600, p_radius_m := 2000)
   where series_id = 'd2000000-0000-0000-0000-000000000001';
  if v_id <> 'd3000000-0000-0000-0000-000000000001' then
    raise exception 'FAIL: the series card is not its next date (got %)', v_id;
  end if;
  if v_upcoming <> 3 then
    raise exception 'FAIL: series_upcoming should be 3, got %', v_upcoming;
  end if;

  -- A one-off is untouched: its own row, no series, a count of one.
  select series_id, series_upcoming into v_single
    from public.nearby_activities(p_lat := 9.9600, p_lng := -84.0600, p_radius_m := 2000)
   where id = 'd3000000-0000-0000-0000-000000000009';
  if v_single is null or v_single.series_id is not null or v_single.series_upcoming <> 1 then
    raise exception 'FAIL: a one-off session was changed by the collapse';
  end if;
end $$;

-- ------------------------------------------------ collapse happens before LIMIT

do $$
declare
  v_ids uuid[];
begin
  select array_agg(id) into v_ids
    from public.nearby_activities(p_lat := 9.9600, p_lng := -84.0600, p_radius_m := 2000, p_limit := 2);
  if coalesce(array_length(v_ids, 1), 0) <> 2
     or not ('d3000000-0000-0000-0000-000000000009' = any (v_ids)) then
    raise exception 'FAIL: with a limit of 2, the series crowded out the one-off (%)', v_ids;
  end if;
end $$;

-- ------------------------------------------------ the next date that still matches

-- Cancel this week's date: next week should become the card, with one fewer.
update public.activities set status = 'cancelled'
 where id = 'd3000000-0000-0000-0000-000000000001';

do $$
declare
  v_id       uuid;
  v_upcoming integer;
begin
  select id, series_upcoming into v_id, v_upcoming
    from public.nearby_activities(p_lat := 9.9600, p_lng := -84.0600, p_radius_m := 2000)
   where series_id = 'd2000000-0000-0000-0000-000000000001';
  if v_id is distinct from 'd3000000-0000-0000-0000-000000000002' or v_upcoming <> 2 then
    raise exception 'FAIL: after cancelling this week, card is % with % dates', v_id, v_upcoming;
  end if;
end $$;

-- A date window that only holds the last occurrence returns that one.
do $$
declare
  v_id       uuid;
  v_upcoming integer;
begin
  select id, series_upcoming into v_id, v_upcoming
    from public.nearby_activities(
      p_lat := 9.9600, p_lng := -84.0600, p_radius_m := 2000,
      p_from := now() + interval '10 days')
   where series_id = 'd2000000-0000-0000-0000-000000000001';
  if v_id is distinct from 'd3000000-0000-0000-0000-000000000003' or v_upcoming <> 1 then
    raise exception 'FAIL: date window picked % with % dates', v_id, v_upcoming;
  end if;
end $$;

-- Filters still apply before collapsing: a hiking search finds no running series.
do $$ begin
  if exists (
    select 1 from public.nearby_activities(
      p_lat := 9.9600, p_lng := -84.0600, p_radius_m := 2000, p_categories := array['hiking'])
  ) then
    raise exception 'FAIL: the category filter let a running series through';
  end if;
end $$;

rollback;
