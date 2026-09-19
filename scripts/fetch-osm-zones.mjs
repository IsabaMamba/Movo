#!/usr/bin/env node
/**
 * Fetches Costa Rica's district boundaries from OpenStreetMap and writes them
 * in the shape `scripts/load-zones.mjs` reads.
 *
 *   node scripts/fetch-osm-zones.mjs <out.geojson> [--cache <dir>]
 *
 * WHY OPENSTREETMAP AND NOT THE IGN
 *
 * The IGN layer (`IGN_5_CO:limitedistrital_5k` on the SNIT WFS) is the
 * authoritative one, but the SNIT conditions of use do not authorise
 * commercial use of the information, direct or derived. OpenStreetMap is
 * published under the ODbL, which does, with attribution — so the data this
 * writes, and anything generated from it, is ODbL and must say so. See
 * `docs/status.md` for the open question about where OSM's lines came from.
 *
 * HOW CLOSE IT IS, measured on 19 September 2026 against the IGN 2026-04-10
 * edition: 494 of 494 codes after the corrections below; country area within
 * 0.04 %; all 84 cantones within 1 %. Twelve districts differ by more than
 * 5 %, three by more than 10 % — borders moved between neighbours inside one
 * cantón (the worst is ~94 km² that OSM gives to Pijije and the IGN to
 * Bagaces). A venue in such a strip resolves to the neighbouring distrito of
 * the same cantón.
 *
 * WHERE THE CODE COMES FROM
 *
 * OSM carries no IGN code. It carries `postal_code`, which Correos de Costa
 * Rica builds the same way — provincia, cantón, distrito — and which matches
 * the IGN code for 492 of 494 districts. The rest are CORRECTIONS below,
 * pinned by relation id and checked by name, so an edit upstream stops this
 * script instead of silently changing a zone.
 *
 * Cantones and provincias carry no code at all. Each is named by where its
 * districts fall: every district of a 3-digit prefix is located inside the
 * OSM cantón polygons, and the vote must be unanimous or the script stops.
 *
 * `--cache <dir>` stores each network response and reuses it on the next run,
 * so a regeneration does not re-download and a result can be reproduced.
 * Overpass is often overloaded; a 504 is worth one retry later, not a loop.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { URLSearchParams } from 'node:url';

// Global since Node 18, but not in node: modules, so named here for the linter.
const { fetch } = globalThis;

const args = process.argv.slice(2);
const out = args[0];
const cacheAt = args.indexOf('--cache');
const cache = cacheAt >= 0 ? args[cacheAt + 1] : null;

if (!out || out.startsWith('--')) {
  console.error('usage: node scripts/fetch-osm-zones.mjs <out.geojson> [--cache <dir>]');
  process.exit(1);
}

/** Identifies the tool, not a person: Nominatim asks for this, not for an email. */
const USER_AGENT = 'Movo zone loader (https://github.com/IsabaMamba/Movo)';

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

/** Pinned by OSM relation id. `name` is checked so an upstream edit is noticed. */
const CORRECTIONS = new Map([
  [
    6289989,
    { name: 'Colorado', code: '50704', why: 'tagged 51201; Colorado de Abangares is 50704' },
  ],
  [18957876, { name: 'Cabagra', code: '60310', why: 'no postal_code; the IGN code is 60310' }],
  [
    14365588,
    {
      name: 'Conte Burica',
      code: '60704',
      merge: true,
      why:
        'a Golfito district OSM carved out of Pavón, absent from the IGN 2026-04 edition. ' +
        'Merged back into Pavón (60704) rather than given a code nobody issued; leaving it ' +
        'out instead would open a 158 km² hole in which nothing resolves.',
    },
  ],
]);

async function cached(name, fetcher) {
  const path = cache ? join(cache, name) : null;
  if (path && existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  const value = await fetcher();
  if (path) {
    mkdirSync(cache, { recursive: true });
    writeFileSync(path, JSON.stringify(value));
  }
  return value;
}

async function overpass() {
  const query = `[out:json][timeout:120];
area["ISO3166-1"="CR"][admin_level=2]->.cr;
relation(area.cr)["boundary"="administrative"]["admin_level"~"^(4|6|8)$"];
out tags;`;
  for (const url of OVERPASS) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: query }),
    });
    if (res.ok) return (await res.json()).elements;
    console.error(`overpass ${url}: HTTP ${res.status}`);
  }
  throw new Error('Every Overpass mirror failed. Try again later; nothing was written.');
}

async function nominatim(ids) {
  const all = [];
  for (let i = 0; i < ids.length; i += 50) {
    const params = new URLSearchParams({
      osm_ids: ids
        .slice(i, i + 50)
        .map((id) => `R${id}`)
        .join(','),
      format: 'json',
      polygon_geojson: '1',
      extratags: '1',
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/lookup?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) throw new Error(`nominatim: HTTP ${res.status}`);
    all.push(...(await res.json()));
    // The usage policy allows one request a second. Stay under it.
    await sleep(1500);
  }
  return all;
}

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inGeometry(x, y, geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(
    ([outer, ...holes]) => inRing(x, y, outer) && !holes.some((hole) => inRing(x, y, hole)),
  );
}

const isArea = (g) => g && (g.type === 'Polygon' || g.type === 'MultiPolygon');

// ------------------------------------------------------------------ fetch

const elements = await cached('overpass.json', overpass);
const level = (n) => elements.filter((e) => e.tags?.admin_level === n);
const ids = [...level('8'), ...level('6'), ...level('4')].map((e) => e.id);
const places = await cached('nominatim.json', () => nominatim(ids));
const byId = new Map(places.map((p) => [Number(p.osm_id), p]));

// ------------------------------------------------------------- districts

const districts = level('8').map((e) => {
  const fix = CORRECTIONS.get(e.id);
  if (fix && fix.name !== e.tags.name) {
    throw new Error(
      `Relation ${e.id} was "${fix.name}" and is now "${e.tags.name}". Review the correction.`,
    );
  }
  const code = fix?.code ?? e.tags.postal_code ?? e.tags['addr:postcode'];
  if (!/^\d{5}$/.test(code ?? '')) {
    throw new Error(`Relation ${e.id} (${e.tags.name}) has no usable code: "${code}".`);
  }
  const place = byId.get(e.id);
  if (!isArea(place?.geojson)) throw new Error(`Relation ${e.id} came back without a polygon.`);
  return {
    id: e.id,
    code,
    name: e.tags.name,
    merge: Boolean(fix?.merge),
    point: [Number(place.lon), Number(place.lat)],
    geometry: place.geojson,
  };
});

// A merged part takes the name of the district it rejoins.
const primary = new Map(districts.filter((d) => !d.merge).map((d) => [d.code, d]));
for (const d of districts.filter((x) => x.merge)) {
  const target = primary.get(d.code);
  if (!target) throw new Error(`${d.name} merges into ${d.code}, which does not exist.`);
  d.mergedFrom = d.name;
  d.name = target.name;
}

// ------------------------------------------------ cantones and provincias

function nameParents(levelTag, prefixLength) {
  const polygons = level(levelTag)
    .map((e) => byId.get(e.id))
    .filter((p) => isArea(p?.geojson));
  const votes = new Map();
  for (const d of districts) {
    const hits = polygons.filter((p) => inGeometry(d.point[0], d.point[1], p.geojson));
    const prefix = d.code.slice(0, prefixLength);
    const tally = votes.get(prefix) ?? new Map();
    const key = hits.length === 1 ? hits[0].name : `(${hits.length} matches)`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
    votes.set(prefix, tally);
  }
  const names = new Map();
  for (const [prefix, tally] of votes) {
    if (tally.size !== 1) {
      throw new Error(
        `Prefix ${prefix} is not unanimous: ${JSON.stringify(Object.fromEntries(tally))}`,
      );
    }
    const [name] = tally.keys();
    if (name.startsWith('(')) throw new Error(`Prefix ${prefix} fell in ${name}.`);
    names.set(prefix, name);
  }
  if (new Set(names.values()).size !== names.size) {
    throw new Error(`Two ${levelTag === '6' ? 'cantón' : 'provincia'} prefixes share one name.`);
  }
  return names;
}

const cantones = nameParents('6', 3);
const provincias = nameParents('4', 1);

// ------------------------------------------------------------------ write

const collection = {
  type: 'FeatureCollection',
  name: 'distritos_cr_osm',
  source: 'OpenStreetMap',
  licence: 'ODbL 1.0 — https://opendatacommons.org/licenses/odbl/1-0/',
  attribution: '© OpenStreetMap contributors',
  fetched_at: new Date().toISOString().slice(0, 10),
  corrections: [...CORRECTIONS].map(([id, c]) => ({ relation: id, ...c })),
  features: districts.map((d) => ({
    type: 'Feature',
    properties: {
      code: d.code,
      name: d.name,
      canton: cantones.get(d.code.slice(0, 3)),
      provincia: provincias.get(d.code.slice(0, 1)),
      osm_relation: d.id,
      ...(d.mergedFrom ? { merged_from: d.mergedFrom } : {}),
    },
    geometry: d.geometry,
  })),
};

writeFileSync(out, JSON.stringify(collection));
const codes = new Set(districts.map((d) => d.code));
console.log(
  `wrote ${districts.length} features: ${codes.size} distritos, ${cantones.size} cantones, ` +
    `${provincias.size} provincias → ${out}`,
);
