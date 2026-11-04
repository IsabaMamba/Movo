# The street map — MapLibre and our own map file

A street map in Movo's style ([`Lugares-v2`](2026-11-02/Lugares-v2-2026-11-02.png), table «El mapa
de Movo»), served from our own Supabase. Nobody outside Movo sees which area people look at, there
is no per-view bill, and the same map later carries GPS routes.

**First use:** picking the point when adding a place (Lugares v2, phones 2–4). Then the session
detail, the public invite page (Enlace) and «Cómo llegar».

## Steps

1. **Tool.** Install the `pmtiles` CLI (go-pmtiles binary: GitHub, protomaps/go-pmtiles → Releases).

2. **Cut Costa Rica out of the Protomaps daily build.** The date is in the file name; use the latest
   listed at docs.protomaps.com/basemaps/downloads.

   ```bash
   pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles costa-rica-YYYYMMDD.pmtiles \
     --bbox=-86.0,8.0,-82.5,11.3
   ```

   - The bbox is `west,south,east,north`. Isla del Coco is left out on purpose.
   - Check the file size. If it is too big, try `--maxzoom=15` (see `pmtiles extract --help`).

3. **Upload it to Supabase Storage.**
   - Public bucket `maps` — it is OpenStreetMap data, nothing about anyone.
   - File `maps/costa-rica-YYYYMMDD.pmtiles`. The date in the name lets us switch versions without
     fighting caches.
   - Check that range requests work; this must return `206 Partial Content`:

     ```bash
     curl -sI -H "Range: bytes=0-511" \
       https://<ref>.supabase.co/storage/v1/object/public/maps/costa-rica-YYYYMMDD.pmtiles
     ```

4. **Fonts and icons, also ours.** Nothing from the Protomaps CDN or GitHub at runtime.
   - **Fonts:** generate Barlow 400 and 600 glyphs with maplibre/font-maker into
     `maps/fonts/{fontstack}/{range}.pbf`.
   - **Icons:** copy the `dark` flavor sprite from protomaps/basemaps-assets into `maps/sprites/`.

5. **One style for web and phone** — `src/features/map/style.ts`.
   - `@protomaps/basemaps`: `layers('movo', flavor, { lang: 'es' })`, with `flavor` starting from
     `namedFlavor('dark')` and recolored to Lugares v2:

     | Layer        | Color             |
     | ------------ | ----------------- |
     | Background   | `#0B0F1F`         |
     | Blocks       | `#141B33`         |
     | Parks        | `#0F2E36`         |
     | Water        | `#10243A`         |
     | Major roads  | `#60D1D4` at 42 % |
     | Minor roads  | `#60D1D4` at 16 % |
     | Street names | `#8892A8`         |
     | Place names  | `#F6E9D7`         |

   - Source `{ type: 'vector', url: 'pmtiles://https://…/maps/costa-rica-YYYYMMDD.pmtiles' }`;
     `glyphs` and `sprite` point at the bucket.
   - The place pin is not in the style: it is a component on top of the map.
   - No heat layer on this map (ADR 0004).

6. **Web.** `maplibre-gl` + `pmtiles`:

   ```ts
   import { Protocol } from 'pmtiles';
   maplibregl.addProtocol('pmtiles', new Protocol().tile);
   ```

7. **Phone.** `@maplibre/maplibre-react-native` with its Expo plugin.
   - Needs a development build (EAS); it does not run in Expo Go.
   - Try the `pmtiles://https://…` URL first: MapLibre Native Android reads PMTiles from 11.7.0.
     Check which MapLibre Native version the React Native package ships, and whether iOS reads it.
   - **If it doesn't work**, serve plain tiles from an Edge Function `tiles` that reads the
     `.pmtiles` with the `pmtiles` library and answers `/{z}/{x}/{y}.mvt`. In the style, replace `url`
     with `tiles: ['https://…/functions/v1/tiles/{z}/{x}/{y}.mvt']`.

8. **`<MovoMap>`** in `src/features/map/`.
   - Props: `center`, `zoom`, `pin`, `previousPoint` (dashed sun ring), `onCenterChange`.
   - Picking a point: the pin stays fixed in the center and the map moves under it. On
     `onRegionDidChange` / `moveend`, read the center.
   - Attribution «© colaboradores de OpenStreetMap» always visible, as in Descubrir.

9. **Saving the point.** `locations_set_zone` keeps resolving the district in the database. Remove
   the typed district field from `AddVenue` and `MyVenuesScreen`.

10. **Searching a place by name.**
    - Phase 1: only `locations` — name with `ilike` or trigrams, verified places first.
    - Later: a geocoder behind an Edge Function, so the provider never sees who searches. Public
      Nominatim does not allow autocomplete.
    - Meanwhile, pasting a Google Maps or Waze link stays as an alternative.

11. **Acceptance.**
    - The network tab shows requests only to `*.supabase.co` — no other map domain.
    - The map opens on Parque de Tibás in under 2 s on a good connection.
    - Moving the pin changes the district on save.
    - Web and phone look like Lugares v2.

12. **Maintenance.** Every 3 months, repeat steps 2 and 3 with a new date and update the URL in
    `style.ts`. When Movo leaves Costa Rica: one file per country or region.

**Privacy.** No new data recipient: Supabase already processes Movo's data, and MapLibre sends no
telemetry. Add MapLibre and Protomaps to the SDK inventory as libraries that send nothing.
