# 0002 — Participation is written only through SECURITY DEFINER RPCs

**Status:** Accepted · 2026-09

## Context

The natural client implementation of "join this session" is an insert into
`activity_participants`, with the app checking `joined_count < max_participants` first.

That check is a race. Two clients both read `joined_count = max − 1`, both insert, and a
cancha booked for fourteen has fifteen people at it. Row-level security cannot express
"only if capacity remains" — policies see one row, not an aggregate over siblings.

The same problem applies to waitlist ordering and to promotion on cancellation.

## Decision

No client role holds `INSERT`, `UPDATE`, or `DELETE` on `activity_participants`. The only
write paths are `SECURITY DEFINER` functions with `search_path = ''`:

- `join_activity()` — takes `SELECT … FOR UPDATE` on the activity **before** reading
  capacity, then inserts `joined` or `waitlisted` and returns which
- `leave_activity()` — cancels and promotes the head of the waitlist in the same
  transaction
- `check_in()` — organizer-only; sets `attended`
- `close_activity()` — organizer-only; remaining `joined` become `no_show`

Verified in CI with three genuinely concurrent sessions against a two-slot activity:
two joined, one waitlisted, counters correct.

## Consequences

- The client cannot assume success. `joinActivity()` returns the status actually granted,
  and screens must render "en lista de espera" as a distinct outcome.
- Business rules that must hold under concurrency live in SQL, not TypeScript. This is a
  deliberate split, and new rules of that kind belong there too.
- RLS helper predicates are also `SECURITY DEFINER` — a policy on `activity_participants`
  that queries `activity_participants` recurses infinitely; the definer function terminates
  it.
- Slightly more friction to add a participation state. That friction is the point.

## Alternatives considered

- **Client-side check plus a unique constraint.** Prevents duplicates, not overfill.
- **A check constraint on `joined_count`.** Ships today as a backstop, but it raises a
  constraint violation rather than gracefully waitlisting.
- **Serializable isolation.** Correct, but pushes retry logic into every caller.
