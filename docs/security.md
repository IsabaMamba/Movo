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
  not an address. There is no real-time position and no location history — the columns do
  not exist, which is the only reliable way to not leak them.
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
