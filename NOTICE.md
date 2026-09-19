# Third-party data

## Administrative boundaries — OpenStreetMap

`supabase/migrations/0016_seed_zones.sql` contains Costa Rica's provincias, cantones and
distritos derived from OpenStreetMap.

© OpenStreetMap contributors. Available under the
[Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

That file is a Derivative Database and is licensed under the ODbL, **not** under `LICENSE`.
Anyone may use it on the ODbL's terms. The rest of this repository is unaffected.

Anything that displays these boundaries — the heat map — must credit
"© colaboradores de OpenStreetMap" where the map is shown.

How the file was produced, and every correction made to the source, is in
`scripts/fetch-osm-zones.mjs` and `scripts/load-zones.mjs`.
