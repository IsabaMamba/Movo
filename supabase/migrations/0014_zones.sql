-- =====================================================================
-- 0014_zones.sql — the administrative grid the heat map aggregates into.
--
-- The map never plots a session where it happens. It plots a blob born at
-- the CENTROID of the zone the session falls in, with a width taken from
-- that zone's own area. Where inside the district a venue sits is not an
-- input, so it cannot be an output — which is a stronger guarantee than
-- blurring a point, because a blur stays centred on the point it hides.
--
-- Costa Rica's division, per the IGN table for 2026: 7 provincias,
-- 84 cantones, 494 distritos. The 5-digit code (provincia + cantón +
-- distrito) is the key, NOT the name: there are several "San Rafael",
-- "San Isidro" and "San Antonio" in the country, and that is the normal
-- case across Latin America rather than a Costa Rican quirk.
--
-- This migration creates the schema and the functions. It loads no data:
-- see scripts/load-zones.mjs and docs/adr/0006-heat-by-administrative-zone.md.
-- =====================================================================

create type public.zone_kind as enum ('provincia', 'canton', 'distrito');

create table public.zones (
  -- IGN code. 1 digit for a provincia, 3 for a cantón, 5 for a distrito.
  code         text primary key check (code ~ '^[0-9]+$' and length(code) in (1, 3, 5)),
  kind         public.zone_kind not null,
  name         text not null check (length(btrim(name)) between 1 and 120),
  -- Null only for a provincia, which has no parent.
  parent_code  text references public.zones(code),
  -- Where a blob is born. Area-weighted, computed by the loader.
  centroid     extensions.geography(Point, 4326) not null,
  -- How wide a blob gets. The equivalent-circle radius comes from this.
  area_km2     numeric(12, 3) not null check (area_km2 > 0),
  -- Needed to resolve a venue into a zone. GiST-indexed below.
  boundary     extensions.geography(MultiPolygon, 4326) not null,
  -- Which edition of the division this row came from, so a stale import is
  -- visible rather than silent. The count that matters is per kind.
  source       text not null default 'ign-2026',
  updated_at   timestamptz not null default now(),

  constraint zones_parent_shape check (
    (kind = 'provincia' and parent_code is null and length(code) = 1) or
    (kind = 'canton'    and parent_code is not null and length(code) = 3) or
    (kind = 'distrito'  and parent_code is not null and length(code) = 5)
  )
);

create index zones_boundary_gix on public.zones using gist (boundary);
create index zones_kind_idx     on public.zones (kind);
create index zones_parent_idx   on public.zones (parent_code);

comment on table public.zones is
  'Administrative zones from the IGN division. The heat map aggregates into '
  'these and draws each zone at its own centroid, so the position of a '
  'session inside its zone never reaches the picture.';

-- Supabase grants everything on a new table by default (see 0012's note and
-- audit finding D1). Revoke first, then grant only what a client needs.
revoke all on public.zones from anon, authenticated;
grant select (code, kind, name, parent_code, area_km2) on public.zones to authenticated;

alter table public.zones enable row level security;

-- Zones are public geography, not user data. Read is open to signed-in
-- clients; nobody writes from a client — the loader uses the service role.
create policy zones_read on public.zones
  for select to authenticated
  using (true);

-- ------------------------------------------------- resolving a venue

alter table public.locations
  add column district_code text references public.zones(code);

-- 0001 already has locations_district_idx on the free-text `district`
-- column, which stays: it is what a human typed, and this is what the
-- geometry resolved. They are allowed to disagree, and when they do the
-- resolved one wins for the map.
create index locations_district_code_idx on public.locations (district_code);

comment on column public.locations.district_code is
  'Resolved once, when the venue is created or its point moves. Doing it per '
  'query would be a point-in-polygon for every row of every map read.';

create or replace function public.resolve_zone(p_point extensions.geography)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select z.code
    from public.zones z
   where z.kind = 'distrito'
     and extensions.st_covers(z.boundary, p_point)
   limit 1;
$$;

comment on function public.resolve_zone(extensions.geography) is
  'The distrito a point falls in, or null when it falls outside the loaded '
  'division — offshore, or abroad. Callers must handle null: a venue with no '
  'zone is a venue the map cannot place, and that is worth surfacing rather '
  'than hiding behind a default.';

revoke all on function public.resolve_zone(extensions.geography) from public, anon;
grant execute on function public.resolve_zone(extensions.geography) to authenticated;

create or replace function public.locations_set_zone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.geog is distinct from old.geog then
    new.district_code := public.resolve_zone(new.geog);
  end if;
  return new;
end;
$$;

create trigger locations_zone
  before insert or update of geog on public.locations
  for each row execute function public.locations_set_zone();

-- ------------------------------------------------------- the heat read

create or replace function public.zone_heat(
  p_kind  public.zone_kind,
  p_from  timestamptz default now(),
  p_to    timestamptz default now() + interval '7 days'
)
returns table (
  code      text,
  name      text,
  lng       double precision,
  lat       double precision,
  area_km2  numeric,
  sessions  integer,
  joined    integer
)
language sql
stable
security definer
set search_path = ''
as $$
  -- Roll every distrito up to whichever level was asked for. A distrito's
  -- code starts with its cantón's, which starts with its provincia's, so the
  -- rollup is a prefix — no recursive walk, no second table.
  with lvl as (
    select case p_kind
             when 'provincia' then 1
             when 'canton'    then 3
             else 5
           end as len
  ),
  counted as (
    select left(l.district_code, (select len from lvl)) as zcode,
           count(*)::integer                            as sessions,
           coalesce(sum(a.joined_count), 0)::integer    as joined
      from public.activities a
      join public.locations  l on l.id = a.location_id
     where l.district_code is not null
       and a.status in ('published', 'full')
       and a.visibility = 'public'
       and a.starts_at >= p_from
       and a.starts_at <  p_to
     group by 1
  )
  select z.code,
         z.name,
         extensions.st_x(z.centroid::extensions.geometry),
         extensions.st_y(z.centroid::extensions.geometry),
         z.area_km2,
         c.sessions,
         c.joined
    from counted c
    join public.zones z on z.code = c.zcode and z.kind = p_kind;
$$;

comment on function public.zone_heat(public.zone_kind, timestamptz, timestamptz) is
  'Session counts per zone for a window, with each zone''s centroid and area '
  'so the client can size and place its blob. Returns only zones that have '
  'something: a zone missing from the result has no sessions, which the map '
  'draws as terrain rather than as a cold blob. SECURITY DEFINER because the '
  'aggregate is the privacy boundary — a caller must not be able to read the '
  'rows behind it. Private and member-only sessions are excluded on purpose: '
  'they would otherwise leak through the count.';

revoke all on function public.zone_heat(public.zone_kind, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.zone_heat(public.zone_kind, timestamptz, timestamptz)
  to authenticated;
