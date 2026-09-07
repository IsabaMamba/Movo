-- =====================================================================
-- 0006_seed_venue.sql — one real public venue
--
-- Crear sesión offers a picker over `locations` and refuses anything that is
-- not a public venue. With an empty table the form is unusable, and creating
-- venues from the app needs a map picker that does not exist yet.
--
-- La Sabana is a real public park and these are the coordinates already
-- written into the seeding example in 0004. Nothing else is invented here:
-- real club sessions still have to be seeded deliberately, with attribution,
-- as `source = 'imported'`.
--
-- Idempotent by name — re-running adds nothing.
-- =====================================================================

insert into public.locations (name, district, geog, is_public_venue, is_verified, currency)
select 'Parque Metropolitano La Sabana',
       'Mata Redonda',
       extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
       true,
       true,
       'CRC'
where not exists (
  select 1 from public.locations where name = 'Parque Metropolitano La Sabana'
);
