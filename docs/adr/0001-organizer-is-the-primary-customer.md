# 0001 — The organizer is the primary customer

**Status:** Accepted · 2026-09

## Context

The obvious product is a consumer app: individuals discover activities and join them. That
was the original spec, and it is what almost every competitor in this space builds.

Three findings argued against it as the _business_:

1. **Density, not reach.** The realistic serviceable pool is ~145 K gym-going 18–40s in the
   GAM. At 2% penetration that is fewer than two people per venue per time slot — nobody
   matches. Matching cannot work nationally; it can work in one district.
2. **The competitor is WhatsApp.** Costa Rican run clubs went from under 10 to 250+
   attendees in ~18 months on Instagram and WhatsApp, with no product and no cost. Asking a
   working 250-person group to migrate is asking the organizer to absorb the risk.
3. **Consumer subscription does not close.** ~$27 K/yr at generous assumptions, against
   ~$64 K/yr from 60 organizer or venue accounts at ₡45 K/month.

Meanwhile organizers have sponsors approaching them and no attendance data, no roster, no
waiver, and nothing to invoice against.

## Decision

Build for the organizer. The participant app stays free and is the distribution mechanism —
one organizer brings an entire roster in a single message, which is the only real growth
loop available at this market size.

Concretely, this decides feature priority: rosters, check-in, recurring series, and
attendance reporting rank above anything that only serves an individual participant.

## Consequences

- Check-in is not a nice-to-have. It is the call that creates the asset the business sells,
  which is why `attended` and `no_show` have an RPC that sets them.
- `activity_series` is first-class — organizers manage recurring sessions, not one-offs.
- Attendance history accrues into a switching cost, which is the most realistic moat
  available to us.
- We accept that the consumer app is a cost centre, and we will be tempted to monetize it.
  We should not.

## Alternatives considered

- **Consumer subscription.** Rejected on arithmetic; the market is too small.
- **Transaction fees on paid sessions.** Rejected: SINPE Móvil is free, instant, and in
  ~4.6 M pockets. Any fee is routed around in one message.
- **Coach marketplace.** Rejected: trainers already have reach (Instagram) and payment
  (SINPE). We would supply neither and charge for both.
