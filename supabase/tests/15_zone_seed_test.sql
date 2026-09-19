-- =====================================================================
-- 15_zone_seed_test.sql — the seeded division is whole, nested, and places
-- the venues that already exist.
--
-- 14_zones_test.sql proves the machinery on two squares in the sea. This
-- file proves the data: the real country, as 0016 loads it. The failure it
-- guards against is quiet — a district missing, a sliver between two
-- neighbours, a merge that did not happen — and every one of them shows up
-- as a venue that resolves to nothing and a map with a dark patch.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

-- ------------------------------------------------------------- counts
do $$
declare
  v_p integer;
  v_c integer;
  v_d integer;
begin
  select count(*) filter (where kind = 'provincia'),
         count(*) filter (where kind = 'canton'),
         count(*) filter (where kind = 'distrito')
    into v_p, v_c, v_d
    from public.zones
   where source like 'osm-%';
  if (v_p, v_c, v_d) <> (7, 84, 494) then
    raise exception 'expected 7 / 84 / 494 zones from the seed, got % / % / %', v_p, v_c, v_d;
  end if;
end $$;

-- ------------------------------------------------------------ nesting
-- A distrito's parent is the cantón its code starts with, whose parent is
-- the provincia. zone_heat() rolls up by prefix, so a mismatch here would
-- count a session in one cantón and draw it in another.
do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from public.zones z
    left join public.zones p on p.code = z.parent_code
   where z.source like 'osm-%'
     and z.kind <> 'provincia'
     and (p.code is null
          or z.parent_code <> left(z.code, case z.kind when 'canton' then 1 else 3 end)
          or p.kind <> case z.kind when 'canton' then 'provincia'::public.zone_kind
                                   else 'canton'::public.zone_kind end);
  if v_bad <> 0 then
    raise exception '% zones do not sit inside the parent their code names', v_bad;
  end if;
end $$;

-- ---------------------------------------------------- the blob's anchor
-- The heat map draws each zone at `centroid`. The loader uses
-- ST_PointOnSurface precisely so that point is inside the zone; a true
-- centroid of a horseshoe-shaped district can land in the neighbour.
do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from public.zones
   where source like 'osm-%'
     and not extensions.st_covers(boundary, centroid);
  if v_bad <> 0 then
    raise exception '% zones are anchored at a point outside themselves', v_bad;
  end if;
end $$;

-- ------------------------------------------------ parents are their parts
-- A provincia is exactly its districts. If the union dropped or doubled
-- anything, the areas stop adding up.
do $$
declare v_bad text;
begin
  select string_agg(p.code || ' ' || p.name, ', ') into v_bad
    from public.zones p
    join (select left(code, 1) as code, sum(area_km2) as parts
            from public.zones
           where kind = 'distrito' and source like 'osm-%'
           group by 1) d on d.code = p.code
   where p.kind = 'provincia'
     and abs(p.area_km2 - d.parts) / d.parts > 0.005;
  if v_bad is not null then
    raise exception 'provincias whose area is not the sum of their districts: %', v_bad;
  end if;
end $$;

-- --------------------------------------------------------- the merge
-- OSM carves Conte Burica (~158 km²) out of Pavón; the IGN 2026-04 edition
-- does not. The fetch script rejoins them under 60704. Without the merge,
-- Pavón is ~196 km² and 158 km² of Golfito resolve to nothing.
do $$
declare v_area numeric;
begin
  select area_km2 into v_area from public.zones where code = '60704';
  if v_area is null or v_area not between 340 and 370 then
    raise exception 'Pavón (60704) is % km²; the IGN has ~355 — Conte Burica was not rejoined', v_area;
  end if;
end $$;

-- ----------------------------------------------- an existing venue lands
-- La Sabana was seeded by 0006, long before any zone existed. The seed's
-- backfill has to place it, in exactly one district.
do $$
declare
  v_code  text;
  v_cover integer;
begin
  select l.district_code,
         (select count(*) from public.zones z
           where z.kind = 'distrito' and extensions.st_covers(z.boundary, l.geog))
    into v_code, v_cover
    from public.locations l
   where l.name = 'Parque Metropolitano La Sabana';
  if v_code is distinct from '10108' then
    raise exception 'La Sabana resolved to %, not 10108 Mata Redonda', v_code;
  end if;
  if v_cover <> 1 then
    raise exception 'La Sabana is covered by % districts; borders overlap there', v_cover;
  end if;
end $$;

-- --------------------------------------------------- the sea is nobody's
do $$
begin
  if public.resolve_zone(
       extensions.st_setsrid(extensions.st_makepoint(-86.5, 9.0), 4326)::extensions.geography
     ) is not null then
    raise exception 'a point in the Pacific resolved to a district';
  end if;
end $$;

rollback;
