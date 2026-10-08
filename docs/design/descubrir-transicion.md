# Descubrir — from the list to the full map

How Descubrir v1 (the list with a map on top) becomes Descubrir v2 (the full map you can
search and tap) when someone touches the map. Written for building it; the design itself is
on the canvas, boards **Descubrir · v1 · 7 oct** and **Descubrir · v2 · 8 oct**.

**Open [`descubrir-transicion.html`](descubrir-transicion.html) first.** It is a playable
prototype of every step below, with a ×5 slow-motion switch and a reduce-motion switch. The
timing tables in its side panel are the same as the ones here.

## The idea in one paragraph

The map is already drawn full screen, **under** the list. In list mode the sheet covers most
of it, so it reads as a 372 px band. Opening the map slides the sheet down until only a
142 px summary is left, and moves the map down so the search origin lands in the middle of
the screen. Nothing is laid out again, no route changes, and the map's scale does not
change. Every animated property is `transform` or `opacity`, so the whole thing runs on
React Native's own `Animated` with `useNativeDriver: true`. **No new dependency.**

## States

| State                 | What is on screen                                                                                                            | Board                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **S0 · Lista**        | Header, map band, sheet with categories and the list, tab bar                                                                | v1, phone 1           |
| **S1 · Mapa abierto** | Same map at the same scale, full screen. Back + search on top, origin + reach below, summary sheet at the bottom. No tab bar | — (between v1 and v2) |
| **S2 · Mapa lejos**   | Reach 50, 100 or País. Cantón heat, zone chips with counts                                                                   | v2, phone 1           |
| **S3 · Zona**         | Map centred on the zone with its outline; zone sheet: counts, why it is hot, the series, venues, the sessions                | v2, phone 3           |
| S4 · Detalle          | Session detail. A normal `router.push('/sesion/[id]')` — **not** part of this transition                                     | v2, phone 4           |

The search screen (v2, phone 2) opens from the search field in S1/S2 and is its own screen.
It is not specified here.

## What moves between states

| From → to | Trigger                                                                     |
| --------- | --------------------------------------------------------------------------- |
| S0 → S1   | Tap anywhere on the map band, or the «Abrir mapa» pill on it                |
| S1 → S0   | Back button, «Ver lista», Android back (`BackHandler`), `Escape` on web     |
| S1 ↔ S2   | The reach control: 15 · 50 · 100 · País                                     |
| S2 → S1   | The «GAM · acerca» chip (sets reach to 15, which brings back distrito heat) |
| S2 → S3   | Tapping a zone chip or a cantón big enough to hit (44 px or more on screen) |
| S3 → S2   | Back button, Android back                                                   |
| S3 → S4   | «Ver detalles» or a session card                                            |

**One behaviour changes from the v1 board.** On v1, phone 2, tapping a zone inside the band
selects it. With the open map, the band in list mode is **one button that opens the map**.
Zones are only selectable once the map is open. This removes mis-taps while scrolling and
gives the band a single, clear accessible action.

## The choreography

Times are in milliseconds from the start of the transition. Anything not listed holds still.

### T1 · Abrir el mapa (S0 → S1) — 320 ms, `Easing.bezier(0.2, 0, 0, 1)`

| Element                                             | Change                                   | ms      |
| --------------------------------------------------- | ---------------------------------------- | ------- |
| Map (the whole map layer, ring and origin included) | `translateY` −146 → 0                    | 0–320   |
| Sheet                                               | `translateY` +282 (top 420 → 702)        | 0–320   |
| Legend                                              | `translateY` +282, riding with the sheet | 0–320   |
| List inside the sheet                               | opacity 1 → 0                            | 0–120   |
| Summary inside the sheet                            | opacity 0 → 1                            | 160–320 |
| Tab bar                                             | `translateY` +64, opacity → 0            | 0–200   |
| Header (Descubrir + bell)                           | `translateY` −12, opacity → 0            | 0–160   |
| «Abrir mapa» pill                                   | opacity → 0                              | 0–120   |
| Back button, search field                           | `translateY` −12 → 0, opacity → 1        | 120–320 |
| Origin + reach row                                  | `translateY` −8 (y 72 → 64)              | 0–320   |
| Radius control 5 · 15 · 50                          | opacity → 0                              | 80–200  |
| Reach control 15 · 50 · 100 · País                  | opacity → 1                              | 120–240 |
| «En línea recta. En carro suele ser más.»           | opacity → 1                              | 200–320 |

The −146 and +282 come from the design: in S0 the origin sits at y 246 (centre of the band);
in S1 at y 392. The sheet top goes from 420 to 702. On other screen heights, compute them —
see _Scale and position_ below.

### T2 · Alcance 15 → 100 km (S1 → S2) — 480 ms, `Easing.bezier(0.2, 0, 0, 1)`

| Element                      | Change                              | ms                          |
| ---------------------------- | ----------------------------------- | --------------------------- |
| Distrito heat layer          | scale 1 → 0.19, opacity → 0         | scale 0–480, opacity 0–240  |
| Cantón heat layer            | scale 5.26 → 1, opacity 0 → 1       | scale 0–480, opacity 80–320 |
| Ring                         | radius 150 → 190 px (scale)         | 0–480                       |
| Ring label                   | follows the ring; text changes at 0 | 0–480                       |
| Session count in the summary | text changes                        | at 240                      |
| Zone chips                   | opacity 0 → 1, 30 ms apart          | from 320                    |

5.26 is the ratio of the two scales (10 px/km at 15 km, 1.9 px/km at 100 km). For any pair:
the incoming layer starts at `oldPxPerKm / newPxPerKm` and ends at 1; the outgoing layer ends
at `newPxPerKm / oldPxPerKm`. Both scale around the search origin. Going back (S2 → S1) is the
same table in reverse, also 480 ms.

### T3 · Tocar una zona (S2 → S3) — 380 ms, `Easing.bezier(0.2, 0, 0, 1)`

| Element                                                           | Change                                                                              | ms       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------- |
| Map                                                               | translate + scale so the zone fills the band above the sheet (×1.32 for San Carlos) | 0–380    |
| Sheet                                                             | `translateY` −488 (top 702 → 214)                                                   | 0–380    |
| Zone outline, zone name, share button                             | opacity → 1                                                                         | 200–380  |
| Zone chips, ring, «Tu zona», legend, origin + reach, search, hint | opacity → 0                                                                         | 0–150    |
| Summary                                                           | opacity → 0                                                                         | 0–100    |
| Zone content                                                      | opacity → 1, `translateY` 8 → 0, each block 40 ms after the previous                | from 140 |

### Going back

Back mirrors the same windows in less time with `Easing.bezier(0.4, 0, 0.2, 1)`:
**260 ms** to close the map (S1 → S0), **300 ms** to leave a zone (S3 → S2).

### Reduce motion

When `AccessibilityInfo.isReduceMotionEnabled()` is true (listen to `reduceMotionChanged`),
nothing moves or scales. The whole screen fades to 0 in 75 ms, the state changes, and it
fades back in 75 ms. The prototype's switch shows exactly this.

## Building it in React Native

### 1 · Layout: the map behind, the list in a sheet

v1 already asks for this, so build v1 this way and T1 comes almost free:

- `DiscoverScreen` renders the map **absolutely positioned at full window height**, then the
  sheet on top of it as an `Animated.View`, then the tab bar.
- The `FlatList` lives **inside the sheet** and is never unmounted. Closing the map returns
  the list exactly where it was scrolled.
- `HeatBand` becomes the full-height map (`DiscoverMap`). Its band is simply the part of it
  the sheet does not cover. `BAND_HEIGHT` stops being the map's height and becomes the
  _visible_ height in list mode (372 on the v1 board).

### 2 · One progress value per transition

```tsx
import { Animated, Easing } from 'react-native';

const OPEN = { ms: 320, easing: Easing.bezier(0.2, 0, 0, 1) };
const CLOSE = { ms: 260, easing: Easing.bezier(0.4, 0, 0.2, 1) };

const open = useRef(new Animated.Value(0)).current; // 0 = S0, 1 = S1

/** One row of the timing table: a window inside the transition, in ms. */
const track = (from: number, to: number, out: [number, number], total = OPEN.ms) =>
  open.interpolate({
    inputRange: [from / total, to / total],
    outputRange: out,
    extrapolate: 'clamp',
  });

const styles = {
  map: { transform: [{ translateY: track(0, 320, [-mapShift, 0]) }] },
  sheet: { transform: [{ translateY: track(0, 320, [0, sheetShift]) }] },
  list: { opacity: track(0, 120, [1, 0]) },
  summary: { opacity: track(160, 320, [0, 1]) },
  tabs: { transform: [{ translateY: track(0, 200, [0, 64]) }], opacity: track(0, 200, [1, 0]) },
  header: { transform: [{ translateY: track(0, 160, [0, -12]) }], opacity: track(0, 160, [1, 0]) },
  // …one line per row of T1
};

const setMapOpen = (next: boolean) =>
  Animated.timing(open, {
    toValue: next ? 1 : 0,
    duration: next ? OPEN.ms : CLOSE.ms,
    easing: next ? OPEN.easing : CLOSE.easing,
    useNativeDriver: true,
  }).start();
```

The ms windows in the tables translate one-to-one into `track(start, end, …)`. Reverse runs
the same interpolations backwards, so the close needs no second table.

T2 and T3 each get their own `Animated.Value` the same way.

### 3 · Scale and position

`viewportFor()` in `src/lib/heatmap.ts` ties the scale to the height
(`pixelsPerKm = height / (2 * spanKm)`). A full-height map with the same span would zoom
in — the ring would jump. Add one function and use it for both modes:

```ts
/** A viewport with a fixed scale: the open map keeps the list's px/km exactly. */
export function viewportAtScale(
  pxPerKm: number,
  width: number,
  height: number,
  centre: LatLng,
): Viewport {
  return { centre, spanKm: height / (2 * pxPerKm), width, height };
}
```

- **List mode (S0) and S1 at 15 km:** the list's scale. On the v1 board that is 10 px/km.
- **50 and 100 km:** `pxPerKm = (width / 2 − 5) / reachKm`, so the ring fits the width with
  5 px to spare (190 px for 100 km on a 390 px phone).
- **País:** fit Costa Rica's bounds.

The two shifts in T1, for any screen:

- `mapShift` = (origin y in S1) − (origin y in S0). The origin sits at 46% of the screen
  height in S1, and at the centre of the visible band in S0.
- `sheetShift` = (screen height − 142) − (sheet top in S0).

### 4 · The zoom (T2)

- Render the incoming heat layer at its **final** scale and animate its `scale` from the
  ratio to 1. Never re-render the SVG during the animation; mount it before, swap the old one
  out after.
- `kindForRadius()` already switches to `canton` above 20 km, which is exactly v2's rule:
  cantón far, distrito near.
- **Prefetch cantón heat when the map opens** (`fetchZoneHeat(supabase, 'canton')`), so T2
  never waits on the network. If it has not arrived, the ring still animates and the heat
  fades in when it lands (200 ms).

### 5 · Centring a zone (T3)

Translate and scale the map so the zone's bounding box fits the band above the zone sheet
(the top 214 px on a 390 × 844 phone), centred. The outline comes from
`fetchZoneOutlines()`, already used by the band. A cantón smaller than 44 px on screen is not
tappable at that zoom; its tap zooms in instead. That is why the whole GAM is one chip at
100 km.

### 6 · Accessibility

- The band in list mode: `accessibilityRole="button"`, label
  «Mapa de calor: 9 sesiones a menos de 15 km. Abrir el mapa completo». Today it is
  `"image"` with no action.
- On open, move focus to the back button (`AccessibilityInfo.setAccessibilityFocus`) and
  announce «Mapa abierto». On close, return focus to the band.
- Zone chips are 32 px tall; give them `hitSlop` to reach 44.
- Reduce motion as above.

### 7 · Web

`useNativeDriver` falls back to JavaScript on web; at these durations that is fine. Add
`Escape` to close. Making the open map part of browser history (so the browser's back
button closes it) is a follow-up, not part of this change.

## What this transition depends on

These are in the canvas notes for v2 and are **not** solved by the transition itself:

- `RADIUS_OPTIONS` in `DiscoverScreen.tsx` is `[5_000, 15_000, 50_000]`. Open map needs
  100 km and País.
- `nearby_activities()` defaults `p_limit` to 50. At 100 km or País the list caps at 50, so
  the summary's count («46 sesiones a menos de 100 km») must come from a count, not from
  the list's length.
- The zone sheet needs a new aggregate-only RPC, something like
  `zone_summary(zona, categoría, días)`, with `revoke all … from public, anon` like every
  new function. Show «menos de 5» below 5 people.
- «Apuntarme a la serie» has no backend yet. There is `cancel_series`, `update_series` and
  `generate_series_occurrences`, but no `join_series()`. It needs the same capacity locking
  as `join_activity()`.
- Distance stays «en línea recta». Minutes by car would need a routing provider — a new data
  recipient. «Cómo llegar» opens the person's own maps app with the destination only.

## Done means

- [ ] The ring is the same size before and after T1. Opening never changes the scale.
- [ ] Only `transform` and `opacity` are animated, all with `useNativeDriver: true`. No
      `height`, `top` or `LayoutAnimation`.
- [ ] Closing the map returns the list at the same scroll position.
- [ ] Android back closes the map, then leaves the zone, in that order.
- [ ] Reduce motion: no movement, 150 ms fade.
- [ ] Smooth on a mid-range Android phone with the GAM's real heat loaded.
- [ ] New copy passes `npm run check:voice`.
