#!/usr/bin/env node
/**
 * Loads the administrative division into `public.zones`.
 *
 * Reads a GeoJSON FeatureCollection of DISTRICTS — the finest level — and
 * derives cantones and provincias from it by dissolving on the code prefix.
 * Only the district boundaries are needed, because a cantón is exactly its
 * districts and a provincia is exactly its cantones. Loading three files
 * would create three chances for them to disagree.
 *
 * Run with the SERVICE ROLE key. It writes a table no client may write, and
 * that key bypasses RLS entirely — never put it in the app, the repo, CI
 * logs or a screenshot. If it ever leaks, rotate it in Supabase; deleting
 * the commit is not enough.
 *
 *   PGURI='postgres://…' node scripts/load-zones.mjs data/distritos.geojson
 *
 * ---------------------------------------------------------------------------
 * WHERE THE FILE COMES FROM — read this before running it.
 *
 * The IGN (Instituto Geográfico Nacional) publishes the authoritative
 * division through SNIT. Its 2026 table is 7 provincias, 84 cantones and
 * 494 distritos, and its 5-digit code is the key this loader expects.
 *
 * The open mirrors are behind. The file used to DESIGN the map carried 83
 * cantones and 472 districts — one cantón and twenty-two districts short.
 * That gap is invisible on a design board and load-bearing in production:
 * twenty-two zones that can never light up, and every venue inside them
 * resolving to null. Verify the counts this script prints against the IGN
 * table before trusting a load.
 *
 * Each feature needs:
 *   properties.code  — the 5-digit district code, as a string with leading
 *                      zeros preserved. A number loses "01…" and silently
 *                      merges San José with nothing.
 *   properties.name  — the district's name. NOT unique. Several "San
 *                      Rafael", "San Isidro" and "San Antonio" exist; that
 *                      is normal here and across Latin America. The name is
 *                      a label, never a key.
 *   geometry         — Polygon or MultiPolygon, WGS84.
 * ---------------------------------------------------------------------------
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';

const [, , file] = process.argv;
const uri = process.env.PGURI;

if (!file || !uri) {
  console.error('usage: PGURI=… node scripts/load-zones.mjs <districts.geojson>');
  process.exit(1);
}

const collection = JSON.parse(readFileSync(file, 'utf8'));
const features = collection.features ?? [];

/** Codes arrive as strings so leading zeros survive; refuse them if they did not. */
const districts = features.map((f) => {
  const code = String(f.properties?.code ?? '');
  if (!/^\d{5}$/.test(code)) {
    throw new Error(
      `A feature has code "${code}". District codes are 5 digits with leading ` +
        `zeros kept as text. If this file stored them as numbers, re-export it — ` +
        `"01101" became 1101 and no amount of padding here can tell which digit was lost.`,
    );
  }
  return { code, name: String(f.properties?.name ?? '').trim(), geometry: f.geometry };
});

const provincias = new Set(districts.map((d) => d.code.slice(0, 1)));
const cantones = new Set(districts.map((d) => d.code.slice(0, 3)));

console.log(
  `read ${districts.length} distritos, implying ${cantones.size} cantones ` +
    `and ${provincias.size} provincias`,
);
console.log('IGN 2026 says 494 / 84 / 7. A shortfall here is zones that can never light up.');

/*
 * The SQL this produces, per level, left as the shape to implement rather
 * than as a half-working query:
 *
 *   distritos  — insert each feature directly. centroid from
 *                ST_PointOnSurface (not ST_Centroid: a centroid can fall
 *                outside a horseshoe-shaped district, and then the blob
 *                blooms over the neighbour), area from ST_Area(geog)/1e6.
 *
 *   cantones   — ST_Union of the districts sharing a 3-digit prefix, then
 *                the same centroid and area from the dissolved shape.
 *                Summing the districts' areas also works and is cheaper;
 *                the centroid is what needs the union.
 *
 *   provincias — the same, on the 1-digit prefix.
 *
 * Insert parents first: `zones.parent_code` references `zones.code`.
 * Upsert on `code` so a re-run after an IGN update replaces rather than
 * duplicates, and set `source` to the edition so a stale import is visible
 * in the table instead of being guessed at later.
 *
 * After loading, backfill the venues that predate the column:
 *
 *   update public.locations
 *      set geog = geog          -- fires locations_zone, which resolves it
 *    where district_code is null;
 *
 * Then check what stayed null. Those are venues outside the loaded
 * division — offshore, mis-pasted coordinates, or a district the file is
 * missing. All three are worth looking at one by one; none should be
 * defaulted to a nearby zone.
 */

console.error('\nNot implemented past this point — see the comment above.');
console.error('The schema, the resolve trigger and zone_heat() are in 0014_zones.sql');
console.error('and are covered by supabase/tests/14_zones_test.sql.');
process.exit(2);
