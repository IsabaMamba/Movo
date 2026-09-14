# Status — 13 September 2026

An honest read of what exists, what does not, and what is blocking. Update this file when
the answer changes; a status document that lags is worse than none. The previous version was
dated 8 September and described a visibility anomaly that turned out never to have been one.

## What changed since 8 September

| PR  | What                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------- |
| #29 | "Reportar esta sesión" actually reports — closed reason list, one insert into `reports`                                   |
| #30 | Crear names what is missing instead of going silent                                                                       |
| #31 | The publish confirmation quotes the new row's id and the project ref                                                      |
| #32 | Day and time fields were unfillable on phones (numeric keypad, no hyphen or colon); default start time landed in the past |
| #33 | The report confirmation quotes the report id                                                                              |
| #34 | **Add a public venue from Crear** — paste a Google Maps / Waze link or use the device location                            |
| #35 | **Mis sesiones** — participants can find a session again after joining it                                                 |
| #36 | **Cancel and edit a session** — _open, not merged._ Migration `0008` is already applied to the live project               |

### The visibility anomaly was not a visibility problem

The old item 2 here theorised about three RLS and RPC gates between a created session and a
stranger. None of them was closed. The create form's guard returned early with no request, no
error and no row — so there was nothing to be visible — and the default start time put the first
real session in the past, where `nearby_activities()` correctly filters it out. The lesson is
recorded because it cost four days: **check whether the row exists before reasoning about who can
read it.**

## Built and verified

| Area                   | State                                                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Database schema**    | PostGIS geography with a GiST index, trigger-maintained counters. Applies clean from zero                                                                                                                                                               |
| **Row-level security** | Deny by default; every grant revoked from `anon`/`authenticated`, then handed back per table. Helper predicates are `SECURITY DEFINER` to avoid policy recursion                                                                                        |
| **Mutations**          | Participation **and now editing and cancelling** go through RPCs only. `0008` revoked the direct `UPDATE` on `activities`, which let an organizer write `joined_count` and `status` through PostgREST                                                   |
| **Participation RPCs** | `join_activity()` / `leave_activity()` take `SELECT … FOR UPDATE` before reading capacity; covered by concurrent sessions in the SQL suite                                                                                                              |
| **Waitlist**           | Ordered, promoted on leave and on a capacity increase, renumbered after every promotion                                                                                                                                                                 |
| **Cancel / edit**      | `cancel_activity()` keeps participant rows, stores a reason, writes an inbox row per person. `update_activity()` locks time and venue once anyone joined, floors capacity at `joined_count`. A cancelled session cannot be checked in, closed or joined |
| **Venues**             | Created from the app; coordinates bounds-checked against Costa Rica and read back before saving                                                                                                                                                         |
| **SQL test suite**     | Participation, currency, anon visibility, communities, reports, venues, cancel/edit — seven suites. `db-test.sh` globs, so new files are picked up automatically                                                                                        |
| **Live project**       | Supabase `eacmjgpsrqooqizlzapm`, `us-east-1`, Postgres 17.6. **All eight migrations applied**                                                                                                                                                           |
| **CI**                 | Format, lint, types, and the database suite against `postgis/postgis:17-3.5`. Conventional Commits on PR titles. Runs on pull requests and on `main` — not on a pushed branch without a PR                                                              |
| **Screens built**      | Descubrir, Detalle, Crear (with add-venue), Organizar, roster and check-in, Editar sesión, Mis sesiones, Grupos and group detail, modo solo, sign-in, sign-up                                                                                           |
| **Accessibility**      | Labels, roles, states and hints on every screen; global `:focus-visible` ring; 44px targets via `hitSlopFor`. Untested with a screen reader                                                                                                             |

```bash
npm run verify    # prettier + eslint + tsc
npm run db:test   # migrations + RLS + behavioural suite
```

## Verified against live data, and not

Worth separating, because "merged" and "works" drifted apart once already.

**Exercised on the live project by real accounts** (7 profiles, 6 sessions, 5 venues as of today):

- Sign-up, sign-in, session persistence
- Creating sessions, from several different accounts
- Joining a session organised by somebody else
- A capped session filling up — _Canchas de Fonseca_ reached 2 of 2 and the trigger moved it to `full`
- Adding venues from the app — four of the five venues were created by users
- A new venue's coordinates landing in the right place: a session at Parque de la Paz is returned by `nearby_activities()` 2.4 km from central San José
- `0008`'s functions are reachable and refuse an unauthenticated caller

**Never run against live data:**

- `check_in()` and `close_activity()` — _Futbol 5 en la sabana_ passed on 10 September and is still open, with one person `joined`
- A waitlist — every session reads `waitlist_count = 0`
- `update_activity()` and `cancel_activity()` from the app. The screens were tried before `0008` was applied, when the functions did not yet exist
- Recurring series and `generate_series_occurrences()`
- Groups — `communities` is empty
- Mis sesiones rendering real rows
- A report submission — `reports` is not readable with the anon key, so this cannot be confirmed from outside

## Not built

Ordered by what blocks what.

### 1. Nobody is told anything

`notifications` now receives rows — waitlist promotions and every cancellation — and nothing
delivers them. There is no inbox screen and no push. This is the most consequential gap in the
product, because two other decisions are held back by it:

- Editing **locks time and venue** once anybody has joined, because moving a session silently
  sends people to the wrong place. It can loosen once a change reaches them.
- Every cancellation confirmation tells the organizer to **write to people themselves**.

### 2. The copy contradicts the documented voice

`docs/product.md` settles it: neutral Latin American Spanish, **`tú`, not `vos`**, so a launch in
Panamá or Colombia needs no rewrite. The app is written in `vos` throughout — _Iniciá_, _podés_,
_tenés_, _Registrate_ — and the screens added in #34–#36 made it larger, not smaller (_Pegá_,
_Agregalo_, _cancelá_, _escribiles_).

This needs a decision before it needs a pass: either `product.md` changes to a Costa Rica-first
voice, or every string does. It is cheaper every day it is decided sooner.

### 3. No profile or account screen

Sign-out lives in the Descubrir header. Nobody can change their display name or photo, and there
is no storage bucket for a photo to go into.

### 4. Attendance history and its 90-day delete job

Designed, not written. `docs/security.md` promises the delete job; until it exists that document
describes a control the system does not have. Launch blocker.

### 5. AI features

Need attendance data, which needs item 1 of the next section to happen at least once.

## Suggested order of work

1. **Try edit and cancel, then merge #36.** _Canchas de Fonseca_ is full at 2 of 2, which makes it
   the right session: a third account joins and lands on the waitlist, the organizer raises
   capacity to 3 and that person should be promoted, then cancel with a reason and check Mis
   sesiones from a participant's account.
2. **Close out _Futbol 5 en la sabana_.** Mark Chelsy, close it. It is the only irreversible path
   in the product and it has still never run.
3. **Decide the voice** — `tú` or `vos` — and apply it once.
4. **An inbox screen** over `notifications`, then push. Unlocks editing time and place.
5. **Profile screen**, with a locked-down storage bucket and EXIF stripping in the same change.
6. **Email confirmation back on**, with custom SMTP. Anyone can currently register with an address
   they do not own.
7. **App Check**, before the first public session.
8. **Attendance history plus its 90-day delete job** — together, or neither.
9. **A screen-reader pass**, and line heights that follow OS text scaling.

## Security and legal, outstanding

- **Ley 8968 consent text needs local counsel.** Health-adjacent data requires separate express
  written consent; sanctions run 5–30 base salaries (roughly ₡2.3 M–₡13.9 M in 2026).
- **Cross-border transfer needs a documented basis** — a PRODHAB adequacy finding or an applicable
  derogation. Write down why `us-east-1`.
- **Storage buckets are public by default** in Supabase and are not locked down.
- **EXIF is not stripped on upload.** Phone photos carry GPS coordinates.
- **App Check / attestation is not set up.** Without it the backend is an open API.
- **Email confirmation is OFF.** Development-only; a launch blocker if it survives.

## Secrets — read before touching Supabase

- The **anon key is public by design** and belongs in the client. RLS, not secrecy, is the control.
- The **service-role key bypasses RLS entirely.** It must never appear in the app, in this
  repository, in CI logs, or in a screenshot. If one is ever committed, **rotate it in Supabase
  immediately** — deleting the commit is not enough.
- `.env` is local and git-ignored; `.env.example` lists the variables.
- Migrations are applied with `npx supabase@latest db push --linked` from a machine where the CLI
  is logged in and linked. Apply them deliberately and record it here.
