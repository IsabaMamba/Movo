# Architecture

## Shape

One Expo codebase and one Supabase project. A modular monolith on both sides, matched
module for module. No microservices, no Kubernetes, no separate API server — at this size
each of those would add operational cost without buying anything.

```
Expo app (iOS · Android · web)
        │  @supabase/supabase-js
        ▼
Supabase
 ├─ Auth ............ email/password, JWT
 ├─ Postgres 17 ..... schema + RLS + SECURITY DEFINER RPCs
 │    └─ PostGIS .... geography(Point, 4326), GiST index
 └─ Storage ......... avatars, session covers
```

The web build comes free from the same codebase (`expo start --web`), which is how a pilot
district gets a working product while store review is still ahead of us.

## Data model

Nine concepts. The ones that carry the most weight:

**`activity_series`** — the object a run club actually _is_: "every Tuesday, 18:00, La
Sabana". Individual `activities` are generated occurrences of it, materialized up to a
horizon by `generate_series_occurrences()`. Without this a recurring club can only be
represented as N unrelated rows, and the recurring commitment is the thing that retains
people.

**`activities`** — one session. Times are `timestamptz`, never a naive local date plus
time, so adding Panamá later does not break the schedule. Category-specific fields live in
an `attributes` jsonb column, shaped by a JSON Schema stored on `categories`. Adding padel
is an `INSERT` into `categories` plus a form renderer — no migration, no new table, and no
EAV.

**`activity_participants`** — the join table, plus the states that make attendance real:
`waitlisted` for overflow, `attended` set by check-in, `no_show` set at close-out. Counters
on `activities` are trigger-maintained, never updated by hand.

**`locations`** — owns the geography. Activities reference a location and may add a
free-text `meeting_point`. Storing coordinates on both would let them drift, and float
lat/lng columns cannot use a spatial index, which would turn "sessions near me" into a
table scan.

**`profiles` / `profile_private`** — split because RLS exposes or hides whole rows. The app
must show an organizer's name without exposing anyone's phone number.

## The two rules that shape everything else

**1. Participation is only written through RPCs.** There is no `INSERT` grant on
`activity_participants` for any client role. `join_activity()` takes
`SELECT … FOR UPDATE` on the activity before reading capacity, so two clients racing for
the last slot cannot both succeed. Verified in CI with genuinely concurrent sessions. See
[ADR 0002](adr/0002-participation-writes-through-rpcs.md).

**2. Deny by default.** `0003_rls.sql` opens by revoking every default grant from `anon`
and `authenticated`, then hands privileges back table by table. A table added later without
a policy is unreachable rather than world-readable.

RLS helper predicates (`is_activity_participant`, `is_community_member`, …) are
`SECURITY DEFINER` on purpose: a policy on `activity_participants` that queries
`activity_participants` recurses infinitely, and routing the lookup through a definer
function terminates it.

`nearby_activities()` is deliberately `SECURITY INVOKER` — RLS still applies inside it, so
it cannot leak community-only sessions. Do not "optimize" this by making it definer.

## Cold start

`activities.source` is `native | imported`. Before we own any supply, real public club
sessions are seeded as `imported`, attributed and linkable, so the first thing a new user
sees is a populated screen rather than an empty state. `claimed_by` lets the real organizer
take one over when they sign up.

## Client layers

```
src/lib/         supabase client, typed RPC wrappers, error mapping
src/types/       row and RPC types (regenerate with `supabase gen types`)
src/features/    screens, hooks, local components — one folder per module
src/components/  shared presentational components (promoted on second use)
src/theme/       design tokens (pending direction)
```

`src/lib/activities.ts` maps SQLSTATE codes onto something a screen can branch on:
`42501 → forbidden`, `P0002 → not_found`, `22023 → invalid_state`. Screens render the
returned participation status rather than assuming success — "estás en lista de espera" is
a different outcome from "vas".

## Deliberately not built

- **A social feed.** Strava has ~180 M users and shipped club events, route sharing, and
  club leaderboards in H2 2026. We integrate read-only instead of competing.
- **A coach marketplace.** Trainers already have Instagram for reach and SINPE Móvil for
  payment; we would add a fee to both.
- **In-app payments.** SINPE Móvil is free, instant, and in ~4.6 M pockets. Any take rate
  gets routed around in one message.
- **Realtime chat, for now.** WhatsApp already does this perfectly for these users. The
  `messages` table exists for when it earns its place; until then a deep link is the
  feature.
