# Status — 6 September 2026

An honest read of what exists, what does not, and what is blocking. Update this file when
the answer changes; a status document that lags is worse than none.

## Built and verified

| Area                   | State                                                                                                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Database schema**    | 9 tables, PostGIS geography with a GiST index, trigger-maintained counters. Applies clean from zero                                                                                                               |
| **Row-level security** | Deny by default — every grant revoked from `anon`/`authenticated`, then handed back per table. Helper predicates are `SECURITY DEFINER` to avoid policy recursion                                                 |
| **Participation RPCs** | `join_activity()` / `leave_activity()` take `SELECT … FOR UPDATE` before reading capacity. Verified against three genuinely concurrent psql sessions on a 2-slot activity: 2 joined, 1 waitlisted, no overbooking |
| **Waitlist**           | Ordered, with automatic promotion on leave                                                                                                                                                                        |
| **Series generation**  | `generate_series_occurrences()`, horizon of 8                                                                                                                                                                     |
| **Nearby search**      | `nearby_activities()`, deliberately `SECURITY INVOKER` so RLS still applies to the caller                                                                                                                         |
| **Currency**           | `price_minor` + a `currency_code` domain across locations, activities and series                                                                                                                                  |
| **Category seed**      | Three categories — running, hiking, football — each with its JSON Schema. Adding a fourth is an `INSERT`, not a migration                                                                                         |
| **SQL test suite**     | Participation, RLS, and currency. `npm run db:test` runs the whole thing against a throwaway database                                                                                                             |
| **Live project**       | Supabase project provisioned in `us-east-1`, Postgres 17.6. Migrations 0001–0005 applied. RLS verified against it: `anon` is denied `profile_private` and denied a direct write to `activity_participants`        |
| **API layer**          | Generated database types and typed RPC wrappers                                                                                                                                                                   |
| **Design tokens**      | `src/theme/` — palette, type, spacing, heat ramp, accessibility floors. `tsc --strict` with `noUncheckedIndexedAccess` passes                                                                                     |
| **Screens designed**   | Field kit, Crear, Detalle, Descubrir, Roles/IA — see [`docs/design/`](design/). Not yet applied in code                                                                                                           |
| **CI**                 | Format, lint, types, plus the database suite against a `postgis/postgis:17-3.5` service container, matching the live project. Conventional Commits enforced on PR titles                                          |

Both gates are green as delivered:

```bash
npm run verify    # prettier + eslint + tsc
npm run db:test   # migrations + RLS + behavioural suite
```

## Not built

Ordered by what blocks what, not by size.

### 1. Organiser roster and check-in — the real blocker

The only screen that **produces** new data. Attendance prediction, organiser reputation, and
every AI feature read from it. It has been deferred three times, and each deferral makes the
downstream features more speculative, because nothing has ever written the number they read.

Scoped as a **web/desktop console**: rosters are tables, series setup is a form with many
fields, and an organiser doing this work is at a desk. Participants stay phone-first.

### 2. The app shell exists, but nothing wears the tokens

**Built since this file was written:** Expo SDK 57 with Expo Router, a Supabase client with
session persistence, email/password sign-up and sign-in, and Descubrir wired to
`nearby_activities()` with live category and radius filters. Two real accounts exist.

**Still missing:** Crear and Detalle have no code, and every screen that does exist is styled with
placeholder values rather than `src/theme/`. The tokens are committed and still unconsumed — the
gap moved, it did not close.

Descubrir also renders an empty state and nothing else, because no session has ever been created.
Seeding is blocked on Crear, or on someone writing the rows by hand.

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

1. **Organiser console** — roster and check-in. Unblocks everything measured.
2. **Crear sesión** — the only way to get a session into the database without hand-written SQL, and
   therefore the only way Descubrir stops being empty. The design exists; the schema-driven form
   does not.
3. **Apply the tokens** to the screens that already run, and add focus states and `hitSlop` while
   touching them — cheap now, not cheap once there are fifty components.
4. **Modo solo** — the only feature that works before there are users.
5. **Storage lockdown, EXIF stripping, App Check** — before the first public session, not
   after.
6. **Attendance history plus its delete job** — together, or neither.
