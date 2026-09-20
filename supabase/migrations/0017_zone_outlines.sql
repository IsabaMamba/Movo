-- =====================================================================
-- 0017_zone_outlines.sql — let a client draw the map it is colouring.
--
-- Until now the heat band drew blobs over a decorative grid: no coast, no
-- cantones, no borders. The shapes to draw them with are already here —
-- `zones.boundary`, loaded in 0016 — but 0014 granted the client only the
-- text columns of that table, on purpose: the polygons are large and no
-- screen needed them.
--
-- One does now, so this opens the narrowest door that serves it rather than
-- widening the grant: a function that returns SIMPLIFIED outlines for one
-- viewport. A caller gets what fits on a 132-pixel band, not the 1:5000
-- geometry — about 100 KB for the 200 districts around the GAM at the
-- default tolerance, against 1.4 MB for the full resolution.
--
-- This leaks nothing. Administrative boundaries are public geography, the
-- same lines any paper map prints; what `docs/security.md` protects is where
-- PEOPLE are, and that is still aggregated to a zone anchor by zone_heat().
-- The boundaries are OpenStreetMap's, under the ODbL, so anything that
-- displays them owes the credit — see NOTICE.md.
-- =====================================================================

create or replace function public.zone_outlines(
  p_kind        public.zone_kind,
  p_west        double precision,
  p_south       double precision,
  p_east        double precision,
  p_north       double precision,
  -- Metres of positional error the caller can afford. The default is under
  -- a pixel on the band at every radius it offers.
  p_tolerance_m double precision default 150
)
returns table (
  code    text,
  name    text,
  outline jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select z.code,
         z.name,
         extensions.st_asgeojson(
           extensions.st_simplifypreservetopology(
             z.boundary::extensions.geometry,
             -- Degrees, near enough at this latitude: the tolerance is a
             -- drawing budget, not a measurement.
             greatest(p_tolerance_m, 1) / 111320.0
           )
         )::jsonb
    from public.zones z
   where z.kind = p_kind
     and z.boundary::extensions.geometry && extensions.st_makeenvelope(
           least(p_west, p_east), least(p_south, p_north),
           greatest(p_west, p_east), greatest(p_south, p_north), 4326)
$$;

comment on function public.zone_outlines(
  public.zone_kind, double precision, double precision, double precision,
  double precision, double precision) is
  'Simplified outlines of the zones meeting a bounding box, as GeoJSON, so a '
  'client can draw the map the heat sits on. Simplification is topology '
  'preserving: a shared border stays shared and no gap opens between two '
  'neighbours. Boundaries are public geography — the aggregate in zone_heat() '
  'is what protects people, not the secrecy of a district line. Data from '
  'OpenStreetMap, ODbL: whatever draws this owes the credit.';

revoke all on function public.zone_outlines(
  public.zone_kind, double precision, double precision, double precision,
  double precision, double precision) from public, anon;

grant execute on function public.zone_outlines(
  public.zone_kind, double precision, double precision, double precision,
  double precision, double precision) to authenticated;
