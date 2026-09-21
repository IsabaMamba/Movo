# Third-party data

`LICENSE` covers this repository **except** what this file lists. Everything below is licensed
under its own terms, and `LICENSE` says so.

## OpenStreetMap

© OpenStreetMap contributors. Available under the
[Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

| File                                             | What it holds                                                           |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| `supabase/migrations/0016_seed_zones.sql`        | Costa Rica's provincias, cantones and distritos — a Derivative Database |
| `supabase/migrations/0018_pico_blanco_venue.sql` | One venue coordinate, from OSM node 765960490                           |

These files are licensed under the ODbL, **not** under `LICENSE`. Anyone may use them on the
ODbL's terms. The rest of this repository is unaffected: the ODbL covers the data, not the code
that loads, queries or draws it.

Anything that displays these boundaries — the heat map — must credit
"© colaboradores de OpenStreetMap" where the map is shown.

How the boundaries were produced, and every correction made to the source, is in
`scripts/fetch-osm-zones.mjs` and `scripts/load-zones.mjs`.

**Adding OSM data?** Add the file to the table above in the same change.
