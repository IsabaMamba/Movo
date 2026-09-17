# Status — 17 September 2026

An honest read of what exists, what has run for real, and what comes next. Update this file when
the answer changes; a status document that lags is worse than none.

**Alejandro — start at [Roadmap](#roadmap). Everything above it is context.**

## What changed since 13 September

| PR  | What                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------- |
| #36 | Cancel and edit a session. `0008` revoked direct `UPDATE` on `activities`; time and venue lock once anyone joins                  |
| #39 | Descubrir showed the session level as the raw enum ("advanced")                                                                   |
| #40 | A recurring session is one card in Descubrir (`0009`), "Otras fechas" in Detalle, filter chips no longer cut in half on phones    |
| #41 | Attendance only around the session (`0010`): check-in from 30 min before start, close-out from the start, re-join clears check-in |

### Migrations

Every file in `supabase/migrations/` appears here, and `npm run check:migrations` fails if one
does not. Applied means applied to the live Supabase project, which no check can verify — that
column is maintained by hand.

| Migration                      | What                                                                                       | Applied |
| ------------------------------ | ------------------------------------------------------------------------------------------ | ------- |
| `0001_schema`                  | Tables, enums and indexes                                                                  | yes     |
| `0002_functions`               | Policy helpers, the counters trigger, participation and series RPCs, `nearby_activities()` | yes     |
| `0003_rls`                     | Row-level security on every table, grants and revokes                                      | yes     |
| `0004_seed_categories`         | Running, hiking and football, with their attribute schemas                                 | yes     |
| `0005_currency`                | `price_minor` and `currency` on venues, sessions and series                                | yes     |
| `0006_seed_venue`              | Parque Metropolitano La Sabana                                                             | yes     |
| `0007_community_owner`         | A group's creator becomes its owner                                                        | yes     |
| `0008_cancel_edit`             | Cancel and edit a session; revoke direct `UPDATE` on `activities`                          | yes     |
| `0009_series_collapse`         | A series is one row in `nearby_activities()`                                               | yes     |
| `0010_attendance_window`       | Check-in from 30 minutes before the start, close-out from the start                        | yes     |
| `0011_notification_read_grant` | Clients may update only `read_at` on notifications                                         | yes     |
| `0012_staff_reports`           | `staff`, `is_staff()`, the report queue and `resolve_report()`                             | yes     |
| `0013_series_mutations`        | `update_series()`, `cancel_series()`; revoke `UPDATE` and `DELETE` on series               | yes     |
| `0014_zones`                   | IGN administrative zones, `locations.district_code`, `zone_heat()`                         | **no**  |

`0011`–`0013` were applied to the live project on 16 September, after #44, #45 and #46 merged.
**`0014` is not applied and carries no data**: it creates the zone schema and the heat read, and
the boundaries are loaded separately — see `scripts/load-zones.mjs`.

The report queue got its first readers on 17 September: two rows inserted into `staff` from the
Supabase panel, by hand, on purpose — no client can grant itself that role.

> This section used to be one sentence: "all ten migrations are applied". It stayed that
> sentence on a branch carrying thirteen — the seventh instance of the defect §B of
> `audit-2026-09-15.md` names. The first attempt at a fix was a script that counted the number
> word in the prose, and it failed the corrected sentence too, because _"ten migrations are
> applied"_ is a true statement about deployment and a false-looking one about the directory.
> A checker cannot read intent. So the count came out of the prose entirely: the table names
> every file, and names are checkable.

## Verified against live data

The 15 September test day ran eight blocks with four accounts (Alejandro Solano, Aguita, Vanesa,
Lee sin), each checked afterwards in the database rather than on screen.

| Path                           | Evidence on the live project                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Sign-up, sign-in, create, join | 7 profiles, sessions from four organizers, joins across accounts                                        |
| Add a venue from the app       | 7 venues, 6 created by users                                                                            |
| Capacity → `full`              | Canchas de fonseca reached 2 of 2 and the trigger set `full`                                            |
| Waitlist and promotion         | Alejandro Solano waited, capacity was raised, he was promoted and a `waitlist_promoted` row was written |
| Edit                           | Vanesa moved an empty session's time and venue, then saw both lock once somebody joined                 |
| Cancel                         | "Corrida" cancelled with a reason; an `activity_cancelled` notification was written                     |
| Check-in and close-out         | Futbol 5 en la sabana closed with Chelsy `attended`                                                     |
| A no-show                      | Canchas de fonseca closed with Vanesa `no_show`                                                         |
| Report                         | `a0850abd` — Vanesa, Pico blanco, "comportamiento"; `dismissed` from `/staff/reportes` on 17 Sep        |
| Groups                         | Mejengueros — Lee sin `owner`, Aguita `member`                                                          |
| Recurring series               | 5K al parque de Tibas, 9 Tuesdays generated                                                             |

**What testing found, and where it went:**

- Check-in written hours ahead, and a close-out before the start → #41.
- A re-join kept the old check-in stamp, so a row read `no_show` with a check-in time → #41.
- Nine cards for one series; chips clipped on phones; "advanced" in English → #39, #40.
- The rows written early on the live project were left as they are. They are test data.

## Not verified

- Anything with a screen reader.
- Mis sesiones rendering every state — checked in code and by participants, not systematically.
- Leaving a group — Aguita is still a member.
- `update_activity()` raising capacity with more than one person waiting.

## Roadmap

Ordered by what blocks what. **P0 blocks the first public session.** P1 is what testing showed the
product needs next. P2 can wait for users.

### P0 — before any stranger uses Movo

**1. Somebody reads the reports.** _Mostly done — one blank left, and it is not a code blank._

`0012` adds a `staff` table with no client grants, `is_staff()`, a `reports_read_staff` policy and
`resolve_report()`, which stamps the reviewer from `auth.uid()`, refuses to reopen a closed report,
and tells the reporter it was looked at. `/staff/reportes` is the queue. A scoped policy also lets
staff open the session a report is about — including a **cancelled** one, which `activities_read`
does not admit and which is exactly the session most likely to be reported.

The loop has now run once end to end on the live project: Vanesa reported, `Lee sin` dismissed
`a0850abd` from `/staff/reportes` with a written reason, `reviewed_by` and `reviewed_at` were
stamped from `auth.uid()`, and a `report_resolved` notification carrying only the report id went
back to Vanesa. Zero reports are open.

The rota is written down — **Report triage in `docs/security.md`: a named first responder, an
evening check, and 24 hours as the ceiling**, measured from `created_at` to `reviewed_at` so the
promise is a query rather than an intention.

Two blanks are left in it, and neither is code:

- **`staff` holds two accounts and both are Kristopher's**, one of them the `Lee sin` test
  account. Alejandro's own account has to go in, and `Lee sin` has to come out — a test account
  should not be able to read every safety report.
- **Acting on a report.** Resolving records a judgement; it does not act on one. Cancelling
  somebody else's session, hiding a profile and blocking an account are three separate powers,
  each needing its own function, test and decision about who holds it.

**2. Deliver notifications.** _Inbox done. Delivery outside the app is not._

`/avisos` reads `notifications`, marks `read_at`, and Descubrir carries an unread count. The two
real rows from the test day — Alejandro Solano's promotion and Aguita's cancellation — are now
reachable by the people they were written for.

`0011` narrows the UPDATE grant to the `read_at` column. 0003 granted the whole row so the inbox
could mark things read, and the policy restricts which row, never which column — so a person could
rewrite the `type` and `payload` of their own notifications. Harmless while nothing read those
columns; not harmless once a delivery function reads them to decide what to send.

Still missing: anything that reaches a person who has not opened Movo. Email depends on custom SMTP
(item 3), Web Push on a service worker and VAPID keys, native push on there being compiled apps.
**`docs/adr/0003` assumes Expo notifications work on web — verify that before relying on it.**
Loosening the edit lock still comes after delivery, not before, and `07_cancel_edit_test.sql` has
to change on purpose when it does rather than break.

**3. Email confirmation back on, with custom SMTP.** It is off to unblock testing. Anyone can
register with an address they do not own.

**4. Storage lockdown, EXIF stripping, App Check.** Supabase buckets are public by default; phone
photos carry GPS; without attestation the backend is an open API. Do these before item 8, which is
the first feature that uploads anything.

**5. Attendance history and its 90-day delete job — together, or neither.** `docs/security.md`
promises the delete job. Until it exists that document describes a control the system does not
have.

**6. Ley 8968 consent text reviewed by local counsel,** and a written basis for the cross-border
transfer to `us-east-1`.

### P1 — what testing showed is missing

**7. Decide the voice.** `docs/product.md` says `tú`; the whole app is `vos`, and every screen added
since #34 made that larger. This is a decision for Kristopher and Alejandro, then one pass.

**8. Profile and account screen.** Display name, photo, sign-out. Sign-out currently lives in the
Descubrir header. Depends on item 4.

**9. Fix and verify venues.** The Pico blanco venue shares its latitude exactly with Parque de la
paz, 17 km away, so its coordinates are almost certainly wrong — and there is no screen to correct
a venue. `locations_update_own` already lets the creator edit an unverified venue; it needs a UI,
and `is_verified` needs somebody allowed to set it.

**10. Manage a series as a series.** A series is one card in Descubrir, but it cannot be edited or
cancelled as a whole — only one date at a time — and Organizar still lists every occurrence
separately. Needs `cancel_series()` / `update_series()` with the same locking rules as `0008`, and
Organizar grouped the way `0009` groups Descubrir.

**11. Sessions nobody closes.** Pico Blanco (8 Sep) and Fut 5 la sabana (14 Sep) have passed and
are still `published`. An automatic close would invent no-shows nobody confirmed, so the first step
is a reminder to the organizer, not a job that closes.

**12. Device location in Descubrir.** It searches from a fixed GAM centre. Needs the permission
prompt and a fallback when it is refused.

**13. Times in 24-hour format.** Cards say "6:00 p. m."; the design and modo solo use "18:00".
`formatSessionTime` in `src/lib/activities.ts`.

**14. Dependabot #37 and #38.** Check the Expo SDK pins before merging.

### P2 — once there are users

- A screen-reader pass (VoiceOver and TalkBack), and line heights that follow OS text scaling.
- Imported sessions from real clubs, `source = 'imported'`, with attribution — the cold-start plan
  in `docs/architecture.md`. Never invented.
- AI proposals. They need attendance data, which now exists but is thin.

## How to work on this

```bash
npm run verify    # prettier + eslint + tsc
npm run db:test   # migrations + RLS + behavioural suite (needs Postgres with PostGIS)
```

- **CI runs on pull requests and on `main`,** not on a pushed branch. Open a draft PR to get the
  SQL suite to run.
- **Apply a migration to the live project deliberately:** `npx supabase@latest db push --linked`
  from a machine where the CLI is logged in and linked, then record it here.
- **A new route fails `tsc` locally** when `.expo/types` was generated before it existed. Delete
  `.expo/types`; the dev server regenerates it. CI has no `.expo`.
- **Check the row exists before reasoning about who can read it.** The create form's silent guard
  cost four days of RLS theories about rows that were never written.
- **Every screen needs a signed-in account to test.** Use your own test accounts; never share
  passwords in chat or commit them.

## Security and legal, outstanding

- Ley 8968 consent text needs local counsel. Health-adjacent data requires separate express written
  consent; sanctions run 5–30 base salaries (roughly ₡2.3 M–₡13.9 M in 2026).
- Cross-border transfer needs a documented basis — a PRODHAB adequacy finding or an applicable
  derogation.
- Storage buckets public by default; EXIF not stripped; no App Check; email confirmation off.

## Secrets — read before touching Supabase

- The **anon key is public by design** and belongs in the client. RLS, not secrecy, is the control.
- The **service-role key bypasses RLS entirely.** It must never appear in the app, in this
  repository, in CI logs, or in a screenshot. If one is ever committed, **rotate it in Supabase
  immediately** — deleting the commit is not enough.
- `.env` is local and git-ignored; `.env.example` lists the variables.
- **Test account passwords were pasted into a chat on 15 September.** Change them.
