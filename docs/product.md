# Product

What Movo is, who it is for, and the decisions that are already made. Read this before
opening a design file or a migration — most questions that look like design questions were
settled here.

## The problem

Finding an activity is not the hard part. Any city has a dozen listings of things happening
this week. The hard part is knowing whether **anyone will actually be there**, and whether
turning up alone will be uncomfortable.

So Movo is not a directory of events. It is a read on where a city is warm right now — which
sessions have real people committed to them — and a set of guarantees that make showing up
to one of them survivable for someone who knows nobody.

Costa Rica first, one district at a time. Built to expand across Latin America, which is why
the copy is neutral Spanish and money carries a currency code from day one.

## Who it is for

Two audiences that need each other, and one of them is the customer.

**Organisers** are the customer. A run club, a padel group, a hiking collective. They
already have a WhatsApp group and a spreadsheet, and both are failing them: nobody knows who
is actually coming until people arrive. Movo's job is to make attendance legible, and the
organiser is the person who pays for that. See
[ADR 0001](adr/0001-organizer-is-the-primary-customer.md).

**Participants** are the volume. Someone new to a city, someone whose friends stopped
training, someone who wants a Tuesday habit. They do not care about the product's mechanics.
They care whether the session is real, whether anyone will be there, and whether it is safe.

An empty Discover screen fails both. This is why seeding is structural, not a growth hack —
see _Cold start_ below.

## MVP categories

Five, chosen because each has existing organised groups in San José that already meet
regularly and can be seeded:

Running · Cycling · Hiking · Football (_partido_, never _mejenga_) · Padel

Adding a sixth is a row in `categories`, not a release. That is the whole point of the
schema-driven form.

## Core concepts

**Session** (`activities`) — one occurrence, at a time, at a public venue, with someone who
answers. Times are `timestamptz`, never local date plus time.

**Series** (`activity_series`) — the thing a run club actually is: "every Tuesday, 18:00, La
Sabana". Sessions are generated occurrences of it. The recurring commitment is what retains
people; a club represented as N unrelated rows loses that.

**Category** (`categories`) — carries an `attribute_schema` (JSON Schema) that drives the
create form and validates `activities.attributes` (jsonb). One kit of input types; every
category assembles its own form from it.

**Occupancy** — joined against capacity, where capacity is **nullable on purpose**. An
uncapped session still needs a temperature, so `densityOf()` scales it against a fixed
reference of 25 and `occupancyLabel()` gives it a different sentence shape (`"8 van"`, not
`"8 de 12"`). An uncapped session must never read as a full one.

**Waitlist** — ordered, with automatic promotion when someone leaves. Overflow is a normal
state, not an error.

**Check-in** — the only thing that turns an RSVP into attendance. Everything downstream
(attendance prediction, organiser reputation, any AI feature) is built on this one number,
which is why the screen that produces it matters more than any screen that displays it.

## Roles

Three, and the boundary between them is about **who can create new data**, not about
feature access.

| Role          | Granted by                                   | Can                                                                 |
| ------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| **Member**    | Signing up                                   | Discover, join, leave, report                                       |
| **Organiser** | An admin, in-app, requires verified identity | Everything a member can, plus create series and **check people in** |
| **Admin**     | The Movo team, outside the product           | Role assignment, report resolution, moderation                      |

Badges differ by **shape before colour** — admin square, organiser round, member outline —
so the distinction survives greyscale and colour vision deficiency.

What actually separates an organiser is check-in. That permission writes attendance history
about other people, so it needs a verified identity and a human decision. "Advanced
activity types" would have been a cosmetic boundary.

## AI, open sessions, and solo mode

The brief asked for AI-generated sessions with no organiser, no guide, and few rules. That
was rejected as briefed and split into three things, because "nobody is responsible" is not
a feature — it is the absence of the one guarantee the product sells.

**AI proposes, a human approves.** Every AI-originated session carries a named human before
it is visible. Never _publicado por Movo IA_ — a brand cannot greet anyone at a gate, and
the first time someone arrives at an AI-invented session that nobody is running, the product
is finished.

**Sesión abierta** — the AI proposes it; the first person to claim it becomes _responsable_.
This keeps the spontaneity the brief wanted while keeping check-in, and keeps Movo a
platform rather than the organiser of record.

**Modo solo** — an offline map, route and tips for one person. It is the only feature here
that works at zero liquidity, needs no other users, and carries no meeting risk. **Build it
before the AI features.**

**Attendance prediction** is shown as a range with its sample size stated, and says _sin
datos suficientes_ when there is none — which is the honest state today.

**The floor under every session**, however loose: a public venue, a meeting point, and
someone who answers.

## Safety

The threat model is not data theft. Movo holds nothing of financial value. It holds a map of
where specific people will be at specific times, and the adversary is a stalker with a valid
account.

That shapes the product, not just the database:

- Public, named venues only (`locations.is_public_venue`), enforced in the create flow
- Group minimum of three; no one-on-one sessions
- Identity verification before organiser privileges
- Blocking enforced in RLS policy and symmetric, not hidden in the UI
- Reports with a resolution workflow and a human reading them
- `profile_private` (phone, birthdate, emergency contact) never renders on another person's
  screen

`docs/security.md` carries the full control list, the attendance-history constraints, and
the Ley 8968 obligations. Read it before touching anything that stores where a person went.

## Cold start

Discover being empty on day one is the most likely way this fails, and it is not solvable by
marketing. So it is solved in the schema: `activities.source` is `native | imported`, and
imported rows are real, public, already-happening club sessions. `claimed_by` lets the
actual organiser take ownership when they join.

Empty states never say "nothing here". They carry a pre-computed count and an action —
_Ampliar a 10 km — 6_. An empty state that cannot tell you what widening the radius would
find is a dead end.

## Voice

**Neutral Latin American Spanish.** Second person `tú`, not Costa Rican `vos`, and no
regional vocabulary. This costs a little local warmth and buys the ability to launch in
Panamá or Colombia without a copy rewrite. `locale = 'es-419'` in `src/theme/a11y.ts`.

Tone is energetic and direct, and **not gendered**. The "masculine, energetic" line in the
original roles brief was dropped: the highest trust barrier in this product sits with the
audience that framing excludes, and they are the users whose safety concerns shape every
control above.

## Money

Prices are stored in **minor units** (`price_minor`) with an explicit `currency` on
`locations`, `activities` and `activity_series`. `priceLabel()` formats them; nothing
divides by 100 in a component. CRC, PYG, CLP and COP display without decimals.

The column used to be `price_crc`. That name was a border, and renaming it after there was
data in it would have been a far worse migration than doing it now.

## Decisions taken, with the reasoning kept

| Decision                                       | Why                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Organiser is the customer                      | [ADR 0001](adr/0001-organizer-is-the-primary-customer.md)                                                          |
| Participation writes only through RPCs         | [ADR 0002](adr/0002-participation-writes-through-rpcs.md)                                                          |
| Expo, web build shipped first                  | [ADR 0003](adr/0003-expo-with-web-first-delivery.md)                                                               |
| Thermal direction; heat means density          | [ADR 0004](adr/0004-thermal-visual-direction.md)                                                                   |
| Difficulty stored 1–5, shown as three words    | _Suave / Moderada / Exigente_. Must never share vocabulary with `skill`, which describes the person, not the route |
| Routes are a link in v1                        | No polyline drawing. The map is not the product                                                                    |
| Nearby food is one line the organiser types    | Not a Places integration. The value is the recommendation, not the data                                            |
| "Clubes" → "Grupos"                            | _Club_ reads institutional and fee-paying in several target markets                                                |
| Chat deferred to a WhatsApp deep link          | The `messages` table exists for when chat earns its place                                                          |
| Phone is primary; the organiser console is web | Participants are on phones. An organiser setting up a weekly series is at a desk, and check-in rosters are a table |

## Open questions

- **Series horizon is 8 occurrences.** Chosen, not validated. Too short and a club looks
  dormant; too long and cancellations pile up.
- **`claimed_by` needs extending.** Today it means "an imported session taken over by its
  real organiser". It now also has to cover an open session being adopted, and those are not
  quite the same event.
- **Attendance-history tables are designed but not written**, and the 90-day delete job they
  depend on does not exist yet. See `docs/security.md`.
