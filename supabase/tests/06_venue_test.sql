-- =====================================================================
-- 06_venue_test.sql — adding a public venue from the app.
--
-- `locations.geog` is `geography(Point, 4326)` and the client has no PostGIS
-- of its own, so the app sends the point as EWKT text and lets the type's
-- input function parse it. That cast is the whole risk: if it stops working,
-- nothing fails loudly — PostgREST returns an error the form shows as "no se
-- pudo guardar el lugar", and Movo is stuck at whatever venues already exist.
--
-- The second half is the reason the coordinate matters at all. A venue is
-- only useful if `nearby_activities()` can find a session held there, and
-- that function filters on distance — so a venue saved with its pair
-- reversed does not error, it just never appears for anyone.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('88888888-8888-8888-8888-888888888888', 'vec@test.cr', '{"display_name":"Vecina"}'),
  ('99999999-9999-9999-9999-999999999999', 'otr@test.cr', '{"display_name":"Otro"}');

set local role authenticated;
select set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', true);

-- Parque de La Paz, as the app sends it: longitude first, inside the EWKT.
insert into public.locations (id, name, district, geog, is_public_venue, created_by)
values ('11111111-aaaa-0000-0000-000000000001',
        'Parque de La Paz', 'San Sebastián',
        'SRID=4326;POINT(-84.0796 9.9081)',
        true,
        '88888888-8888-8888-8888-888888888888');

do $$
declare
  lat double precision;
  lng double precision;
begin
  select extensions.st_y(geog::extensions.geometry),
         extensions.st_x(geog::extensions.geometry)
    into lat, lng
    from public.locations
   where id = '11111111-aaaa-0000-0000-000000000001';

  -- Reading the pair back is the only way to catch a silent swap: EWKT takes
  -- longitude first and every map app on the phone prints latitude first.
  if lat is null or abs(lat - 9.9081) > 0.0001 then
    raise exception 'FAIL: latitude came back as %, expected 9.9081', lat;
  end if;
  if lng is null or abs(lng - (-84.0796)) > 0.0001 then
    raise exception 'FAIL: longitude came back as %, expected -84.0796', lng;
  end if;
end $$;

-- A private address is refused by the insert policy, not by the form alone.
do $$ begin
  begin
    insert into public.locations (name, geog, is_public_venue, created_by)
    values ('Casa de Ale', 'SRID=4326;POINT(-84.08 9.93)', false,
            '88888888-8888-8888-8888-888888888888');
    raise exception 'FAIL: a private venue was accepted';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

-- And so is a venue credited to somebody else.
do $$ begin
  begin
    insert into public.locations (name, geog, is_public_venue, created_by)
    values ('Cancha ajena', 'SRID=4326;POINT(-84.08 9.93)', true,
            '99999999-9999-9999-9999-999999999999');
    raise exception 'FAIL: a venue was inserted under another user';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

-- ------------------------------------- the venue has to be usable, not just saved

insert into public.activities
  (id, organizer_id, category_id, location_id, title, starts_at, ends_at, visibility, status)
values
  ('22222222-aaaa-0000-0000-000000000001',
   '88888888-8888-8888-8888-888888888888', 'football',
   '11111111-aaaa-0000-0000-000000000001',
   'Mejenga en La Paz',
   now() + interval '2 days', now() + interval '2 days 1 hour',
   'public', 'published');

do $$
declare
  found_count integer;
begin
  -- Standing 600 m away, which is well inside the smallest filter the app
  -- offers. A venue that cannot be found from next door is not a venue.
  select count(*) into found_count
    from public.nearby_activities(p_lat := 9.9135, p_lng := -84.0796, p_radius_m := 5000)
   where id = '22222222-aaaa-0000-0000-000000000001';

  if found_count <> 1 then
    raise exception 'FAIL: a session at the new venue is not discoverable nearby (got %)', found_count;
  end if;
end $$;

reset role;

rollback;
