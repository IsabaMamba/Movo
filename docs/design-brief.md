# Design brief

The database already decides most of what a session **is**. What it can't decide is what any of
it looks like. This document is the handover for that part.

Status at time of writing: schema merged, auth working, Discover functional but unstyled. Create
and detail screens do not exist. The visual direction is undecided.

## The one idea to understand first

Movo does not hard-code a hiking form, a football form and a running form. Each category carries a
description of its own fields **inside the database**, in `categories.attribute_schema`, and the
app builds the form from that description at runtime.

Adding **padel** next year is one row inserted into `categories`. No new screen, no new code, no
App Store release.

That bet only pays off if the design works the same way. So the deliverable is **not three forms**
— it is one kit of input types that every category assembles itself from. Design the kit once and
hiking, football, running and padel all render for free.

The labels already exist, in Costa Rican Spanish, in the database. You are styling them, not
writing them.

## The field kit

Six input types cover all three categories today. Each needs a resting, filled, focused, error and
disabled state.

| Type              | Real examples from the schema                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Number with unit  | `Distancia (km)` 1–100 · `Desnivel positivo (m)` 0–4000 · `Agua recomendada (L)`. Min and max come from the schema, so the control can show its own range.                      |
| Decimal with unit | `Ritmo objetivo (min/km)` 3–12 · `Duración estimada (h)`. Fractional — 6.5 is a normal answer.                                                                                  |
| Single select     | `Formato` 5v5 / 7v7 / 9v9 / 11v11 · `Superficie` sintética / natural / cemento · `Tipo de ruta` calle / trail / pista. Short closed lists — chips or segmented, not a dropdown. |
| Multi select      | `Posiciones que faltan` portero / defensa / medio / delantero. Zero to four selected. Also how `equipment` works.                                                               |
| Toggle            | `Nadie se queda atrás` · `Traer camisa clara y oscura` · `Hay árbitro` · `Incluye transporte`. Several default to on, so the off state has to read as a deliberate choice.      |
| Currency (₡)      | `Costo de cancha (₡ total)` · `Entrada al parque (₡)`. Whole colones, no decimals. Zero means _Gratis_ and should say so rather than showing ₡0.                                |
| Short text        | `Sendero` → "Pico Blanco" · `Enlace a la ruta` · `Punto de encuentro` → "portón norte, junto a la fuente". Max 200 characters.                                                  |

Two fields per category are **required** and the rest are optional — hiking needs distance and
elevation, football needs format and surface. The required ones need to read differently, and the
form should be usable when someone fills only those two and posts.

## Screens, in build order

Each one unblocks the next.

1. **Create a session.** Two parts: the fields every session shares (title, venue, day and time,
   capacity, price, skill level) and then the category-specific block rendered from the kit above.
   This is the screen that turns an empty Discover into a populated one, so it comes first.

2. **Session detail.** The screen that convinces someone to show up. Shows the attributes, the
   venue and meeting point, who is organising, how many are going, and the single action that
   matters: join. Joining has three possible outcomes and all three need a state — _vas_, _estás en
   lista de espera_, or the session is full.

3. **Discover.** It exists and works — live category filters, radius filters, distance per card —
   but it is unstyled. It is also the first thing a stranger sees, so the empty state matters as
   much as the full one.

4. **Groups.** People name their group. _Mejengueros_, _Real Madrid Ticos_, whatever they call
   themselves. The database models this fully — `communities` have names, rules, members, and
   owner / organizer / member roles — and none of it has a screen yet.

5. **Organiser roster and check-in.** The part nobody else gives them: who signed up, who actually
   turned up. This produces the attendance data an organiser can show a sponsor, and it is the
   reason the product exists at all — see [ADR 0001](adr/0001-organizer-is-the-primary-customer.md).

## What the data model has already decided

These are not preferences. Design that ignores them is not buildable without changing the database.

| Constraint                  | What design has to do about it                                                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capacity can be unlimited   | `max_participants` is nullable. An uncapped session cannot show "8 de 12 libres" — it shows how many are going. Both need a treatment.                                                                   |
| Waitlists are ordered       | Full does not mean closed. Someone joining a full session gets a numbered place in the queue and moves up automatically when others cancel.                                                              |
| Some sessions are not ours  | Real club sessions get listed before their organisers ever sign up, so Discover is not empty on day one. These need visible attribution, a link out, and a way for the real organiser to claim it later. |
| Sessions repeat             | A run club is "every Tuesday at 6", not forty unrelated rows. A session can belong to an `activity_series`, and the design should say so rather than looking like a one-off.                             |
| Two names, two visibilities | Display name and avatar are public. Phone number, birthdate and emergency contact live in `profile_private` and must never appear on another person's screen.                                            |
| People can block and report | Both exist in the database and need somewhere to live in the interface. This app puts strangers in a park together — it is not a settings-screen afterthought.                                           |
| Prices are colones          | Whole numbers, no cents. Free is the common case and should look free, not like ₡0.                                                                                                                      |
| Times are absolute          | Stored as instants, displayed in `America/Costa_Rica`. Nothing breaks the day Panamá is added.                                                                                                           |

## Voice

Spanish, Costa Rican, second person _vos_ — the app already says _"¿No tenés cuenta? Registrate"_
and _"Probá ampliar el radio"_. Keep it. Interface English creeping into a Spanish app is the
fastest way to make it feel imported.

Category names come from the database in both languages, so _Senderismo_ and _Fútbol_ are already
correct — do not relabel them in the design.

## Decisions waiting on design

| Decision                    | Why it matters                                                                                                                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The visual direction**    | Three candidates are on the canvas — thermal, avant, colour fields. Nothing else can be built properly until one wins, because tokens written against an undecided direction just get rewritten. Pick one and it becomes an ADR. Blocks everything. |
| **How difficulty reads**    | Stored 1–5. People say "medium" and "hard". Decide the words once — and whether it is five levels or three — because it appears on cards, filters, and the create form.                                                                             |
| **Routes drawn on the map** | Today a route is a _link_ (`route_url`). Drawing the actual shape needs a geometry column and real work. Worth it for running and hiking, but it does not have to be in the first version.                                                          |
| **Nearby food**             | "Which restaurants are close" can be a Places integration or one line the organiser types. The typed version costs nothing and answers the same question for a hike that ends at a soda. The integration costs an API key and ongoing money.        |

## What to hand back

Tokens first — colour, type scale, spacing, corner radius — because those become real files in
`src/theme/` and everything else depends on them. Then the field kit with its states. Then the
three screens in order: create, detail, discover.

Design for the browser first. The app ships as a web build before it reaches either app store, so a
phone-width layout that also holds up on a laptop is the target — see
[ADR 0003](adr/0003-expo-with-web-first-delivery.md).

---

Written against the schema as merged: four migrations, three categories, eight client-facing
functions. Every field name and label quoted here is the real one in `categories.attribute_schema`
and can be searched in `supabase/migrations/0004_seed_categories.sql`.
