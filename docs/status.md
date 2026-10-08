# Status — 28 September 2026

An honest read of what exists, what has run for real, and what comes next. Update this file when
the answer changes; a status document that lags is worse than none.

**Alejandro — start at [Roadmap](#roadmap). Everything above it is context.**

## What changed since 17 September

Documentation-only PRs (`docs(status)` after each migration) are left out.

| PR      | What                                                                                                                        |
| ------- | --------------------------------------------------------------------------------------------------------------------------- |
| #49–#58 | Heat by administrative zone (`0014`–`0017`): zones seeded from OpenStreetMap, the week's heat and the real map in Descubrir |
| #52     | The voice gate caught voseo it had been passing as clean                                                                    |
| #61     | Pico Blanco moved to the Escazú trailhead (`0018`)                                                                          |
| #62     | `LICENSE` carves out the OpenStreetMap data                                                                                 |
| #63     | The edit screen says why time and venue lock                                                                                |
| #64     | Staff can cancel a reported session (`0019`)                                                                                |
| #66     | Staff can suspend an account (`0020`): writes blocked, profile hidden, calendar cleared, suspension screen                  |
| #68     | Opt-in attendance history and its 90-day purge on pg_cron (`0021`), `/historial`                                            |
| #70     | The community rules at `/normas`, public; minimum age 18; no alcohol or drugs                                               |
| #73     | A session with one person joined warns both, from 24 h before (`0022`)                                                      |
| #75     | The organizer is reminded once to close an ended session (`0023`)                                                           |
| #76     | Session times on the 24-hour clock                                                                                          |
| #78     | Manage a series as a series: `/organizar/serie/[id]` edits or cancels it whole; Organizar shows one card per series         |
| #79     | «Cerca de mí» in Descubrir: device location on request, rounded to ~1 km, stored nowhere                                    |
| #80     | Security: `0024` column grants — nobody can verify themselves or their venue, or make a venue private                       |
| #81     | Mi cuenta: name, sign-out moved off Descubrir                                                                               |
| #82     | Mis lugares: typed district next to the one the map resolves, and correcting an unverified venue                            |
| #60–#72 | Dependencies: vitest 5, supabase-js 2.117.1, prettier, eslint, typescript-eslint, `@types/node`                             |

### Migrations

Every file in `supabase/migrations/` appears here, and `npm run check:migrations` fails if one
does not. Applied means applied to the live Supabase project, which no check can verify — that
column is maintained by hand.

| Migration                      | What                                                                                                                                                                  | Applied |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `0001_schema`                  | Tables, enums and indexes                                                                                                                                             | yes     |
| `0002_functions`               | Policy helpers, the counters trigger, participation and series RPCs, `nearby_activities()`                                                                            | yes     |
| `0003_rls`                     | Row-level security on every table, grants and revokes                                                                                                                 | yes     |
| `0004_seed_categories`         | Running, hiking and football, with their attribute schemas                                                                                                            | yes     |
| `0005_currency`                | `price_minor` and `currency` on venues, sessions and series                                                                                                           | yes     |
| `0006_seed_venue`              | Parque Metropolitano La Sabana                                                                                                                                        | yes     |
| `0007_community_owner`         | A group's creator becomes its owner                                                                                                                                   | yes     |
| `0008_cancel_edit`             | Cancel and edit a session; revoke direct `UPDATE` on `activities`                                                                                                     | yes     |
| `0009_series_collapse`         | A series is one row in `nearby_activities()`                                                                                                                          | yes     |
| `0010_attendance_window`       | Check-in from 30 minutes before the start, close-out from the start                                                                                                   | yes     |
| `0011_notification_read_grant` | Clients may update only `read_at` on notifications                                                                                                                    | yes     |
| `0012_staff_reports`           | `staff`, `is_staff()`, the report queue and `resolve_report()`                                                                                                        | yes     |
| `0013_series_mutations`        | `update_series()`, `cancel_series()`; revoke `UPDATE` and `DELETE` on series                                                                                          | yes     |
| `0014_zones`                   | IGN administrative zones, `locations.district_code`, `zone_heat()`                                                                                                    | yes     |
| `0015_zone_heat_blocking`      | `zone_heat()` filters `is_blocked()`; the zone trigger places an unplaced venue                                                                                       | yes     |
| `0016_seed_zones`              | 7 / 84 / 494 zones from OpenStreetMap (ODbL), and the venues that predate them placed                                                                                 | yes     |
| `0017_zone_outlines`           | `zone_outlines()` — simplified zone shapes for one viewport, so a client can draw the map                                                                             | yes     |
| `0018_pico_blanco_venue`       | Data fix: moves the Pico Blanco venue from Colón, Mora to the trailhead in San Antonio de Escazú                                                                      | yes     |
| `0019_moderate_cancel`         | `moderate_cancel_activity()` — staff cancel a reported session; `activities.cancelled_by_staff`                                                                       | yes     |
| `0020_suspensions`             | `suspensions`, `suspend_account()`, `lift_suspension()`, `my_suspension()`; write triggers, hidden profiles                                                           | yes     |
| `0021_attendance_history`      | Opt-in attendance history (district, sport, time band, week), owner-only; the 90-day purge on pg_cron                                                                 | yes     |
| `0022_solo_session_warning`    | `warn_solo_sessions()` every 15 min on pg_cron: a session with one person joined, inside 24 h, warns both                                                             | yes     |
| `0023_close_reminder`          | `remind_unclosed_sessions()` hourly on pg_cron: one reminder to the organizer an hour after an unclosed session ends                                                  | yes     |
| `0024_verification_columns`    | Column grants on `profiles` and `locations`: nobody can verify themselves or their venue, make a venue private, or rewrite its district                               | yes     |
| `0025_profile_visibility`      | `profile_visible()`: a profile is readable only by its owner, people sharing a session or group, staff — or anybody, for a public organizer                           | yes     |
| `0026_web_push`                | `push_subscriptions`, `register_push_subscription()` (push hosts only), and a trigger that asks the `send-push` Edge Function to deliver each notice                  | yes     |
| `0027_verify_venues`           | `verify_location()` / `unverify_location()`, staff only, with a note; `verified_by`, `verified_at`, `verified_note` on the venue                                      | yes     |
| `0028_drop_device_tokens`      | Drops `device_tokens`: unused since Web Push replaced Expo push (ADR 0007), and client-writable                                                                       | yes     |
| `0029_delete_account`          | `delete_my_account()` and `export_my_data()`; messages keep no author, reports keep no reporter; fixes `reporter_id` `not null` vs `set null`                         | yes     |
| `0030_consents`                | `consents` — an append-only log of grants and withdrawals with the text version (rules at sign-up, location, push, attendance history); `record_consent()`            | yes     |
| `0031_minimum_age`             | `handle_new_user()` refuses a declared date of birth under 18, impossible or malformed; stores it in `profile_private.birthdate`, which loses its client update grant | yes     |

`0011`–`0013` were applied to the live project on 16 September, after #44, #45 and #46 merged.
`0014` and `0015` were applied on 19 September. Verified as `anon` afterwards: `zone_heat`,
`resolve_zone` and `zones` all refuse with `42501`, and `locations` still reads.

**`0016` seeds the zones from OpenStreetMap, not the IGN.** The IGN layer
(`IGN_5_CO:limitedistrital_5k`, edition 2026-04-10) is authoritative, but the
[SNIT conditions of use](https://www.snitcr.go.cr/snit_condiciones) do not authorise commercial
use of the information, direct or derived. OpenStreetMap is ODbL, which does, with attribution.
Against the IGN: 494 of 494 codes after three corrections, country area within 0.04 %, every
cantón within 1 %; twelve districts differ by more than 5 %, borders moved between neighbours of
one cantón. The detail is in the header of `scripts/fetch-osm-zones.mjs`.

Three consequences to keep:

- **Attribution is a condition, not a courtesy.** Anything that draws the zones must show "©
  colaboradores de OpenStreetMap". The heat band in Descubrir (#56, #57) does, in
  `HeatBand.tsx`; a new screen that draws them has to as well.
- **`0016` is ODbL, not under `LICENSE`.** `NOTICE.md` says so, and since #62 `LICENSE` says so
  too.
- **Provenance is not settled.** OSM's lines match the IGN's almost exactly, which suggests they
  were traced from it, and the OSM wiki records no permission from the IGN. Whether licensed
  OSM data carries the upstream restriction is a question for counsel — the same question as the
  IGN one, so ask it once.

`0016` was applied on 19 September; its own check confirmed 7 / 84 / 494 before finishing.
All seven venues now carry a `district_code`, `zones` and `zone_heat` still refuse `anon`, and
`zone_heat()` read with the service role returns heat for the next 30 days — in exactly two
zones, which are the two suspect coordinates below. On today's data the map would light up
Heredia and Mora for sessions meant to be in Tibás and Escazú.

Three venues resolve to a different district than the one typed for them — Pico Blanco (Colón,
Mora, typed Escazú), Canchas de Fonseca (San Juan, Tibás, typed Moravia) and Parque de la
democracia (Ulloa, Heredia, typed Tibás). Pico Blanco was fixed on 21 September by `0018`: it now sits at the trailhead on Calle del Llano
and resolves to 10202 San Antonio, Escazú. The other two need somebody who knows the places.

The report queue got its first readers on 17 September: two rows inserted into `staff` from the
Supabase panel, by hand, on purpose — no client can grant itself that role.

`0021`'s purge has run every night since 23 September, all `succeeded`. `0023` was applied on 28
September: `remind-unclosed-sessions`, active, hourly at minute 5; no client can run it. Its first run, at 19:05 UTC, `succeeded` and sent seven
reminders to four organizers; nothing was left due. `0024` was applied on 28 September after #80
merged; checked afterwards as `authenticated`: cannot update `profiles.is_verified`, cannot insert or
update `locations.is_verified`, `is_public_venue` or `district_code`; can still rename themselves,
create a venue and move their own. `0025` was applied the same evening: with the anon key alone,
`/rest/v1/profiles` went from all seven profiles to four — exactly the people who organize a public
session. Descubrir and a session's organizer still load without signing in. `0026` was applied on 28 September: `pg_net` is installed, Vault is present, the
`notifications_push` trigger exists, clients can register only through the function and it
refuses a non-push endpoint. **No push secrets are in Vault yet**, so the trigger does nothing
until the three steps under item 2 are done. `0027` was applied the same evening: `verify_location()` and
`unverify_location()` exist, anon cannot call them, and no client can write `is_verified` or
`verified_by`. Six of seven venues are still unverified — verifying them is a job for
`/staff/lugares`, not a migration. `0028` was applied on 7 October: the live
`device_tokens` had zero rows, and afterwards `to_regclass` finds no such table while
`push_subscriptions` is intact. `0029` was applied on 8 October: `delete_my_account()` and
`export_my_data()` exist, executable by `authenticated` and not by `anon`, and
`reports.reporter_id` and `messages.author_id` are nullable. Nobody has deleted an account yet. `0030` was applied the same day: `consents`
exists with no client write grant, `record_consent()` is executable by `authenticated` and not by
`anon`, the attendance-history trigger is in place, and `handle_new_user()` records
`rules_version`. The log started empty: nobody had attendance history on, and the seven
existing accounts have no `rules` row. `0031` was applied the same day: `handle_new_user()`
checks the date of birth, `profile_private.birthdate` has no client update grant while `locale`
keeps one, and no existing account has a date of birth. `0022` was applied on 28
September: `cron.job` holds `warn-solo-sessions`, active, every 15 minutes; no client can run
`warn_solo_sessions()` or set `solo_warned_at`; its first run at 18:00 UTC `succeeded`. No live
session was due a warning at that moment, so **nobody has received one yet** — the first real
warning is still to be seen in an inbox.

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

**1. Somebody reads the reports, and can act on them.** _Code done. What is left is not code._

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

What is left:

- **`staff` holds two accounts and both are Kristopher's**, one of them the `Lee sin` test
  account. Alejandro's own account has to go in, and `Lee sin` has to come out — a test account
  should not be able to read every safety report.
- **Appealing a decision.** Staff can cancel a reported session (`0019`) and suspend an account,
  which also hides its profile (`0020`), and `/normas` says what both mean. What the rules cannot
  yet say is how to ask the team to reconsider: there is no contact channel. An address, once
  there is one, is a line in `src/features/rules/rules.ts` and a new `RULES_VERSION`.

**2. Deliver notifications.** _Web Push built (`0026`, ADR 0007); it delivers nothing until the
three account steps below are done. Email still waits on item 3._

`/avisos` reads `notifications`, marks `read_at`, and Descubrir carries an unread count. The two
real rows from the test day — Alejandro Solano's promotion and Aguita's cancellation — are now
reachable by the people they were written for.

`0011` narrows the UPDATE grant to the `read_at` column. 0003 granted the whole row so the inbox
could mark things read, and the policy restricts which row, never which column — so a person could
rewrite the `type` and `payload` of their own notifications. Harmless while nothing read those
columns; not harmless once a delivery function reads them to decide what to send.

ADR 0003 assumed Expo notifications work on web. They do not for remote push: Expo's service
delivers to native builds only. ADR 0007 replaces it for the web with Web Push — a service worker,
a VAPID key pair, and the `send-push` Edge Function, called by a trigger on `notifications`. The
push says «Tienes un aviso nuevo en Movo» and nothing else; the switch is in `/avisos`; signing
out turns the device off.

**To turn it on** (all three, in this order; none of it goes in the repository):

1. Generate the keys: `npx web-push generate-vapid-keys`. Put the public one in
   `EXPO_PUBLIC_VAPID_PUBLIC_KEY` for the web build. Until it is set, the switch does not appear.
2. Deploy the function and its secrets:
   `npx supabase@latest secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:… PUSH_FUNCTION_SECRET=…`
   then `npx supabase@latest functions deploy send-push --no-verify-jwt`. `PUSH_FUNCTION_SECRET`
   is any long random string.
3. In the Supabase SQL editor, store where the trigger should call and the same secret:
   `select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-push', 'push_function_url');`
   `select vault.create_secret('<the same PUSH_FUNCTION_SECRET>', 'push_function_secret');`

Until step 3 the trigger does nothing, by design. Native push still waits for compiled apps.

On iPhone, push arrives only after Movo is added to the home screen. `public/manifest.webmanifest`
and the touch icon make that possible. **The icon is provisional** — an M drawn from the palette,
because no mark has been designed. To replace it, edit `public/icon.svg` and run
`node scripts/render-icons.mjs`; `src/theme/manifest.test.ts` checks every size the manifest claims.
Loosening the edit lock still comes after delivery, not before, and `07_cancel_edit_test.sql` has
to change on purpose when it does rather than break.

**3. Email confirmation back on, with custom SMTP.** It is off to unblock testing. Anyone can
register with an address they do not own.

**4. Storage lockdown, EXIF stripping, App Check.** On 28 September the live project had **no
storage buckets at all**, so there is nothing to lock down yet — but a bucket is public by default
the moment one is created, and phone photos carry GPS. Both belong in the same PR as the first
upload (item 8), not after it.

"App Check" was the wrong tool for what this item feared. On 28 September the public anon key
listed every profile; attestation cannot stop that, because the key is meant to be public. `0025`
closes it in RLS instead. What is left of the item is a captcha on sign-up (Supabase Auth supports
Cloudflare Turnstile; it needs a site key, which is an account decision) and reviewing the auth rate
limits.

**5. Attendance history and its 90-day delete job — together, or neither.** _Built in `0021`,
applied on 22 September._ Opt-in from `/historial` (linked from Mis sesiones); a check-in writes district,
sport, weekday/weekend and time band, dated to the week, and nothing else. Owner-read only.
`purge_attendance_history()` deletes past 90 days and runs nightly on pg_cron.

CI has no pg_cron, so it tests the purge function and never the schedule. On the live project,
checked after `db push` on 22 September: `cron.job` holds `purge-attendance-history`, active,
`17 9 * * *`; `anon` cannot read the history or call `set_attendance_history()`, and
`authenticated` can neither insert rows nor run the purge. The job has run every night since 23
September, all `succeeded`. The consent text is part of item 6 — counsel should read it with the
rest.

**6. Ley 8968 consent text reviewed by local counsel,** and a written basis for the cross-border
transfer to `us-east-1`.

### P1 — what testing showed is missing

**7. Decide the voice.** _Done._ `tú`, neutral Latin American Spanish (`docs/product.md`), and
`npm run check:voice` fails CI on voseo.

**8. Profile and account screen.** _Done except the photo._ `/cuenta` (#81) edits the name and
signs out. The photo waits for item 4; `profiles.avatar_url` has no client grant until it lands.

**9. Fix and verify venues.** _Correction screen done (#82); staff verification built (`0027`, `/staff/lugares`); two venues still to fix._
`/lugares` shows a creator the typed district next to the resolved one and corrects an unverified
venue. Pico Blanco was moved by `0018`; Canchas de Fonseca and Parque de la
democracia still resolve to a different district than the one typed for them (see above), and
there is no screen to correct a venue. `locations_update_own` already lets the creator edit an unverified venue; it needs a UI,
and `is_verified` needs somebody allowed to set it.

**10. Manage a series as a series.** _Done (#78)._ `/organizar/serie/[id]` calls `update_series()`
and `cancel_series()`, and Organizar shows a series as one card at its next date.

**11. Sessions nobody closes.** _Reminder built in `0023`._ On 28 September seven sessions had
passed and were still `published`, the oldest from 8 September. An automatic close would invent
no-shows nobody confirmed, so `remind_unclosed_sessions()` tells the organizer once, an hour
after the end, and the inbox opens the roster. Sessions that ended more than 30 days ago are not
reminded.

**12. Device location in Descubrir.** _Done (#79)._ «Cerca de mí» asks only when tapped, rounds to two
decimals (~1 km) before sending, stores nothing, and falls back to the GAM when refused. Native
builds are unverified: there are none yet.

**13. Times in 24-hour format.** _Done._ `formatSessionTime` now says "18:00" and "05:30", like the
design, modo solo and the edit form; `src/lib/activities.test.ts` holds it there.

**14. Dependabot.** _Done for now._ #37, #38, #60 (vitest 5), #71 and #72 are merged; the Expo SDK
pins were not touched.

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
