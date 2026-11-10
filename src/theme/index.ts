/**
 * Movo theme.
 *
 * Screens import from here, never from the individual files, so a token can be
 * relocated without touching every call site.
 *
 *   import { color, type, space, radius, heatColor } from '@/theme';
 */

export { color, palette } from './colors';
export type { ColorTokens } from './colors';

export { type, fontFamily } from './typography';
export type { TypeTokens } from './typography';

export { space, radius, size, stroke, limits } from './layout';

export { heatColor, heatStops, densityOf, occupancyLabel, UNCAPPED_REFERENCE } from './heat';
export type { HeatMode } from './heat';

export { minFontSize, hitSlopFor, focusRing, occupancyA11yLabel, locale, timeZone } from './a11y';

/**
 * Difficulty.
 *
 * `activities.difficulty` is stored 1–5 and stays that way — widening the
 * vocabulary later is then a display change, not a migration. But it is SHOWN
 * as three words, because five points of subjective difficulty have no shared
 * meaning between two organisers while three do.
 *
 * These words describe the ROUTE. `skill` (principiante / intermedio /
 * avanzado) describes the PERSON. They must never be confused in copy.
 */
export type DifficultyBand = 'suave' | 'moderada' | 'exigente';

export const difficultyLabel: Record<DifficultyBand, string> = {
  suave: 'Suave',
  moderada: 'Moderada',
  exigente: 'Exigente',
};

export function difficultyBand(stored: number | null): DifficultyBand | null {
  if (stored === null) return null;
  if (stored <= 2) return 'suave';
  if (stored === 3) return 'moderada';
  return 'exigente';
}

/** The value written back when a user picks a band in the create form. */
export const difficultyValue: Record<DifficultyBand, number> = {
  suave: 2,
  moderada: 3,
  exigente: 4,
};

/**
 * Price formatting.
 *
 * Amounts are stored in MINOR units with an ISO-4217 currency alongside, so a
 * session in Panamá or Guatemala is representable without a migration. Costa
 * Rica never quotes céntimos, so CRC renders with no decimals even though the
 * currency nominally has two.
 *
 * Zero is the common case and must read as free, never as ₡0.
 */
const ZERO_DECIMAL_DISPLAY = new Set(['CRC', 'PYG', 'CLP', 'COP']);

export function priceLabel(minorUnits: number, currency = 'CRC'): string {
  if (minorUnits <= 0) return 'Gratis';

  const noDecimals = ZERO_DECIMAL_DISPLAY.has(currency);
  const amount = minorUnits / 100;

  // Whole amounts group thousands with a point, «₡1.200», whatever the
  // device's locale. es-419 writes «₡1,200», and in Costa Rica a comma is the
  // decimal mark: «₡1,2» is how people would read it (Precios v1, 10 Nov).
  if (noDecimals) {
    const symbol =
      new Intl.NumberFormat('es-419', {
        style: 'currency',
        currency,
        currencyDisplay: 'narrowSymbol',
      })
        .formatToParts(0)
        .find((part) => part.type === 'currency')?.value ?? currency;
    const digits = String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${symbol}${digits}`;
  }

  return new Intl.NumberFormat('es-419', {
    style: 'currency',
    currency,
    // Without narrowSymbol, es-419 renders "USD 15.00" instead of "$15.00".
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: noDecimals ? 0 : 2,
    maximumFractionDigits: noDecimals ? 0 : 2,
  }).format(noDecimals ? Math.round(amount) : amount);
}

/** Splitting a court fee between the people who showed up. */
export function pricePerPerson(minorUnits: number, people: number, currency = 'CRC'): string {
  if (minorUnits <= 0) return 'Gratis';
  if (people < 1) return priceLabel(minorUnits, currency);
  return priceLabel(Math.ceil(minorUnits / people), currency);
}
