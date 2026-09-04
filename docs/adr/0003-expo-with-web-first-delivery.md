# 0003 — Expo for native, web build first to reach real users

**Status:** Accepted · 2026-09

## Context

The product is intended as a phone app. But at 10–20 focused hours a week, App Store and
Play submission adds two to three weeks of calendar time between finishing a feature and a
real person using it — and the first ninety days depend on getting sessions in front of one
district, not on being in a store.

## Decision

Build in Expo with React Native and TypeScript, as originally specified. Ship the **web
build** (`expo start --web`) first for the pilot district; submit to the stores once the
first district shows retention.

This is a delivery-order decision, not an architecture one. Same codebase either way.

## Consequences

- No fork, no rewrite, no second codebase.
- Web-first also keeps early transactions out of app-store commissions (15–30%).
- Any native-only dependency has to justify itself against losing the web build. Mapbox and
  Expo Notifications both work on web; a native-only mapping SDK would not.
- Chat is deliberately deferred to a WhatsApp deep link. The `messages` table exists for
  when it earns its place.

## Alternatives considered

- **Native-only from day one.** Rejected: two to three weeks of store review before the
  first user, at the stage where feedback matters most.
- **Web-only, permanently.** Rejected: push notifications and home-screen presence are how
  a recurring commitment survives, and those are materially better native.
