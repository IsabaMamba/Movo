# 0004 — Thermal is the visual direction, and heat means density

**Status:** Accepted · 2026-09

## Context

Three directions were put on the canvas: **thermal** (a heat-map reading of a city's
activity), **avant** (editorial, high-contrast, typographic), and **colour fields**
(vintage-sporty flat blocks). All three are viable as posters. Only one of them says
something true about the product.

Movo's problem is not that people cannot find a list of activities. It is that a list does
not tell you whether anyone will actually be there. The thing worth showing is _where the
city is warm right now_ — which sessions have people in them, which districts are alive on
a Tuesday evening. That is a density map, and a density map has a native visual language.

The palette the founder selected is dark and cool at rest (`#0B0F1F` → `#2A344A`) with warm
accents (`#FFC56B`, `#FF7A4D`, `#E94E3D`). It is a thermal palette whether or not it is
used as one.

## Decision

Adopt **thermal** as the visual direction, with one rule attached that is as much of the
decision as the aesthetic is:

> **Warm colour encodes occupancy density, and nothing else. Any surface that uses heat must
> also show the scale that decodes it.**

Two themes, both dark: **Calma** and **Heatwave**. They differ by a gamma shift on the heat
ramp (`GAMMA = { calma: 1, heatwave: 0.6 }`), not by background colour. Heatwave is not a
"light mode" — it is the same map turned up.

The ramp is eight stops interpolated in OKLab with monotonically increasing lightness, so
density reads correctly in greyscale and for red-green colour vision deficiency. Density is
never carried by colour alone: every heat surface pairs it with a number
(`occupancyLabel()`) and a screen-reader sentence (`occupancyA11yLabel()`).

## Consequences

- **Danger needs its own red.** `#E94E3D` sits inside the heat ramp's warm end. Destructive
  UI chrome uses `colors.semantic.danger`, and on raised surfaces `dangerOnRaised`
  (`#F26150`), so "this session is full" and "delete this session" never look alike.
- **Uncapped sessions still need a temperature.** `max_participants` is nullable by design.
  `densityOf()` scales those against a fixed reference of 25 people, and
  `occupancyLabel()` returns a different sentence shape (`"8 van"` rather than
  `"8 de 12"`), so an uncapped session is never shown as a full one.
- **Avant and colour fields are not discarded** — they are where marketing and the launch
  site can live. They are simply not the product's operating language.
- The direction constrains illustration: no warm imagery on a screen that is not about
  occupancy.

## Alternatives considered

- **Avant as the product language.** Rejected: it is beautiful and it is mute. It has no
  way to say "this place has six people in it right now", which is the one thing the
  product knows that a calendar does not.
- **Colour fields.** Rejected for the same reason, plus a practical one: flat saturated
  blocks fight the map, and the map is the primary surface.
- **Heat as decoration.** Rejected explicitly. Once a warm accent appears on a card that is
  not about density, the ramp stops meaning anything and the map becomes wallpaper.
