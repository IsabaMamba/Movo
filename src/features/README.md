# Features

Feature-first modules, mirroring the backend's module boundaries so a change usually
touches one folder on each side of the wire.

```
features/
  auth/            sign in, session, profile bootstrap
  activities/      create, edit, detail
  discover/        list + map + filters
  participation/   join, leave, waitlist, saved
  organizer/       roster, check-in, close-out, reports
  communities/     clubs, membership
  moderation/      report, block
```

Each folder owns its screens, hooks, and local components. Anything genuinely shared
moves up to `src/components/` — and only after the second use, not in anticipation of it.
