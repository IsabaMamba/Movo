# Theme

Design tokens for Movo. The visual direction is decided — **thermal**, recorded in
[ADR 0004](../../docs/adr/0004-thermal-visual-direction.md). Both themes are dark; the
switch between Calma and Heatwave is accent intensity, not background.

## Files

| File            | Owns                                                                       |
| --------------- | -------------------------------------------------------------------------- |
| `colors.ts`     | The raw palette and the semantic roles mapped onto it.                     |
| `typography.ts` | Type scale, weights, tracking.                                             |
| `layout.ts`     | Spacing scale, corner radii, minimum touch target.                         |
| `heat.ts`       | The density ramp — the one place warm colour is allowed to mean something. |
| `a11y.ts`       | Accessibility floors expressed as code, plus locale and time zone.         |
| `index.ts`      | The barrel. Import from `@/theme`, never from a file directly.             |

## Rules that are not negotiable

1. **Import from the barrel.** `import { colors, heatColor } from '@/theme'`. Reaching
   into `colors.ts` directly is how a palette hex ends up hard-coded in a component.
2. **Never a raw hex in a component.** If a colour is missing, add a semantic role here.
3. **Heat encodes density and nothing else.** The warm end of the ramp (`heat.ts`) is
   reserved for occupancy. Danger, errors, and destructive actions use
   `colors.semantic.danger`, which is a different red on purpose. Any surface that uses
   heat must also show the scale that decodes it.
4. **`text.disabledOnly` is below AA (4.40:1).** It is legal only on disabled controls,
   which are exempt from the contrast requirement. Helper, hint, and label text goes to
   `text.tertiary` (6.10:1). The long name is the guardrail — an audit found the old
   short name (`text.disabled`) used for helper text on three screens.
5. **Never white on Sun.** `#FFC56B` against white is 1.56:1. Labels on Sun surfaces are
   `palette.deepNavy`.
6. **Type floor is 11px** for body copy, 10px for tracked labels — `minFontSize` in
   `a11y.ts`. Anything smaller does not ship.
7. **Touch targets are 44px.** When a control must look smaller, keep the visual size and
   pad the target with `hitSlopFor(visualSize)`.
8. **Money is formatted, never concatenated.** `priceLabel()` handles the currency's
   decimal convention (CRC, PYG, CLP and COP display zero decimals) and forces
   `narrowSymbol`, because `es-419` otherwise renders `CRC 2,500` instead of `₡2,500`.
   Prices are stored in minor units (`price_minor`), so a component never divides by 100
   itself.
9. **Locale is `es-419`**, not `es-CR`. Movo is built to expand; the copy is neutral Latin
   American Spanish, not Costa Rican `vos`.

## Contrast

Every semantic text role carries its measured ratio in a comment against the surface it is
meant for. If you change a hex, re-measure — the comment is the contract, and a value that
no longer matches its comment is a bug even when it looks fine.
