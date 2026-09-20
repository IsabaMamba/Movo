-- =====================================================================
-- 16_zone_outlines_test.sql — the map a client is allowed to draw.
--
-- Three things have to hold. It must return the zones that meet the box and
-- no others, or the band draws the wrong country. It must return far less
-- geometry than it holds, because the reason this function exists instead of
-- a column grant is size. And it must stay shut to `anon`, like every other
-- zone read.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

-- ------------------------------------------------- the box decides
-- A small box over the centre of San José. Mata Redonda is in it; a box in
-- the Pacific holds nothing at all.
do $$
declare
  v_here integer;
  v_sea  integer;
begin
  select count(*) into v_here
    from public.zone_outlines('distrito', -84.13, 9.91, -84.06, 9.96);
  if v_here = 0 then
    raise exception 'no district outline over the centre of San José';
  end if;
  if not exists (
    select 1 from public.zone_outlines('distrito', -84.13, 9.91, -84.06, 9.96)
     where code = '10108'
  ) then
    raise exception 'Mata Redonda is missing from a box that covers it';
  end if;

  select count(*) into v_sea
    from public.zone_outlines('distrito', -88.0, 7.0, -87.5, 7.5);
  if v_sea <> 0 then
    raise exception '% districts came back for a box in the open Pacific', v_sea;
  end if;
end $$;

-- A box given corners in the wrong order is a caller's slip, not a reason to
-- return an empty map.
do $$
begin
  if not exists (
    select 1 from public.zone_outlines('distrito', -84.06, 9.96, -84.13, 9.91)
     where code = '10108'
  ) then
    raise exception 'a box passed east-first returned nothing';
  end if;
end $$;

-- ------------------------------------------------------ it is smaller
-- The whole point: a band 132 pixels tall must not be sent 1:5000 geometry.
do $$
declare
  v_full   integer;
  v_coarse integer;
  v_fine   integer;
begin
  select length(extensions.st_asgeojson(boundary::extensions.geometry))
    into v_full
    from public.zones where code = '10108';

  select length(outline::text) into v_fine
    from public.zone_outlines('distrito', -84.13, 9.91, -84.06, 9.96, 50)
   where code = '10108';

  select length(outline::text) into v_coarse
    from public.zone_outlines('distrito', -84.13, 9.91, -84.06, 9.96, 400)
   where code = '10108';

  if v_fine >= v_full then
    raise exception 'simplified outline (%) is not smaller than the stored one (%)', v_fine, v_full;
  end if;
  if v_coarse >= v_fine then
    raise exception 'a coarser tolerance produced more geometry, % vs %', v_coarse, v_fine;
  end if;
end $$;

-- ------------------------------------------------- still a polygon
-- Simplification that drops a ring below four points leaves something that
-- is not an area any more, and the client would draw nothing with no error.
do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from public.zone_outlines('canton', -85.0, 8.0, -82.5, 11.2, 400)
   where outline ->> 'type' not in ('Polygon', 'MultiPolygon');
  if v_bad <> 0 then
    raise exception '% outlines came back as something other than an area', v_bad;
  end if;
end $$;

-- ------------------------------------------------------------ grants
do $$
begin
  set local role anon;
  begin
    perform public.zone_outlines('distrito', -84.13, 9.91, -84.06, 9.96);
    raise exception 'anon was able to read the zone outlines';
  exception
    when insufficient_privilege then null; -- expected
  end;
  reset role;
end $$;

rollback;
