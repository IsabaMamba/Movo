-- =====================================================================
-- 0018_pico_blanco_venue.sql — move the Pico Blanco venue to where the
-- hike starts.
--
-- The venue was created by hand on 14 Sep at (9.91375, -84.236283). That
-- point is in Colón, Mora — 10 km west of the Cerros de Escazú — and its
-- latitude is exactly Parque de la paz's, which is how a typed coordinate
-- goes wrong. 0016 placed it in 10701 Colón, and the heat map has been
-- lighting Mora for every Pico Blanco session since.
--
-- The new point is the meeting place at the top of Calle del Llano, San
-- Antonio de Escazú, next to the Hotel y Mirador Pico Blanco (OSM node
-- 765960490, © OpenStreetMap contributors, ODbL). A venue is where people
-- meet, and the distance filter and the heat map both read this point.
-- The summit itself (OSM node 4712036448, 9.8729, -84.1488) sits on the
-- Escazú–Santa Ana border and resolves to 10902 Salitral, which is not
-- where anyone gathers.
--
-- Data, not schema: on a database without this row the update touches
-- nothing and the assert has nothing to check. Where the row exists, the
-- trigger from 0015 re-resolves district_code because the point moved, and
-- the assert fails the migration — and with it the push — if that did not
-- land in 10202 San Antonio.
-- =====================================================================

update public.locations
   set geog = extensions.st_setsrid(
                extensions.st_makepoint(-84.1277761, 9.8980759), 4326
              )::extensions.geography
 where id = '2231b4b7-3720-469f-92b5-f91c5160a547';

do $$
declare v_code text;
begin
  select district_code into v_code
    from public.locations
   where id = '2231b4b7-3720-469f-92b5-f91c5160a547';
  if found and v_code is distinct from '10202' then
    raise exception 'Pico Blanco resolved to %, not 10202 San Antonio de Escazú', v_code;
  end if;
end $$;
