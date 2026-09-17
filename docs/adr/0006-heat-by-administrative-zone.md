# ADR 0006 — Heat aggregates into administrative zones, never into points

**Date:** 17 September 2026
**Status:** Accepted
**Supersedes:** nothing. Extends ADR 0004 (the thermal direction).

## Context

Movo's one piece of information design is density rendered as temperature. Until now
the ramp had no defined spatial unit: `nearby_activities()` returns sessions, and a
screen coloured each card. The map was never built, so the question never had to be
answered.

The map forces it, and the answer is a privacy decision before it is a design one.
The threat model in `docs/security.md` is a stalker with a valid account. A heat
surface fine enough to light one block is a surface that says where a person will be,
and combined with attendance history it says where they go every Tuesday.

## Decision

**Heat aggregates into the IGN administrative division, and each zone is drawn at its
own centroid.**

- Two levels of heat: **cantón** when the country is in view, **distrito** when it is
  not. Below distrito there is no third level — there are venue pins, and venues are
  public and named by design.
- **Provincia is a heat level too**, at the furthest distance. Seven zones cannot carry
  precision, and that is not what it is for: it is the screen where somebody recognises
  their own province. `Limón está frío` is a business fact.
- A blob is born at its zone's centroid, with a width from that zone's equivalent-circle
  radius and a peak that falls as area rises — so a 3,379 km² cantón reads wide and faint
  while a 6.8 km² one reads tight and bright. The eye ends up reading density rather than
  raw count, which is what a heat map should say.
- The key is the **IGN 5-digit code**, never the name. There are several "San Rafael",
  "San Isidro" and "San Antonio" in Costa Rica. That is the normal case across Latin
  America, not a local quirk to design around.

## Why the centroid, and not a blur

A blurred point stays centred on the point. Knowing the blur radius recovers the centre,
and any two sessions in the same district still produce two separate smudges in two
separate places.

Snapping to the zone centroid removes the intra-zone position from the computation
entirely. **It cannot be recovered because it was never used.** Three sessions in one
district produce one brighter blob in one place, not three blobs.

`supabase/tests/14_zones_test.sql` asserts this against two venues ~9 km apart inside one
district: one row, at the district's centre, carrying neither venue's coordinates. The
assertion was mutation-tested — `zone_heat()` was changed to return the venue's own point
and the suite failed naming the leaked coordinate.

## What this does not claim

The map does not hide where a session is. It cannot: venues are public, named, and the
session detail screen gives the address, all deliberately. What the aggregate avoids is
**manufacturing a new signal** that the session list does not already give — a
continuously-updating surface of where people gather, readable without opening anything.

## Consequences

- `locations` gains `district_code`, resolved once by a trigger when the venue is created
  or its point moves. Resolving per query would be a point-in-polygon for every row of
  every map read.
- `zones` needs boundary polygons to resolve venues, and they must come from IGN. The open
  mirrors are one revision behind — 83 cantones and 472 districts against 84 and 494.
  Twenty-two missing districts are twenty-two zones that can never light up.
- `zone_heat()` excludes `community` and `unlisted` sessions. A private session would
  otherwise leak through the count, which is the sort of hole that only shows up when
  somebody notices their group is visible on a public map.
- A zone with nothing in it is **absent** from the result, not present with zero. The map
  draws a missing zone as terrain. A zero would draw it as a cold blob, and the difference
  between "quiet" and "nothing here" is the difference the product sells.

## The ramp changed with it

Making the heat intense enough to read at these sizes exposed the mauve crossing
(`#A86D65`) that the 5 September audit flagged and nobody resolved. It is structural: a
cool-to-hot ramp whose luminance only rises cannot stay saturated from teal to red,
because saturated magenta cannot reach the luminance its slot needs — green carries 72%
of luminance and magenta has none. Three candidate ramps that kept teal were measured and
all three broke monotonicity.

So the ramp takes the path thermal maps take: violet → magenta → red → orange. Mean chroma
0.35 → 0.40, and luminance now rises at every step — **checked by a test rather than
asserted in a comment**, which is the first time that rule has been enforced since it was
written.

Teal keeps its other jobs: `accent.cool` for icons and links, and the map's resting fill.
It stops being heat, which clarifies the reading — cool is the map, warm is activity, and
nothing means both.
