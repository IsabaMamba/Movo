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

- **Deny by default.** All grants are revoked from `anon` and `authenticated` at the top of
  `0003_rls.sql`, then handed back per table. A new table without a policy is unreachable.
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

## Required before strangers meet strangers

Not yet built. Each is a blocker for the first public session, not a v2 item.

| Control                       | Why                                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| Identity verification         | Unverified profiles are why nobody will meet at 5 a.m., and the reason women especially won't |
| Group minimum of 3, 1:1 off   | Removes the whole class of one-on-one meeting risk                                            |
| Public, named venues only     | Already structural (`locations.is_public_venue`); needs enforcement in the create flow        |
| In-app reporting with a human | A report nobody reads is theatre                                                              |
| Written incident protocol     | Decide who does what, before the night it is needed                                           |
| App Check / attestation       | Without it the backend is an open API and the user table is enumerable                        |
| EXIF stripping on upload      | Phone photos carry GPS coordinates straight into a stranger's hands                           |
| Locked-down storage buckets   | Supabase buckets are public by default                                                        |

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
