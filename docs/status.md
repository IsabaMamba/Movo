# Status — 8 September 2026

An honest read of what exists, what does not, and what is blocking. Update this file when
the answer changes; a status document that lags is worse than none.

## Built and verified

| Area                   | State                                                                                                                                                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Database schema**    | 9 tables, PostGIS geography with a GiST index, trigger-maintained counters. Applies clean from zero                                                                                                                                                               |
| **Row-level security** | Deny by default — every grant revoked from `anon`/`authenticated`, then handed back per table. Helper predicates are `SECURITY DEFINER` to avoid policy recursion                                                                                                 |
| **Participation RPCs** | `join_activity()` / `leave_activity()` take `SELECT … FOR UPDATE` before reading capacity. Verified against three genuinely concurrent psql sessions on a 2-slot activity: 2 joined, 1 waitlisted, no overbooking                                                 |
| **Waitlist**           | Ordered, with automatic promotion on leave                                                                                                                                                                                                                        |
| **Series generation**  | `generate_series_occurrences()`, horizon of 8                                                                                                                                                                                                                     |
| **Nearby search**      | `nearby_activities()`, deliberately `SECURITY INVOKER` so RLS still applies to the caller                                                                                                                                                                         |
| **Currency**           | `price_minor` + a `currency_code` domain across locations, activities and series                                                                                                                                                                                  |
| **Category seed**      | Three categories — running, hiking, football — each with its JSON Schema. Adding a fourth is an `INSERT`, not a migration                                                                                                                                         |
| **SQL test suite**     | Participation, RLS, currency, what a logged-out visitor can read, and community ownership. `db-test.sh` globs both folders, so a new migration or test file is picked up without editing the script — it used to list files by hand, and the list stopped at 0005 |
| **Live project**       | Supabase project in `us-east-1`, Postgres 17.6. All seven migrations applied, including one seeded public venue. RLS verified against it: `anon` is denied `profile_private` and denied a direct write to `activity_participants`                                 |
| **API layer**          | Generated database types and typed RPC wrappers                                                                                                                                                                                                                   |
| **Design tokens**      | `src/theme/` — palette, type, spacing, heat ramp, accessibility floors. `tsc --strict` with `noUncheckedIndexedAccess` passes                                                                                                                                     |
| **Screens designed**   | Field kit, Crear, Detalle, Descubrir, Roles/IA — see [`docs/design/`](design/)                                                                                                                                                                                    |
| **CI**                 | Format, lint, types, plus the database suite against a `postgis/postgis:17-3.5` service container, matching the live project. Conventional Commits enforced on PR titles                                                                                          |
| **App shell**          | Expo SDK 57, Expo Router, Barlow loaded, session persistence with an AsyncStorage adapter and refresh tied to `AppState`                                                                                                                                          |
| **Screens built**      | Descubrir, Detalle, Crear, Organizar, roster and check-in, Grupos and group detail, modo solo, sign-in, sign-up — eleven routes, all on `src/theme/`, no placeholder colours left                                                                                 |
| **Accessibility**      | Labels, roles, states and hints across all twelve screens; a global `:focus-visible` ring; 44px targets via `hitSlopFor`; heat hidden from screen readers with `occupancyA11yLabel` speaking in its place. Untested with an actual screen reader                  |

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
read correctly and the result is still wrong.

The reason that is not a contradiction is that there are **three** gates, not one, and they do not
agree with each other:

1. The `activities_read` policy allows `visibility = 'public'` and
   `status in ('published','full','completed')`.
2. `nearby_activities()` narrows that further: `status in ('published','full')` — note that
   `completed` passes the policy and is dropped here — plus `starts_at >= now()` and the radius.
3. Descubrir calls it from a fixed `GAM_CENTRE`, because device location needs a permission prompt
   that does not exist yet.

A row can satisfy the policy and still never reach the screen, so reading `visibility` and
`status` back cannot tell you which gate closed. A session whose start time has passed is the
first thing to rule out, and it is invisible to every check made so far.

### 3. Nobody has reported anything, and nothing would happen if they did

`reports` exists with its triage index, its `insert` and `read_own` policies, and its
resolution columns. Detalle renders a "Reportar esta sesión" button. The button has **no
`onPress`** — there is no `createReport()` anywhere in `src/lib/`, so the control is inert.

That is worse than having no button. A person who feels unsafe presses it, nothing happens,
and they conclude the report went through. `docs/security.md` lists in-app reporting with a
human reading it as a blocker for the first public session, so this is not a v2 item either.

The backend is entirely done. What is missing is a reason picker, one insert, and somebody
whose job is to read the queue.

### 4. Attendance history

Tables (`user_location_history` plus a consent record) are designed, not written. The
90-day delete job that `docs/security.md` now promises **does not exist**. Until it does,
the security document describes a control the system does not have — treat that as a launch
blocker, not a v2 item.

### 5. AI features

Modo solo shipped in #23, so the zero-liquidity case is covered. AI proposals still need
attendance data, which needs check-in, which is item 1. Nothing here is startable yet.

### 6. The copy went back to voseo in eight places

`docs/product.md` settles the voice: neutral Latin American Spanish, second person `tú`, so
that launching in Panamá or Colombia does not need a copy rewrite. Eight strings across
Descubrir, Detalle, Crear, modo solo and both auth screens use `vos` — _probá_, _podés_,
_tenés_, _entrás_, _Registrate_, _Iniciá_.

Small, and worth doing before there are two hundred strings rather than eight.

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

Closed at token level earlier: all five contrast failures, the type-size floor, the `es-419`
language pass, and a token rename (`text.disabled` → `text.disabledOnly`) that makes the
below-AA value hard to reach for by accident.

Closed in the app in the same pull request as this correction — until then the twelve screens
carried **zero** `accessibilityLabel` or `accessibilityRole` props between them, and
`hitSlopFor`, `focusRing` and `occupancyA11yLabel` were exported and called from nowhere:

- **Focus ring** now comes from `src/app/+html.tsx` as a single `:focus-visible` rule, rather
  than from each component remembering to set one.
- **Touch targets** — every control under 44px is padded with `hitSlopFor`.
- **Heat is hidden from screen readers** and `occupancyA11yLabel` speaks the number instead.
- **Composite rows announce once**, with one composed label rather than nine fragments.
- **Consequences are in hints** where the label does not carry them: waitlists, giving up a
  place, sixty days of generated sessions, and the irreversible close-out.

Still open:

- **Line heights are fixed** and do not respond to OS text scaling. The only one of the
  original findings still standing.
- **Nothing has been tested with a screen reader running.** Labels that typecheck are not
  labels that make sense out loud, and every claim above is a claim about the code, not about
  the experience. One pass with VoiceOver or TalkBack would settle it.

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

1. **Explain the visibility anomaly.** Until it is understood, Descubrir is empty for every
   stranger, and the product's cold-start plan does not hold. There are three independent gates
   between a created session and a stranger seeing it — the RLS policy, the extra filters inside
   `nearby_activities()` (`status in ('published','full')`, `starts_at >= now()`, radius), and the
   fixed `GAM_CENTRE` origin Descubrir calls from. Checking `visibility` and `status` alone cannot
   say which one closed.
2. **Use the console once.** Sign in, open a session, mark somebody present, close it. That single
   pass exercises the only irreversible path in the product and produces the first attendance row
   that has ever existed.
3. **Wire up reporting.** The table, the policies and the button all exist; the `onPress` does not.
   A safety control that silently does nothing is the one kind of bug that costs somebody
   something real.
4. **Email confirmation back on**, with custom SMTP. Anyone can currently register with an address
   they do not own.
5. **Storage lockdown, EXIF stripping, App Check** — before the first public session, not after.
6. **The voseo strings**, while there are still eight of them.
7. **Attendance history plus its 90-day delete job** — together, or neither.
8. **A screen-reader pass.** The labels are in; whether they read well is untested.
