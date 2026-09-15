# 0005 — The stack, written down, and when native becomes right

**Status:** Accepted · 2026-09

## Context

A stack was proposed for Movo in September 2026:

> C++, TypeScript & React, JavaScript / TypeScript for logic and background operations.
> HTML / CSS to build the plugin's visual user interface.
> HTML / CSS for web development.
> SwiftUI for iOS apps.
> Jetpack Compose for Android apps.

Three of those lines do not describe Movo, and the fourth would undo it. Rather than leave
the ambiguity to be resolved screen by screen, this ADR records what the stack actually is
and what would have to be true for it to change.

**What does not apply:**

- **C++.** There are zero `.cpp`, `.mm`, `.swift` and `.kt` files in the repository, and
  nothing in the product wants one. Movo's hard parts are a concurrency guarantee inside a
  Postgres function and a radius query on a GiST index. Neither is a C++ problem.
- **"The plugin's visual user interface."** Movo has no plugin. That line is the shape of a
  Figma-plugin description — TypeScript for logic, HTML/CSS for the panel — and it came from
  somewhere else.
- **SwiftUI and Jetpack Compose.** These contradict
  [ADR 0003](0003-expo-with-web-first-delivery.md) and the entire client as it stands.

## Decision

**One codebase. Expo, React Native and TypeScript, with Supabase behind it.** Unchanged from
ADR 0003; stated again here because it was asked.

| Layer                          | What                                                       |
| ------------------------------ | ---------------------------------------------------------- |
| App — iOS, Android, web        | Expo SDK 57, React Native, Expo Router, **TypeScript**     |
| Web build                      | The same codebase through `react-native-web`               |
| Styling                        | `src/theme/` tokens and `StyleSheet` — **not** HTML/CSS    |
| The one place HTML/CSS is real | `src/app/+html.tsx`, the web document shell and focus ring |
| Data layer                     | `@supabase/supabase-js`, typed wrappers in `src/lib/`      |
| Backend                        | Postgres 17 + PostGIS, RLS, `SECURITY DEFINER` RPCs        |
| Backend logic                  | **SQL and PL/pgSQL**, not a server language                |
| CI                             | Prettier, ESLint, `tsc --strict`, and the SQL suite        |

TypeScript is right, and it is doing more work here than "the language we type in": the
schema-driven form is a JSON Schema validated at runtime and typed at compile time, and
`noUncheckedIndexedAccess` is on. React is right. HTML/CSS is right for the one web document
that exists. The rest of the list is not Movo.

**Background operations do not run in JavaScript.** Waitlist promotion, capacity, cancellation
and attendance windows are PL/pgSQL inside transactions, because the invariants are
concurrency invariants and only the database can hold them. `join_activity()` takes
`SELECT … FOR UPDATE` before reading capacity. Moving that logic into a JavaScript worker
would mean reimplementing row locking in application code, which is how double-booking gets
shipped.

## Native: not yet, and here is the trigger

The instinct to do it early is sound — a rewrite at 14 screens is cheaper than at 40. It is
still the wrong move today, for reasons that have nothing to do with SwiftUI being worse.

**What it would cost right now.** `src/features/` is 6,847 lines. Rewritten for two native
platforms that is roughly 14,000 lines of new Swift and Kotlin for zero new features, and the
web build still needs the TypeScript — so three codebases, not two. `src/theme/` would exist
three times, and the next palette change would be three pull requests that can disagree.

**Why now is the worst possible moment.** The safety floor is not finished. Reports only just
got a reader; notifications only just got an inbox and still have no delivery; email
confirmation is off, so anyone can register with an address they do not own; storage buckets
are open and EXIF is not stripped. Every one of those is a P0 in `docs/status.md` and every
one is unaffected by which language draws the screen. Rewriting the client now spends the
whole budget on the layer that is already working, while the layer that can hurt somebody
stays unfinished.

**What we would lose immediately.** The web build is the pilot. It is how a district uses
Movo without waiting on store review, and it is why the first real test day happened at all.
Native means store submission before the next person can try anything.

**The trigger.** Go native when the product needs something the managed workflow genuinely
cannot do — and name which:

1. **Background location** for live "who is here" during a session. Real, and the one feature
   most likely to force this.
2. **Reliable push at scale**, if Expo's service proves insufficient once there is a real
   volume of notifications to send.
3. **Retention that justifies the cost** — a district that keeps coming back, so a rewrite
   defends something instead of speculating.

Until one of those is true and written down, a native rewrite buys polish and pays for it in
the only currency this project is short of, which is weeks.

**If it happens anyway**, do it in this order: prove the pilot on web, keep `src/lib/` and the
RPC surface as the contract (the database does not care what calls it), port one screen to
each platform as a spike, and only then decide. Do not port fourteen screens on the strength
of a plan.

## Consequences

- The stack question is answered in the repository rather than in a chat, and the next person
  to ask gets this file.
- `docs/architecture.md` and this ADR now have to agree. If one changes, both change.
- ADR 0003 stands. This does not supersede it; it restates and bounds it.
- Anything proposing C++, a plugin, or a native rewrite needs a new ADR that names which
  trigger above it satisfies.

## Alternatives considered

- **Adopting the list as given.** Rejected: three of its five lines describe something that is
  not this product, and adopting it verbatim would have put a stack in the docs that the code
  contradicts — which is the failure this repository has already had twice, in
  `docs/security.md` and `docs/status.md`.
- **Going native now, at 14 screens.** Rejected on timing, not on merit. The argument that it
  is cheaper now than later is correct and is why the trigger is written down rather than the
  question closed.
- **Closing the native question permanently.** Rejected: background location is a plausible
  feature and would genuinely force it. An ADR that forbids a thing the product may need is
  an ADR that gets ignored.
