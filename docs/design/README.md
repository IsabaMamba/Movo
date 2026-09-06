# Design

Every design artifact, committed as a self-contained HTML file. Clone the repo, open a
file in a browser — nothing to install, no build step, no link that expires.

These files are the **specification the screens are built against**, not decoration. When a
component disagrees with the field kit, the field kit is right until an ADR says otherwise.

## Screens

| File                  | What it is                                                               | Width |
| --------------------- | ------------------------------------------------------------------------ | ----- |
| `field-kit.html`      | The six input types × five states. **Read this first.**                  | Phone |
| `crear-sesion.html`   | Create a session — the schema-driven form assembling itself per category | Phone |
| `detalle-sesion.html` | Session detail — occupancy, roster, join, the safety affordances         | Phone |
| `descubrir.html`      | Discover — the heat map, filters, empty states with pre-computed counts  | Phone |
| `roles-ia.html`       | Roles, AI-proposed sessions, open sessions, solo mode                    | Phone |

## Reference

| File                     | What it is                                                             |
| ------------------------ | ---------------------------------------------------------------------- |
| `design-system.html`     | Palette, type scale, spacing, heat ramp, contrast table                |
| `estado-general.html`    | Full project state and the accessibility audit, in Spanish             |
| `auditoria-inicial.html` | The original strategy teardown — market, moat, monetization, kill test |

`design-system.html` and `auditoria-inicial.html` are desktop documents; the five screens
are designed at 390 × 844 and verified not to overflow at that width.

## The field kit idea

There is one kit of input types. Every category assembles its own form out of it, driven by
`categories.attribute_schema` (JSON Schema) writing into `activities.attributes` (jsonb).
Adding a sport is a row, not a screen. That is why the kit is specified in states rather
than in screens — a control that only looks right in one context is not a kit component.

## Rules that carry over into code

These are the same rules stated in [`src/theme/README.md`](../../src/theme/README.md); they
are repeated here because a designer opening this folder will not read the TypeScript.

1. **Heat encodes occupancy density and nothing else**, and always with a visible scale.
   Danger uses a deliberately different red. See
   [ADR 0004](../adr/0004-thermal-visual-direction.md).
2. **Both themes are dark.** Calma and Heatwave differ by accent intensity, not background.
   Heatwave is not a light mode.
3. **Never white on Sun** (`#FFC56B`) — 1.56:1. Labels on Sun surfaces are `#0B0F1F`.
4. **`#6E7A91` is disabled-only** (4.40:1, below AA). Helper, hint and label text is
   `#8892A8` (6.10:1). Safety copy — report, block, help — is `#A9B2C3` (8.93:1) and is
   never quieter than body text.
5. **Type floor: 11px** body, 10px for tracked labels.
6. **Touch targets: 44px**, padded with `hitSlop` when the control must look smaller.
7. **Neutral Latin American Spanish.** No `vos`, no regional vocabulary — _partido_, not
   _mejenga_. Movo is built to leave Costa Rica.

## Known gaps

Carried openly rather than quietly:

- **Focus states are not applied** to cards and chips. Blocking for the web build, and more
  so for the organiser console, where a keyboard user is a primary user.
- **`hitSlop` is defined in `src/theme/a11y.ts` but not applied** — chips are still ~30px.
- **Line heights are fixed** and do not respond to OS text scaling.
- **No organiser roster / check-in screen yet.** It is the only screen that produces new
  data, and every number the AI features depend on comes from it.

## Fonts

The pages request Inter and Space Grotesk from Google Fonts and fall back to system UI
fonts offline. Rendering without network is expected and correct — the layout does not
depend on the webfont loading.
