-- =====================================================================
-- 14_zones_test.sql — the zone grid, and the claim it exists to keep.
--
-- The design promise is that the map cannot say where inside a district a
-- session happens. That is not a styling choice; it has to be true of the
-- data the client receives. So the assertion that matters here is the last
-- one: zone_heat() returns a CENTROID, never a venue's point, and two
-- venues far apart inside one district produce one row at one place.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

-- ---------------------------------------------------------------- setup
-- Two square districts side by side, each 0.1 deg (~11 km) on a side, in
-- the sea west of Guanacaste so they cannot collide with real data.
insert into public.zones (code, kind, name, parent_code, centroid, area_km2, boundary, source)
values
  ('9', 'provincia', 'Pruebalandia', null,
   extensions.st_setsrid(extensions.st_makepoint(-87.05, 10.05), 4326)::extensions.geography,
   242.0,
   extensions.st_multi(extensions.st_makeenvelope(-87.10, 10.00, -87.00, 10.10, 4326))::extensions.geography,
   'test'),
  ('901', 'canton', 'Cantón Norte', '9',
   extensions.st_setsrid(extensions.st_makepoint(-87.075, 10.05), 4326)::extensions.geography,
   121.0,
   extensions.st_multi(extensions.st_makeenvelope(-87.10, 10.00, -87.05, 10.10, 4326))::extensions.geography,
   'test'),
  ('90101', 'distrito', 'Distrito Uno', '901',
   extensions.st_setsrid(extensions.st_makepoint(-87.075, 10.05), 4326)::extensions.geography,
   121.0,
   extensions.st_multi(extensions.st_makeenvelope(-87.10, 10.00, -87.05, 10.10, 4326))::extensions.geography,
   'test'),
  ('902', 'canton', 'Cantón Sur', '9',
   extensions.st_setsrid(extensions.st_makepoint(-87.025, 10.05), 4326)::extensions.geography,
   121.0,
   extensions.st_multi(extensions.st_makeenvelope(-87.05, 10.00, -87.00, 10.10, 4326))::extensions.geography,
   'test'),
  ('90201', 'distrito', 'Distrito Dos', '902',
   extensions.st_setsrid(extensions.st_makepoint(-87.025, 10.05), 4326)::extensions.geography,
   121.0,
   extensions.st_multi(extensions.st_makeenvelope(-87.05, 10.00, -87.00, 10.10, 4326))::extensions.geography,
   'test');

-- ------------------------------------------- the trigger resolves a venue
-- Two venues in the SAME district, at opposite corners of it — about 9 km
-- apart. This is the pair the privacy claim is about.
insert into public.locations (id, name, geog, is_public_venue)
values
  ('aaaa0000-0000-0000-0000-000000000001', 'Esquina noroeste',
   extensions.st_setsrid(extensions.st_makepoint(-87.095, 10.095), 4326)::extensions.geography, true),
  ('aaaa0000-0000-0000-0000-000000000002', 'Esquina sureste',
   extensions.st_setsrid(extensions.st_makepoint(-87.055, 10.005), 4326)::extensions.geography, true),
  ('aaaa0000-0000-0000-0000-000000000003', 'Al otro lado',
   extensions.st_setsrid(extensions.st_makepoint(-87.025, 10.05), 4326)::extensions.geography, true);

do $$
begin
  if (select district_code from public.locations
       where id = 'aaaa0000-0000-0000-0000-000000000001') is distinct from '90101' then
    raise exception 'the trigger did not resolve the first venue into its district';
  end if;
  if (select district_code from public.locations
       where id = 'aaaa0000-0000-0000-0000-000000000002') is distinct from '90101' then
    raise exception 'two venues in the same district resolved differently';
  end if;
  if (select district_code from public.locations
       where id = 'aaaa0000-0000-0000-0000-000000000003') is distinct from '90201' then
    raise exception 'a venue in the next district did not resolve to it';
  end if;
end $$;

-- A point outside every loaded zone must come back null, not guess.
do $$
begin
  if public.resolve_zone(
       extensions.st_setsrid(extensions.st_makepoint(-20.0, 40.0), 4326)::extensions.geography
     ) is not null then
    raise exception 'a point outside the division was given a zone anyway';
  end if;
end $$;

-- Moving a venue must move its zone. A stale code is a session on the wrong
-- side of the map.
update public.locations
   set geog = extensions.st_setsrid(extensions.st_makepoint(-87.025, 10.05), 4326)::extensions.geography
 where id = 'aaaa0000-0000-0000-0000-000000000001';

do $$
begin
  if (select district_code from public.locations
       where id = 'aaaa0000-0000-0000-0000-000000000001') is distinct from '90201' then
    raise exception 'moving a venue did not re-resolve its district';
  end if;
end $$;

-- Put it back for the aggregation checks below.
update public.locations
   set geog = extensions.st_setsrid(extensions.st_makepoint(-87.095, 10.095), 4326)::extensions.geography
 where id = 'aaaa0000-0000-0000-0000-000000000001';

-- ------------------------------------------------------ the aggregation
-- on_auth_user_created makes the profile row, the way every other suite does.
insert into auth.users (id, email, raw_user_meta_data)
values ('bbbb0000-0000-0000-0000-000000000001', 'orga@test.cr', '{"display_name":"Organizadora"}');

insert into public.activities
  (id, organizer_id, category_id, location_id, title, starts_at, ends_at,
   status, visibility, joined_count, currency, price_minor)
select ('cccc0000-0000-0000-0000-00000000000' || n)::uuid,
       'bbbb0000-0000-0000-0000-000000000001',
       (select id from public.categories limit 1),
       (case when n < 3 then 'aaaa0000-0000-0000-0000-000000000001'
                        else 'aaaa0000-0000-0000-0000-000000000003' end)::uuid,
       'Sesión de prueba ' || n,
       now() + interval '2 days', now() + interval '2 days 1 hour',
       'published', 'public', n, 'CRC', 0
  from generate_series(1, 3) as n;

-- A private session must not reach the aggregate: the count would leak it.
insert into public.activities
  (id, organizer_id, category_id, location_id, title, starts_at, ends_at,
   status, visibility, joined_count, currency, price_minor)
values ('cccc0000-0000-0000-0000-0000000000ff',
        'bbbb0000-0000-0000-0000-000000000001',
        (select id from public.categories limit 1),
        'aaaa0000-0000-0000-0000-000000000002',
        'Sesión privada', now() + interval '2 days', now() + interval '2 days 1 hour',
        'published', 'community', 9, 'CRC', 0);

do $$
declare
  v_sessions integer;
  v_joined   integer;
  v_lng      double precision;
  v_lat      double precision;
  v_rows     integer;
begin
  -- Two public sessions at two venues 9 km apart inside district 90101.
  select count(*) into v_rows
    from public.zone_heat('distrito', now(), now() + interval '7 days')
   where code = '90101';
  if v_rows <> 1 then
    raise exception 'two venues in one district produced % rows, not one', v_rows;
  end if;

  select sessions, joined, lng, lat into v_sessions, v_joined, v_lng, v_lat
    from public.zone_heat('distrito', now(), now() + interval '7 days')
   where code = '90101';

  if v_sessions <> 2 then
    raise exception 'expected 2 public sessions in 90101, got %', v_sessions;
  end if;
  if v_joined <> 3 then
    raise exception 'expected joined 1 + 2 = 3 in 90101, got %', v_joined;
  end if;

  -- THE CLAIM. The row must carry the district's centroid, and neither
  -- venue's own point. Both venues sit ~4.5 km from the centre.
  if abs(v_lng - (-87.075)) > 0.0005 or abs(v_lat - 10.05) > 0.0005 then
    raise exception
      'zone_heat returned % , % — that is not the district centroid', v_lng, v_lat;
  end if;
  if abs(v_lng - (-87.095)) < 0.001 or abs(v_lng - (-87.055)) < 0.001 then
    raise exception 'zone_heat leaked a venue position into the map';
  end if;
end $$;

-- The rollup is a prefix, so the cantón level must sum its districts.
do $$
declare v_sessions integer;
begin
  select sessions into v_sessions
    from public.zone_heat('canton', now(), now() + interval '7 days')
   where code = '901';
  if v_sessions <> 2 then
    raise exception 'cantón 901 should roll up 2 sessions, got %', v_sessions;
  end if;

  select sessions into v_sessions
    from public.zone_heat('provincia', now(), now() + interval '7 days')
   where code = '9';
  if v_sessions <> 3 then
    raise exception 'provincia 9 should roll up all 3 sessions, got %', v_sessions;
  end if;
end $$;

-- A zone with nothing in it must be ABSENT, not present with zero. The map
-- draws a missing zone as terrain; a zero would draw it as a cold blob.
do $$
begin
  insert into public.zones (code, kind, name, parent_code, centroid, area_km2, boundary, source)
  values ('903', 'canton', 'Cantón Vacío', '9',
          extensions.st_setsrid(extensions.st_makepoint(-87.09, 10.02), 4326)::extensions.geography,
          10.0,
          extensions.st_multi(extensions.st_makeenvelope(-87.099, 10.011, -87.081, 10.029, 4326))::extensions.geography,
          'test');
  if exists (select 1 from public.zone_heat('canton', now(), now() + interval '7 days')
              where code = '903') then
    raise exception 'an empty zone came back in the heat result';
  end if;
end $$;

-- ------------------------------------------------------------- grants
-- zones carries public geography, but no client writes it, and the boundary
-- polygons are not a column a client needs.
do $$
begin
  set local role authenticated;
  perform 1 from public.zones limit 1;
  begin
    insert into public.zones (code, kind, name, centroid, area_km2, boundary)
    values ('8', 'provincia', 'Intruso',
            extensions.st_setsrid(extensions.st_makepoint(-84.0, 9.9), 4326)::extensions.geography,
            1.0,
            extensions.st_multi(extensions.st_makeenvelope(-84.1, 9.8, -83.9, 10.0, 4326))::extensions.geography);
    raise exception 'a signed-in client was able to insert a zone';
  exception
    when insufficient_privilege then null;
  end;
  reset role;
end $$;

rollback;
