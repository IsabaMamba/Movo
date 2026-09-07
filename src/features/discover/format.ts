/** Presentation helpers for the discover list. */

import type { CurrencyCode } from '../../types/database';

/** Metres from the RPC, rendered the way a person would say it. */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 50) * 50} m`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;
}

/**
 * Prices are stored in MINOR units of their own currency (0005_currency.sql),
 * so the amount cannot be rendered without knowing which currency it is in.
 *
 * Free says so rather than showing a zero amount, and whole amounts drop the
 * decimals — ₡5.000 rather than ₡5.000,00 — while $12.50 keeps them.
 */
export function formatPrice(minor: number, currency: CurrencyCode, locale = 'es-CR'): string {
  if (minor <= 0) return 'Gratis';

  let exponent: number;
  try {
    exponent =
      new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
  } catch {
    // The currency_code domain enforces three uppercase letters, not that the
    // code is a real one. An unknown code must not take the whole list down.
    return `${minor / 100} ${currency}`;
  }

  const units = minor / 10 ** exponent;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(units) ? 0 : exponent,
  }).format(units);
}

/**
 * Capacity as a person reads it. `max_participants` is nullable — an
 * uncapped session shows attendance rather than a fraction.
 */
export function formatSpots(joined: number, max: number | null): string {
  if (max === null) return `${joined} van`;
  const left = Math.max(max - joined, 0);
  if (left === 0) return 'Lleno · lista de espera';
  return `${left} de ${max} libres`;
}
