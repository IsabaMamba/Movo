-- =====================================================================
-- 17_pico_blanco_venue_test.sql — the point 0018 writes lands in the
-- district it is meant to.
--
-- The live row does not exist in CI, so 0018's own assert has nothing to
-- check here. This checks the same claim on a fresh venue at the same
-- point: it resolves to 10202 San Antonio de Escazú, and exactly one
-- district covers it, so it is not sitting on a border the way the summit
-- does.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

do $$
declare
  v_code  text;
  v_cover integer;
begin
  insert into public.locations (name, district, geog, is_public_venue)
  values ('Pico Blanco (test)', 'Escazu',
          extensions.st_setsrid(extensions.st_makepoint(-84.1277761, 9.8980759), 4326)::extensions.geography,
          true)
  returning district_code into v_code;

  if v_code is distinct from '10202' then
    raise exception 'the Pico Blanco trailhead resolved to %, not 10202 San Antonio', v_code;
  end if;

  select count(*) into v_cover
    from public.zones z
   where z.kind = 'distrito'
     and extensions.st_covers(
           z.boundary,
           extensions.st_setsrid(extensions.st_makepoint(-84.1277761, 9.8980759), 4326)::extensions.geography);
  if v_cover <> 1 then
    raise exception 'the Pico Blanco trailhead is covered by % districts', v_cover;
  end if;
end $$;

-- The old point is the bug: it is in Colón, Mora.
do $$
begin
  if public.resolve_zone(
       extensions.st_setsrid(extensions.st_makepoint(-84.236283, 9.91375), 4326)::extensions.geography
     ) is distinct from '10701' then
    raise exception 'the old Pico Blanco point no longer resolves to 10701; recheck 0018''s premise';
  end if;
end $$;

rollback;
