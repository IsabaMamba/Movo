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
| **Category seed**      | Five categories with their JSON Schemas                                                                                                                                                                           |
| **SQL test suite**     | Participation, RLS, and currency. `npm run db:test` runs the whole thing against a throwaway database                                                                                                             |
| **API layer**          | Generated database types and typed RPC wrappers                                                                                                                                                                   |
| **Design tokens**      | `src/theme/` — palette, type, spacing, heat ramp, accessibility floors. `tsc --strict` with `noUncheckedIndexedAccess` passes                                                                                     |
| **Screens designed**   | Field kit, Crear, Detalle, Descubrir, Roles/IA — see [`docs/design/`](design/)                                                                                                                                    |
| **CI**                 | Format, lint, types, plus the database suite against a `postgis/postgis:16-3.4` service container. Conventional Commits enforced on PR titles                                                                     |

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

### 2. No application shell

There is no Expo app yet — no navigation, no screens in code, no auth flow wired up. The
database and the tokens are ready for one; nothing consumes them.

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
2. **Expo shell** — auth, navigation, and Descubrir wired to `nearby_activities()`.
3. **Focus states and `hitSlop`** — cheap, and they stop being cheap once there are fifty
   components.
4. **Modo solo** — the only feature that works before there are users.
5. **Storage lockdown, EXIF stripping, App Check** — before the first public session, not
   after.
6. **Attendance history plus its delete job** — together, or neither.
