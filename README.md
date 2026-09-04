# Movo

**The future for movement.** Group activity discovery for the Greater Metropolitan Area of Costa Rica.

Movo helps people find sports and outdoor sessions happening near them, and gives the
people who _run_ those sessions the tooling they have never had — rosters, attendance,
recurring schedules, and reports they can show a sponsor.

> **Status: pre-alpha.** The database foundation is built and tested. The mobile app is
> not scaffolded yet and the visual direction is still being chosen. Nothing here is
> deployed.

---

## Table of contents

- [Why this exists](#why-this-exists)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Repository structure](#repository-structure)
- [Setup](#setup)
- [Usage](#usage)
- [Database](#database)
- [Testing](#testing)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

---

## Why this exists

Roughly half of Costa Rican adults fall below the WHO minimum for physical activity, and
the fitness culture that _is_ growing is a solitary one — gyms have overtaken football as
the top activity in the GAM, largely because people moved indoors for safety and weather.

Meanwhile a grassroots run-club wave went from under ten participants to over two hundred
and fifty in about eighteen months, coordinated entirely through Instagram and WhatsApp.
Those organizers have sponsors approaching them and no way to count who showed up.

Movo is built around that gap. **The organizer is the primary customer**; the participant
app is what brings their roster along. See
[`docs/adr/0001`](docs/adr/0001-organizer-is-the-primary-customer.md).

## Features

**Shipped in the data layer**

- Recurring session series — a club that meets every Tuesday is one object, not N rows
- Race-free joining with capacity limits and an ordered waitlist
- Automatic waitlist promotion when someone cancels
- Organizer check-in, turning participation into attendance data
- Geographic discovery by radius, backed by PostGIS
- Per-category fields (running, hiking, football) without per-category tables
- Imported sessions, so the map is never empty before supply exists
- Deny-by-default row-level security, blocking, and a report queue with resolution states

**Planned**

- Expo mobile app: discover, session detail, organizer roster
- Push reminders (12 h and 1 h before a session)
- Weekly attendance summary for organizers and sponsors

## Tech stack

| Layer      | Choice                                | Notes                                              |
| ---------- | ------------------------------------- | -------------------------------------------------- |
| Mobile     | React Native + Expo + TypeScript      | Expo also produces the web build from one codebase |
| Backend    | Supabase (Postgres 17, Auth, Storage) | Modular monolith; no microservices                 |
| Geo        | PostGIS `geography(Point, 4326)`      | Metre-accurate radius queries on a GiST index      |
| Maps       | Mapbox                                | Free tier                                          |
| Deployment | Supabase + Expo (EAS)                 | Deliberately not AWS, not Kubernetes               |

## Repository structure

```
.
├── .github/
│   ├── ISSUE_TEMPLATE/       Issue forms (bug, feature)
│   └── workflows/            CI: quality gate + real database suite
├── docs/
│   ├── adr/                  Architecture decision records
│   ├── architecture.md       How the pieces fit together
│   └── security.md           Threat model and Ley 8968 obligations
├── scripts/
│   └── db-test.sh            Applies migrations, runs the SQL suite
├── src/
│   ├── app/                  Expo Router routes (once scaffolded)
│   ├── components/           Shared presentational components
│   ├── features/             Feature-first modules, mirroring the backend
│   ├── lib/                  Supabase client and typed RPC wrappers
│   ├── theme/                Design tokens (pending direction)
│   └── types/                Database row and RPC types
└── supabase/
    ├── migrations/           Numbered, append-only
    └── tests/                Behavioural and RLS assertions
```

`src/features/` mirrors the backend's modules — `activities`, `participation`,
`communities`, `moderation` — so a change usually touches one folder on each side.

## Setup

**Requirements:** Node 20+, the [Supabase CLI](https://supabase.com/docs/guides/cli), and
Docker (for `supabase start`).

```bash
git clone https://github.com/IsabaMamba/Movo.git
cd Movo
npm install
cp .env.example .env        # then fill in your project's URL and anon key
```

Start a local Supabase stack and apply the schema:

```bash
supabase start
npm run db:push
```

> The anon key is public by design — row-level security, not secrecy, is what protects the
> data. The **service-role key bypasses RLS entirely and must never appear in this app or
> in this repository.**

## Usage

| Command             | What it does                                             |
| ------------------- | -------------------------------------------------------- |
| `npm run verify`    | Format check, lint, and typecheck — run before every PR  |
| `npm run lint`      | ESLint                                                   |
| `npm run format`    | Prettier, writing changes                                |
| `npm run typecheck` | TypeScript, no emit                                      |
| `npm run db:push`   | Apply migrations to the linked Supabase project          |
| `npm run db:reset`  | Rebuild the local database from migrations               |
| `npm run db:test`   | Apply migrations to a scratch database and run the suite |

### Calling the API

Participation is never written directly to the table. Capacity and waitlist order are only
correct inside the RPCs, so the client has no `INSERT` grant on `activity_participants` at
all:

```ts
import { joinActivity, checkIn } from '@/lib/activities';

// Returns the status actually granted — render it, don't assume success.
const status = await joinActivity(db, activityId); // 'joined' | 'waitlisted'

// Organizer-only. This call is what creates attendance data.
await checkIn(db, activityId, userId);
```

## Database

Migrations are **numbered and append-only**. An applied migration is never edited — a
correction ships as a new file. Every table has row-level security enabled and at least one
policy; the schema opens by revoking all default grants, so a table added without a policy
is unreachable rather than public.

Full reasoning lives in [`docs/architecture.md`](docs/architecture.md) and the ADRs.

## Testing

CI runs the migration suite against a real Postgres 17 + PostGIS container on every pull
request, including concurrency and RLS assertions. Locally, with a Postgres reachable:

```bash
createdb movo_test
npm run db:test
```

The suite raises on any failed assertion, so a clean exit is a pass. It rolls back and
leaves no data behind.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — system shape and data model
- [`docs/security.md`](docs/security.md) — threat model, RLS rules, Ley 8968 obligations
- [`docs/design-brief.md`](docs/design-brief.md) — the field kit, screens to build, and what the
  schema has already decided for design
- [`docs/adr/`](docs/adr/) — decision records, newest last
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — branches, commits, review

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) first. In short: branch from `main`, use
[Conventional Commits](https://www.conventionalcommits.org/), keep pull requests small
enough to review in one sitting, and make sure `npm run verify` passes.

## Security

This product arranges meetings between people who do not know each other, and it handles
data that Costa Rican **Ley 8968** classifies as sensitive. Both constraints are treated as
launch blockers, not follow-up work — see [`docs/security.md`](docs/security.md).

Report a vulnerability privately through
[GitHub Security Advisories](https://github.com/IsabaMamba/Movo/security/advisories/new),
never in a public issue.

## License

Proprietary — all rights reserved. See [`LICENSE`](LICENSE).
