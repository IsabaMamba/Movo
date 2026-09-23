# Security and privacy

Two constraints shape this product more than any feature does: it introduces strangers who
then meet in physical space, and it handles data that Costa Rican law classifies as
sensitive. Both are launch blockers, not follow-up work.

## Threat model

The realistic adversaries, in order of how much damage they can do:

1. **Someone who uses the app to find and harm a person.** Consequence is unbounded and
   unrecoverable, and in a country of five million with one national news cycle there is no
   such thing as a quiet incident.
2. **Someone enumerating the user base** — names, photos, neighbourhoods, and schedules are
   a genuinely dangerous package in combination.
3. **A regulator or corporate customer** asking how we handle health data.
4. **Ordinary abuse** — spam sessions, harassment in chat, fake profiles.

Note what is not at the top: data theft for resale. We hold nothing of financial value.
What we hold is a map of where specific people will be at specific times.

## Controls in place

- **Deny by default — for the tables that existed when `0003` ran.** All grants are revoked
  from `anon` and `authenticated` at the top of `0003_rls.sql`, then handed back per table.
  **This does not extend to tables added later.** Supabase also ships
  `alter default privileges in schema public grant all on tables to anon, authenticated`,
  which is still in force, so a table created by a later migration is granted every privilege
  to both roles the moment it exists. `0003`'s revoke covers a set of tables, not the schema.

  This sentence used to read "a new table without a policy is unreachable". It was wrong.
  `staff` in `0012` is the first table added since `0003`, and the test asserting that a
  normal user cannot read it failed — the table was world-readable on creation. **Every
  migration that adds a table must `revoke all` on it explicitly**, and should carry a test
  that says so, because nothing else will notice.

- **Split profiles.** `profiles` is public and minimal; `profile_private` (phone, emergency
  contact, birthdate) is readable only by its owner.
- **No precise location, anywhere.** Venues are public points. Profiles carry a district,
  not an address. There is no real-time position: no column holds where a user is now, which
  is the only reliable way to not leak it.
- **Attendance history is opt-in, coarse, and expiring.** See the section below — this is
  the one place we knowingly hold a pattern of a person's movement, and it is fenced.
- **Participation is RPC-only.** No client role can write `activity_participants`.
- **Blocking is symmetric and enforced in policy**, not in the UI — `is_blocked()` filters
  discovery, chat, and profile reads in both directions.
- **Reports have a resolution workflow** (`status`, `reviewed_by`, `reviewed_at`,
  `action_taken`). An unread report queue is the same as having no reporting at all.
- **Only the Movo team can read the queue**, and only through `resolve_report()`. `staff`
  carries no client grants at all, so who moderates cannot be enumerated from the app; the
  function stamps `reviewed_by` from `auth.uid()` rather than from an argument, so the record
  cannot name somebody who did not do the reviewing. See `0012_staff_reports.sql`.

## Report triage

The one thing on this page that is a habit rather than a constraint, which is why it is the
one most likely to quietly stop happening.

**Who reviews:** Kristopher Isaba Jimenez. Second reviewer: the `Lee sin` test account. Both
were inserted into `staff` by hand on 17 September 2026 — no client can grant that role, which
is the point of it.

The account ids stay out of this file on purpose. This repository is public, and `0012` exists
so that who moderates cannot be enumerated; writing the ids here would hand over exactly what
the table refuses to serve. The names are here because a rota needs a person; the ids are in
`staff`, where only `postgres` can read them.

**Both of those are Kristopher.** `Lee sin` is a test account from the 15 September test day,
not a second person. It holds `staff` because closing report `a0850abd` needed a reviewer who
was not the reporter, and doing so proved the loop end to end: reported by Vanesa, dismissed by
`Lee sin`, `report_resolved` written back to Vanesa. What it does not prove is that anybody is
on call. **This rota contains one human**, and a rota with one human is a schedule of the days
that person happens to be free.

**First thing for Alejandro:** put his own account into `staff`, put his name on the line
above, and take `Lee sin` out — a test account should not outlive testing, least of all one
that can read every safety report. All three are one statement each from the Supabase panel.

**How often:** a check of the open queue **every evening**, plus whenever a report arrives for
a session starting within 48 hours. Naming a first responder is what stops two people each
assuming the other looked.

**Escalation:** if the reviewer cannot act within the response time below, they say so to the
other person the same day. An unactioned report is not allowed to be nobody's.

> **Swapping a name here is a one-line pull request.** What is not negotiable is that a name is
> present: every other control on this page is enforced by the database, and this one is
> enforced by a person remembering.

### Response times

A report is not a support ticket. The clock that matters is the session's start time, not
the report's age — but there is a ceiling either way.

| Situation                                             | Response     |
| ----------------------------------------------------- | ------------ |
| Anything naming a specific person as unsafe           | Same day     |
| Behaviour report about a session in the next 48 hours | Same day     |
| Everything else                                       | **24 hours** |

A behaviour report about a session happening tomorrow cannot wait until the day after. If
nobody can commit to same-day, that is worth knowing before the first public session rather
than during it.

**Twenty-four hours is a ceiling, not a target**, and it is measured from `reports.created_at`
to `reports.reviewed_at` — from the moment somebody reported to the moment `resolve_report()`
ran. Reading a report leaves no trace in the database; only resolving one does. That is what
makes this promise checkable instead of a good intention:

```sql
-- Past the promise, and by how much.
select r.id, r.created_at, now() - r.created_at as age
  from reports r
 where r.status = 'open'
   and r.created_at < now() - interval '24 hours'
 order by r.created_at;

-- How the last thirty days actually went.
select count(*) filter (where r.reviewed_at - r.created_at <= interval '24 hours') as on_time,
       count(*) filter (where r.reviewed_at - r.created_at >  interval '24 hours') as late,
       max(r.reviewed_at - r.created_at)                                           as worst
  from reports r
 where r.reviewed_at is not null
   and r.created_at > now() - interval '30 days';
```

Nothing runs those on a schedule and nothing alerts on them. Until something does, the 24 hours
rests entirely on the evening check above — which is the honest description of any rota with no
pager attached to it.

### Working the queue

`/staff/reportes` in the app, for anyone in `staff`. There is no link to it from anywhere —
`staff` has no client grants, so the app cannot tell whether the viewer is staff, and an
always-visible link would show to everyone. Type the URL.

Failing that, the SQL editor in the Supabase panel runs as `postgres` and bypasses RLS:

```sql
-- The open queue, oldest first. Oldest is most urgent here, not least.
select r.id, r.created_at, r.reason, r.details,
       r.subject_type, r.subject_id, p.display_name as reporta
  from reports r
  join profiles p on p.id = r.reporter_id
 where r.status = 'open'
 order by r.created_at;
```

**Resolving from the panel is a last resort.** `resolve_report()` stamps the reviewer,
refuses to reopen a closed report, and tells the reporter it was looked at. A direct `update`
does none of those, and the reporter hears nothing.

### What resolving does and does not do

Resolving records a judgement. It does not act on one. Acting is a separate power per blast
radius, each with its own function, its own test, and its own decision about who holds it.

**Cancel the reported session — exists (`0019`).** «Cancelar la sesión» in the queue calls
`moderate_cancel_activity(report, note)`, staff only, for an unresolved report about a session
that is still on. In one transaction it cancels the session, tells everybody joined or waiting
that _the Movo team_ cancelled it, tells the organizer the team cancelled it for not following
the community rules, marks the report `actioned` with the note, and tells the reporter it was
reviewed. **Nothing the organizer or the roster receives names the report, its reason or the
note** — in a session of four, "there was a report" names the reporter. The note stays in
`reports.action_taken`. `activities.cancelled_by_staff` lets the app say who cancelled without
putting the team's words in `cancel_reason`, which it shows as the organizer's. One occurrence
of a series only; the rest of the series is untouched.

**Suspend an account — exists (`0020`).** «Suspender cuenta» in the queue calls
`suspend_account(report, note, ends_at)`, staff only, for an unresolved report about a person, a
session (→ its organizer) or a message (→ its author). A group report points at nobody and is
refused, as is a staff account (take it out of `staff` first) and one already suspended. The
reviewer picks 7 days, 30 days or no end; a suspension with an end simply stops applying.

While it is in force the account **cannot create a session or series, join one, write in a
chat, open or join a group, or add or edit a venue** — refused by a `BEFORE` trigger on each of
those tables, which also catches the `SECURITY DEFINER` paths that bypass RLS. **Nobody but the
person and staff sees their profile or their messages** (restrictive policies). They can still
sign in, leave, block, read their notices and **report**: a suspended person can still be the
one in danger. The app shows them a suspension screen with the end date and nothing else.

Suspending also clears their calendar in the same transaction: their future sessions are
cancelled as `0019` cancels one, their series stop, and their places in other people's sessions
are given up with the waitlist promoted. The person is told the account is suspended and until
when — never why, never that there was a report. The note is in `suspensions.note` and
`reports.action_taken`, both staff-only.

`/staff/suspensiones` lists what is in force and lifts it with a note. **Lifting restores the
account, not the calendar.** `is_suspended_id()` is executable by no client role, so nobody can
ask whether an arbitrary account is suspended; hiding a profile does, inherently, tell people who
could see it that it is gone.

Neither power touches sign-in: a suspended account keeps its session and its tokens. Banning at
the auth layer (`auth.users.banned_until`) would need the service key from a server, which Movo
does not have.

The organizer notice cites "las normas de la comunidad". **They are at `/normas`**
(`src/features/rules/rules.ts`, versioned by `RULES_VERSION`): public, readable without an
account, linked from sign-up, the report sheet, the roster of a session the team cancelled and
the suspension screen — which lets a suspended person through to that one route. They promise
only what `0019` and `0020` do, and the suspension lengths are read from `SUSPENSION_LENGTHS`
so the text cannot drift from the queue's buttons. **A change of substance is a new
`RULES_VERSION`.** The minimum age is 18, decided 22 September 2026, and sign-up says so — **but nothing checks
it**: sign-up asks for no birthdate, so the rule rests on the person's word and on suspending an
account the team learns is a minor's. Still undecided and deliberately not in the text: a way to
ask the team to reconsider a decision — there is no contact channel yet to point at.

## Required before strangers meet strangers

Not yet built. Each is a blocker for the first public session, not a v2 item.

| Control                       | Why                                                                                                                                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity verification         | Unverified profiles are why nobody will meet at 5 a.m., and the reason women especially won't                                                                                                                                                |
| Group minimum of 3, 1:1 off   | Removes the whole class of one-on-one meeting risk                                                                                                                                                                                           |
| Public, named venues only     | Already structural (`locations.is_public_venue`); needs enforcement in the create flow                                                                                                                                                       |
| In-app reporting with a human | A report nobody reads is theatre. Queue, reader, named rota, cancelling a reported session, suspending an account and the written community rules (`/normas`) exist — see Report triage above. What is missing is a way to appeal a decision |
| Written incident protocol     | Decide who does what, before the night it is needed                                                                                                                                                                                          |
| App Check / attestation       | Without it the backend is an open API and the user table is enumerable                                                                                                                                                                       |
| EXIF stripping on upload      | Phone photos carry GPS coordinates straight into a stranger's hands                                                                                                                                                                          |
| Locked-down storage buckets   | Supabase buckets are public by default                                                                                                                                                                                                       |

## Attendance history

The original position in this document was that location history should not exist, because
a column that does not exist cannot leak. That position was overruled by a product
decision: without a record of where a user has actually gone, recommendations cannot get
better than a filter, and "sessions near you, in things you already do" is the feature.

The decision stands, but the shape of it is the mitigation, and none of the following is
optional:

- **Opt-in, off by default.** No consent flow that a user can complete without reading it,
  and no dark pattern that treats a skip as a yes. A user who never opens the setting has
  no history.
- **District and time band, never a point and never a timestamp.** We store "Escazú,
  weekday evening", not a coordinate and not `19:04`. The recommendation engine does not
  need more, and the resolution we do not store is resolution that cannot be subpoenaed,
  breached, or handed to a stalker.
- **Ninety-day window.** Rows older than that are deleted by a scheduled job, not marked
  inactive. The job's absence is a bug of the same severity as a missing RLS policy.
- **Visible, one-tap delete.** The history is shown to its owner in plain language, and
  clearing it clears it — including the derived recommendation weights, which is the part
  that is easy to forget and that makes a "deleted" history still legible.
- **Owner-read only, and no aggregate that resolves to one person.** Policy-enforced. No
  admin screen, no export, and no "users who go to X also go to Y" surface computed over a
  district small enough that Y identifies somebody.

**As built in `0021`:**

- Consent is a row in `attendance_history_consent`, with the version of the notice shown on
  `/historial`. No row, no history; nothing is backfilled from before it.
- A row is written by a trigger when `check_in()` marks somebody `attended` — never for a
  `no_show`, and never for a venue that resolves to no distrito. It holds `district_code`,
  `category_id`, `is_weekend`, a `time_band` (madrugada / mañana / tarde / noche, Costa Rica
  time) and `week_of`, the Monday of the session's week. No activity id: it would lead back to
  the venue and the minute. The week is the only date, because the delete job needs one.
- `purge_attendance_history()` deletes rows whose week began more than 90 days ago — up to six
  days early, never late — nightly on pg_cron (03:17 Costa Rica). The read policy applies the
  same window, so a missed night never shows more than was promised.
- `clear_attendance_history()` empties it and leaves it on; `set_attendance_history(false)`
  empties it and turns it off. The screen asks once before either — the only departure from
  "one tap", because both are irreversible. No derived weights exist yet; when they do, both
  functions must clear them.

The threat model at the top of this document is a stalker with an account. Attendance
history is the single dataset in Movo that would help one, so it is the dataset with the
lowest resolution, the shortest life, and the loudest off switch. If a future feature wants
finer data than this, it needs an ADR and a reason better than "recommendations would
improve".

## Ley 8968

Costa Rica's data protection law classifies **health data as sensitive** and requires
express, written consent for it — an unsigned digital acknowledgment does not suffice.
Weight, injuries, goals, heart rate and training history all qualify. Improper processing of
sensitive data is a serious or very serious infraction, carrying 5–30 base salaries
(roughly ₡2.3 M–₡13.9 M in 2026).

What follows for us:

- **Collect the minimum.** A sport, a level, and availability. Not a body-fat percentage.
  The cheapest compliance strategy is not holding the data.
- **Granular, separate, explicit consent in Spanish** for anything health-adjacent — never
  bundled into a single "accept terms" checkbox.
- **A written privacy notice and a data map.** Both in Spanish.
- **Cross-border transfer needs a basis.** Personal data may leave Costa Rica only under a
  PRODHAB adequacy finding or an applicable derogation. Pick a defensible Supabase region
  and document the basis before launch.
- **Get the consent language reviewed by local counsel.** A few hours is cheap against the
  sanction range.

This document is engineering guidance, not legal advice.

## Secrets

- The **anon key is public by design** and belongs in the client. RLS, not secrecy, is the
  control.
- The **service-role key bypasses RLS entirely.** It must never appear in the app, in this
  repository, in CI logs, or in a screenshot. If one is ever committed, rotate it in
  Supabase immediately — removing the commit is not enough.
- Anything shipped to a device is public. Third-party keys, admin endpoints and webhook URLs
  stay server-side in Edge Functions.

## Reporting a vulnerability

Privately, through
[GitHub Security Advisories](https://github.com/IsabaMamba/Movo/security/advisories/new).
Never in a public issue.
