# Status — 15 September 2026

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

All ten migrations are applied to the live project.

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
| Report                         | `a0850abd` — Vanesa, Pico blanco, "comportamiento", still `open`                                        |
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

**1. Somebody reads the reports.** `a0850abd` has been `open` since the test day and nothing will
ever change that. A safety button whose reports reach nobody is worse than no button. Minimum: an
admin role, a queue screen or a documented dashboard routine, and a response time written in
`docs/security.md`.

**2. Deliver notifications.** `notifications` now receives real rows — promotions and
cancellations — and there is no inbox and no push. Two shipped decisions exist only because of
this: time and venue lock once anyone joins, and every cancellation tells the organizer to write
to people themselves. Build the inbox first (a read over `notifications` plus `read_at`), push
second. Loosening the edit lock comes after push, not before.

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
