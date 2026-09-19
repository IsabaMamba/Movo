#!/usr/bin/env node
/**
 * Writes the administrative division as a seed migration for `public.zones`.
 *
 * Reads a GeoJSON FeatureCollection of DISTRICTS — the finest level — and
 * derives cantones and provincias from it by dissolving on the code prefix.
 * Only the district boundaries are needed, because a cantón is exactly its
 * districts and a provincia is exactly its cantones. Loading three files
 * would create three chances for them to disagree.
 *
 *   node scripts/load-zones.mjs <districts.geojson> <migration.sql>
 *
 * It writes SQL rather than connecting, on purpose. A migration is reviewed
 * in a pull request, applied by `supabase db push` without anybody handing
 * over the database password, and replayed by CI on every run — so the
 * boundaries the suite tests are the boundaries production has. The cost is
 * a large file in the repository, and that file is ODbL: see `NOTICE.md`.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE FILE COMES FROM — read this before running it.
 *
 * `scripts/fetch-osm-zones.mjs` writes it from OpenStreetMap, and its header
 * explains why OSM and not the IGN, how close the two are, and the three
 * corrections it applies. The IGN publishes the authoritative division
 * through SNIT — 7 provincias, 84 cantones and 494 distritos in its 2026
 * table, keyed by the 5-digit code this loader expects — but its conditions
 * of use do not authorise commercial use.
 *
 * The counts below are checked, not printed and hoped for. A file short of
 * them is zones that can never light up and venues that resolve to null, and
 * that is invisible on a design board. The first draft of this map was drawn
 * from a mirror carrying 83 cantones and 472 districts.
 *
 * Each feature needs:
 *   properties.code      — the 5-digit district code, as a string. A number
 *                          loses a leading zero, and no padding can tell
 *                          which digit went.
 *   properties.name      — the district's name. NOT unique: several "San
 *                          Rafael", "San Isidro" and "San Antonio" exist; that
 *                          is normal here and across Latin America. The name
 *                          is a label, never a key.
 *   properties.canton    — the name of its cantón,
 *   properties.provincia — and of its provincia. Consistent per prefix.
 *   geometry             — Polygon or MultiPolygon, WGS84.
 *
 * Two features may share a code only when one carries
 * `properties.merged_from`: a part rejoined to the district that contains it
 * in the official division. They are unioned into one zone.
 * ---------------------------------------------------------------------------
 */

import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const EXPECTED = { distritos: 494, cantones: 84, provincias: 7 };

/**
 * Six decimals is about 11 cm. Shared borders stay shared: two neighbouring
 * districts in OSM reference the same nodes, the same coordinate rounds the
 * same way on both sides, and no sliver opens between them. Simplifying each
 * polygon on its own would not have that property.
 */
const DECIMALS = 6;

const [, , input, output] = process.argv;

if (!input || !output) {
  console.error('usage: node scripts/load-zones.mjs <districts.geojson> <migration.sql>');
  process.exit(1);
}

const collection = JSON.parse(readFileSync(input, 'utf8'));
const features = collection.features ?? [];

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

/** Codes arrive as strings so leading zeros survive; refuse them if they did not. */
const districts = features.map((f) => {
  const code = String(f.properties?.code ?? '');
  if (!/^\d{5}$/.test(code)) {
    fail(
      `A feature has code "${code}". District codes are 5 digits with leading ` +
        `zeros kept as text. If this file stored them as numbers, re-export it — ` +
        `"01101" became 1101 and no amount of padding here can tell which digit was lost.`,
    );
  }
  const name = String(f.properties?.name ?? '').trim();
  const canton = String(f.properties?.canton ?? '').trim();
  const provincia = String(f.properties?.provincia ?? '').trim();
  if (!name || !canton || !provincia)
    fail(`District ${code} is missing a name, cantón or provincia.`);
  const type = f.geometry?.type;
  if (type !== 'Polygon' && type !== 'MultiPolygon') fail(`District ${code} is a ${type}.`);
  return {
    code,
    name,
    canton,
    provincia,
    merged: Boolean(f.properties?.merged_from),
    geometry: f.geometry,
  };
});

// ------------------------------------------------------------- consistency

// Grouped by hand: Map.groupBy needs Node 21, and CI runs 20.
const byCode = new Map();
for (const d of districts) byCode.set(d.code, [...(byCode.get(d.code) ?? []), d]);
for (const [code, parts] of byCode) {
  const primaries = parts.filter((p) => !p.merged);
  if (primaries.length !== 1) {
    fail(`Code ${code} has ${primaries.length} primary features; merged parts must say so.`);
  }
  if (parts.some((p) => p.name !== primaries[0].name))
    fail(`Code ${code} has parts with different names.`);
}

function consistent(length, key) {
  const names = new Map();
  for (const d of districts) {
    const prefix = d.code.slice(0, length);
    if (names.has(prefix) && names.get(prefix) !== d[key]) {
      fail(`Prefix ${prefix} is "${names.get(prefix)}" and "${d[key]}".`);
    }
    names.set(prefix, d[key]);
  }
  return names;
}

const cantones = consistent(3, 'canton');
const provincias = consistent(1, 'provincia');

const counts = { distritos: byCode.size, cantones: cantones.size, provincias: provincias.size };
console.log(
  `read ${features.length} features: ${counts.distritos} distritos, ` +
    `${counts.cantones} cantones, ${counts.provincias} provincias`,
);
for (const [level, n] of Object.entries(EXPECTED)) {
  if (counts[level] !== n) {
    fail(`Expected ${n} ${level}, got ${counts[level]}. A shortfall is zones that never light up.`);
  }
}

// ------------------------------------------------------------------- write

const round = (n) => Number(n.toFixed(DECIMALS));

/** Round every vertex, then drop the consecutive duplicates rounding creates. */
function tidyRing(ring) {
  const out = [];
  for (const [x, y] of ring) {
    const p = [round(x), round(y)];
    const last = out.at(-1);
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out.length >= 4 ? out : null;
}

function tidy(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const kept = polygons
    .map(([outer, ...holes]) => {
      const shell = tidyRing(outer);
      return shell ? [shell, ...holes.map(tidyRing).filter(Boolean)] : null;
    })
    .filter(Boolean);
  return { type: 'MultiPolygon', coordinates: kept };
}

const quote = (s) => `'${String(s).replaceAll("'", "''")}'`;
const source = `osm-${collection.fetched_at ?? 'unknown'}`;
const x = 'extensions';

const rows = districts.map(
  (d) =>
    `  (${quote(d.code)}, ${quote(d.name)}, ${quote(d.canton)}, ${quote(d.provincia)}, ` +
    `${quote(JSON.stringify(tidy(d.geometry)))})`,
);

const corrections = (collection.corrections ?? [])
  .map((c) => `--   relation ${c.relation} "${c.name}" → ${c.code}: ${c.why}`)
  .join('\n');

/** Dissolve on a prefix, fix what the union produced, and keep only the polygons. */
const clean = (expr) => `${x}.st_multi(${x}.st_collectionextract(${x}.st_makevalid(${expr}), 3))`;

function upsert(kind, length, parentLength, nameColumn) {
  const parent = parentLength ? `left(code, ${parentLength})` : 'null';
  return `with g as (
  select left(code, ${length}) as code,
         min(${nameColumn}) as name,
         ${clean(`${x}.st_union(geom)`)} as geom
    from zone_seed
   group by 1
)
insert into public.zones (code, kind, name, parent_code, centroid, area_km2, boundary, source)
select code, '${kind}', name, ${parent},
       ${x}.st_pointonsurface(geom)::${x}.geography,
       round((${x}.st_area(geom::${x}.geography) / 1e6)::numeric, 3),
       geom::${x}.geography,
       ${quote(source)}
  from g
on conflict (code) do update
   set kind = excluded.kind, name = excluded.name, parent_code = excluded.parent_code,
       centroid = excluded.centroid, area_km2 = excluded.area_km2,
       boundary = excluded.boundary, source = excluded.source, updated_at = now();`;
}

const sql = `-- =====================================================================
-- GENERATED by scripts/load-zones.mjs from scripts/fetch-osm-zones.mjs.
-- Do not edit by hand: regenerate, and review the diff.
--
-- Costa Rica's administrative division — ${counts.provincias} provincias,
-- ${counts.cantones} cantones, ${counts.distritos} distritos — seeded into public.zones.
--
-- DATA LICENCE. The boundaries in this file are from OpenStreetMap,
-- © OpenStreetMap contributors, and are available under the Open Database
-- License 1.0: https://opendatacommons.org/licenses/odbl/1-0/
-- This file is a Derivative Database and is licensed under the ODbL, not
-- under the licence in LICENSE. Anything that DISPLAYS these zones — the
-- heat map — must credit "© colaboradores de OpenStreetMap". See NOTICE.md.
--
-- Fetched ${collection.fetched_at}. Corrections applied, pinned by relation:
${corrections || '--   none'}
--
-- Vertices are rounded to ${DECIMALS} decimals (~11 cm); shared borders
-- stay shared. Each zone's centroid is ST_PointOnSurface, not ST_Centroid:
-- a centroid can fall outside a horseshoe-shaped district, and then the
-- blob blooms over the neighbour. Area comes from the geography, in km².
-- =====================================================================

-- Not "on commit drop": whether a migration runs inside a transaction is the
-- runner's business, and a table dropped between statements breaks either way.
create temporary table zone_seed (
  code      text not null,
  name      text not null,
  canton    text not null,
  provincia text not null,
  geom      ${x}.geometry not null
);

insert into zone_seed (code, name, canton, provincia, geom)
select code, name, canton, provincia,
       ${clean(`${x}.st_setsrid(${x}.st_geomfromgeojson(geojson), 4326)`)}
  from (values
${rows.join(',\n')}
) as v (code, name, canton, provincia, geojson);

-- Parents first: zones.parent_code references zones.code.
${upsert('provincia', 1, 0, 'provincia')}

${upsert('canton', 3, 1, 'canton')}

-- A distrito is its own row, except where a part rejoins it (see above).
${upsert('distrito', 5, 3, 'name')}

-- Venues created before the grid existed resolved against an empty table.
-- 0015 made the trigger place any row that has no code yet.
update public.locations set geog = geog where district_code is null;

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
   where source = ${quote(source)};
  if (v_p, v_c, v_d) <> (${counts.provincias}, ${counts.cantones}, ${counts.distritos}) then
    raise exception 'zone seed wrote % / % / %, expected ${counts.provincias} / ${counts.cantones} / ${counts.distritos}', v_p, v_c, v_d;
  end if;
end $$;

drop table zone_seed;
`;

writeFileSync(output, sql);
console.log(`wrote ${(sql.length / 1e6).toFixed(1)} MB → ${output}`);
