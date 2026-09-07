# Status — 6 September 2026

An honest read of what exists, what does not, and what is blocking. Update this file when
the answer changes; a status document that lags is worse than none.

## Built and verified

| Area                   | State                                                                                                                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Database schema**    | 9 tables, PostGIS geography with a GiST index, trigger-maintained counters. Applies clean from zero                                                                                                                               |
| **Row-level security** | Deny by default — every grant revoked from `anon`/`authenticated`, then handed back per table. Helper predicates are `SECURITY DEFINER` to avoid policy recursion                                                                 |
| **Participation RPCs** | `join_activity()` / `leave_activity()` take `SELECT … FOR UPDATE` before reading capacity. Verified against three genuinely concurrent psql sessions on a 2-slot activity: 2 joined, 1 waitlisted, no overbooking                 |
| **Waitlist**           | Ordered, with automatic promotion on leave                                                                                                                                                                                        |
| **Series generation**  | `generate_series_occurrences()`, horizon of 8                                                                                                                                                                                     |
| **Nearby search**      | `nearby_activities()`, deliberately `SECURITY INVOKER` so RLS still applies to the caller                                                                                                                                         |
| **Currency**           | `price_minor` + a `currency_code` domain across locations, activities and series                                                                                                                                                  |
| **Category seed**      | Three categories — running, hiking, football — each with its JSON Schema. Adding a fourth is an `INSERT`, not a migration                                                                                                         |
| **SQL test suite**     | Participation, RLS, currency, and what a logged-out visitor can read. `npm run db:test` runs the whole thing against a throwaway database                                                                                         |
| **Live project**       | Supabase project in `us-east-1`, Postgres 17.6. Migrations 0001–0006 applied, including one seeded public venue. RLS verified against it: `anon` is denied `profile_private` and denied a direct write to `activity_participants` |
| **API layer**          | Generated database types and typed RPC wrappers                                                                                                                                                                                   |
| **Design tokens**      | `src/theme/` — palette, type, spacing, heat ramp, accessibility floors. `tsc --strict` with `noUncheckedIndexedAccess` passes                                                                                                     |
| **Screens designed**   | Field kit, Crear, Detalle, Descubrir, Roles/IA — see [`docs/design/`](design/)                                                                                                                                                    |
| **CI**                 | Format, lint, types, plus the database suite against a `postgis/postgis:17-3.5` service container, matching the live project. Conventional Commits enforced on PR titles                                                          |
| **App shell**          | Expo SDK 57, Expo Router, Barlow loaded, session persistence with an AsyncStorage adapter and refresh tied to `AppState`                                                                                                          |
| **Screens built**      | Descubrir, Detalle, Crear, Organizar, roster and check-in, sign-in, sign-up — all on `src/theme/`, no placeholder colours left                                                                                                    |

Both gates are green as delivered:

```bash
npm run verify    # prettier + eslint + tsc
npm run db:test   # migrations + RLS + behavioural suite
```

## Not built

Ordered by what blocks what, not by size.

### 1. Nothing has ever been checked in

The console is **built** — `/organizar` and `/organizar/[id]`, with per-person check-in and a
close-out that states its consequence as a count before it runs. What has not happened is anyone
using it. `check_in()` and `close_activity()` have never been called from the app, and
`close_activity()` is irreversible: everyone still `joined` becomes a permanent `no_show`.

So the blocker moved from "the screen does not exist" to "the write path is unexercised". That is
progress, but it is not the same as done, and every attendance number downstream still reads from
a table nothing has written.

### 2. Two sessions exist and nobody outside can see them

Two sessions were created through Crear. Neither is readable by `anon`, so Descubrir is still
empty for anyone not signed in — which is the entire cold-start argument in
[`architecture.md`](architecture.md).

The cause is not known. `03_anon_visibility_test.sql` proves the policy is correct: `anon` can read
a public, published activity, cannot read an unlisted one, and gets it back from
`nearby_activities()`. `createActivity()` sets `visibility` and `status` explicitly. Both halves
read correctly and the result is still wrong, which means the rows do not hold what the code
appears to write. Nobody has looked at them yet.

### 3. Grupos

Names, rules, members, and owner/organiser/member roles are all modelled in the schema.
Nothing is built on top.

### 4. Attendance history

Tables (`user_location_history` plus a consent record) are designed, not written. The
90-day delete job that `docs/security.md` now promises **does not exist**. Until it does,
the security document describes a control the system does not have — treat that as a launch
blocker, not a v2 item.

### 5. AI features and modo solo

Modo solo first: it works at zero liquidity and needs no other users. AI proposals need
attendance data, which needs check-in, which is item 1.

## Verified, and not

Worth separating, because "merged" and "works" have drifted apart.

**Exercised against the live database:** sign-up and the profile trigger, sign-in, session
persistence, category and venue reads, the `nearby_activities()` call path, and creating a session
— which returned an id.

**Never run:** join, leave, waitlist promotion, check-in, close-out, and every branch of Detalle
below the fetch. Three screens have been verified only at their edges — that they mount, that the
auth guard redirects, that nothing throws. The populated states are untested because no session
has ever been visible to the account doing the testing.

The concurrency guarantees are the exception: `join_activity()` under three racing sessions is
covered by the SQL suite on every pull request. It is the client paths that are unproven.

## Open accessibility findings

Closed in this delivery: all five contrast failures, the type-size floor, the `es-419`
language pass, and a token rename (`text.disabled` → `text.disabledOnly`) that makes the
below-AA value hard to reach for by accident.

Still open:

- **Focus states are not applied** to cards and chips. Blocking for the web build. The
  organiser console makes this more urgent, not less — a keyboard user is a primary user of
  a data-entry console.
- **`hitSlopFor()` is defined but never called.** Chips are ~30px against a 44px floor.
  Defining the floor and not applying it is the same class of gap as item 4 above.
- **Line heights are fixed** and do not respond to OS text scaling.

Out of scope until an app runs: reading order, VoiceOver/TalkBack labels, keyboard
navigation.

## Security and legal, outstanding

- **Ley 8968 consent text needs local counsel.** Health-adjacent data requires separate
  express written consent; sanctions run 5–30 base salaries (roughly ₡2.3 M–₡13.9 M in
  2026). The consent screen is designed; the wording is not legal-reviewed.
- **Cross-border transfer needs a documented basis** — a PRODHAB adequacy finding or an
  applicable derogation. Pick the Supabase region deliberately and write down why.
- **Storage buckets are public by default** in Supabase. They are not locked down yet.
- **EXIF is not stripped on upload.** Phone photos carry GPS coordinates.
- **App Check / attestation is not set up.** Without it the backend is an open API.
- **Email confirmation is currently OFF.** Turned off to unblock testing, which means anyone can
  register with an address they do not own. It has to go back on with custom SMTP configured —
  Supabase's built-in sender only reaches team addresses and caps at a couple of messages an hour.
  Development-only setting, launch blocker if it survives.

## Secrets — read before touching Supabase

- The **anon key is public by design** and belongs in the client. RLS, not secrecy, is the
  control.
- The **service-role key bypasses RLS entirely.** It must never appear in the app, in this
  repository, in CI logs, or in a screenshot. If one is ever committed, **rotate it in
  Supabase immediately** — deleting the commit is not enough.
- `.env.example` lists the variables. There is no `.env` in this repository and there should
  never be one.

## Suggested order of work

1. **Use the console once.** Sign in, open a session, mark somebody present, close it. That single
   pass exercises the only irreversible path in the product and produces the first attendance row
   that has ever existed.
2. **Explain the visibility anomaly.** Until it is understood, Descubrir is empty for every
   stranger, and the product's cold-start plan does not hold.
3. **Focus states and `hitSlop`** — `focusRing` and `hitSlopFor()` are defined and still never
   called. Cheap now, not cheap at fifty components.
4. **Grupos** — fully modelled, no screen.
5. **Modo solo** — the only feature that works before there are users.
6. **Storage lockdown, EXIF stripping, App Check** — before the first public session, not after.
7. **Attendance history plus its 90-day delete job** — together, or neither.
