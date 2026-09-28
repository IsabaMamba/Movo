# ADR 0007 — Notices leave the app through Web Push, and carry no details

**Date:** 28 September 2026
**Status:** Accepted
**Amends:** ADR 0003, which assumed "Expo Notifications work on web".

## Context

Since `0008` the database writes a notice for every cancellation and waitlist promotion; since
`0022` and `0023` it writes a safety warning when a session would be two people alone and a
reminder when a session is left open. All of them were readable only inside `/avisos`, so they
reached exactly the people who were already looking. `status.md` P0 #2.

ADR 0003 said push would come from Expo Notifications, including on web, and `status.md` asked
for that to be verified before anybody relied on it. It does not hold for remote push: Expo's
push service delivers to Expo push tokens on iOS and Android builds, not to browsers. The pilot
is a web build (ADR 0003's own decision), so Expo push reaches nobody today.

## Decision

1. **Web Push, directly.** A service worker (`public/sw.js`), a VAPID key pair, and
   `PushManager.subscribe()`. It is the standard the browsers implement themselves — Chrome and
   Edge through FCM, Firefox through Mozilla, Safari (including iOS home-screen apps, 16.4+)
   through Apple — with no third-party account in between. Native builds keep
   `device_tokens` and Expo push for when they exist.
2. **Sent by a Supabase Edge Function, triggered by the database.** An `after insert` trigger
   on `notifications` calls `send-push` through `pg_net`, with only the notice's id. The URL
   and a shared secret live in Supabase Vault, the VAPID private key in the function's
   secrets; none of them in this repository. The trigger swallows every failure: a notice
   that cannot be pushed is still written, because it is written inside `cancel_activity()`,
   `suspend_account()` and the rest.
3. **Only push services.** `register_push_subscription()` accepts endpoints on the four known
   push hosts and refuses the rest, and the function checks again before sending. The server
   POSTs to whatever endpoint is stored; an open list would let any user aim it anywhere.
4. **No details in the push.** The notification says «Tienes un aviso nuevo en Movo» and opens
   `/avisos`. The payload is encrypted end to end, but the notification is drawn on a lock
   screen that anybody near the phone can read, and «eres la única persona apuntada a Trote
   en La Sabana» is a location and a time. The detail is one tap away, behind the unlock.
5. **Opt-in, per device, off on sign-out.** Permission is requested only from the switch in
   `/avisos`, never on opening the app. Signing out unregisters the device, and a device
   registered under a second account moves to it.

## Consequences

- Nothing is delivered until three things exist that are account decisions, not code: a VAPID
  key pair, the function deployed with its secrets, and two Vault secrets. `status.md` has the
  steps. Until then the switch does not appear (no public key) and the trigger does nothing.
- One generic sentence is less useful than the real one. Accepted: a person who wants the
  detail on the lock screen is the person least likely to be the one at risk.
- iPhones receive push only once Movo is added to the home screen. That is a limit of Safari,
  said on the switch itself. The web manifest and touch icon it needs exist since 28 September;
  the icon is provisional (`public/icon.svg`) until there is a designed mark.
- Every notice for somebody with a device costs one Edge Function call. At pilot volumes that
  is nothing; at real volume it should batch.

## Alternatives considered

- **Expo push on web.** Not delivered to browsers; see Context.
- **OneSignal or Firebase Cloud Messaging as a service.** A third party holding every
  subscriber and every send, for a problem the browsers already solve. Rejected.
- **Email instead of push.** Needs custom SMTP (P0 #3), which does not exist yet, and an email
  per notice is heavier than a notification. Complementary, not a replacement.
- **The notice's real text in the push.** See decision 4.
