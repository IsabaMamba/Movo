/**
 * What a session costs, said the way people say it (0054).
 *
 * «₡1,200 por persona · ₡12,000 entre 10 · entrada al lugar ₡500». The
 * per-person amount is `price_minor` either way; for a split the database
 * computed it from the total, rounded up to a whole unit, so the line never
 * disagrees with itself. The entry fee is paid at the venue, not to the
 * organizer, and «sin confirmar» is said aloud rather than left out.
 *
 * In a series the price is per date, and the line says so.
 */

import { priceLabel } from '../theme';
import type { ActivityPriceUnit, VenueFee } from '../types/database';

export interface Pricing {
  price_minor: number;
  currency: string;
  price_unit: ActivityPriceUnit;
  split_total_minor: number | null;
  split_divisor: number | null;
  venue_fee: VenueFee;
  venue_fee_minor: number | null;
}

/** The pieces, for a screen that lays them out on two lines. */
export function pricingParts(
  p: Pricing,
  opts: { perDate?: boolean } = {},
): {
  main: string;
  details: string[];
} {
  const free = p.price_minor <= 0;
  const each = opts.perDate ? ' por persona, cada fecha' : ' por persona';
  const main = free ? 'Gratis' : `${priceLabel(p.price_minor, p.currency)}${each}`;
  const details: string[] = [];
  if (p.price_unit === 'split' && p.split_total_minor !== null && p.split_divisor !== null) {
    details.push(`${priceLabel(p.split_total_minor, p.currency)} entre ${String(p.split_divisor)}`);
  }
  if (p.venue_fee === 'amount' && p.venue_fee_minor !== null) {
    details.push(`entrada al lugar ${priceLabel(p.venue_fee_minor, p.currency)}`);
  } else if (p.venue_fee === 'unknown') {
    details.push('entrada al lugar sin confirmar');
  }
  return { main, details };
}

/** «₡1,200 por persona · ₡12,000 entre 10 · entrada al lugar ₡500». */
export function pricingLine(p: Pricing, opts: { perDate?: boolean } = {}): string {
  const { main, details } = pricingParts(p, opts);
  return [main, ...details].join(' · ');
}

/** The share a split comes to, rounded up to a whole unit — the same as split_share() in 0054. */
export function splitShare(totalMinor: number, divisor: number): number {
  if (totalMinor <= 0 || divisor < 1) return 0;
  return Math.ceil(totalMinor / divisor / 100) * 100;
}

/** Whole units typed in a field, to minor units; empty or nonsense is 0. */
export function toMinor(typed: string): number {
  const trimmed = typed.trim().replace(/[,\s]/g, '');
  if (trimmed === '') return 0;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

/** Pricing as before 0054, for rows that do not carry the new columns. */
export function withPricingDefaults(
  row: Pick<Pricing, 'price_minor' | 'currency'> & Partial<Pricing>,
): Pricing {
  return {
    price_minor: row.price_minor,
    currency: row.currency,
    price_unit: row.price_unit ?? 'per_person',
    split_total_minor: row.split_total_minor ?? null,
    split_divisor: row.split_divisor ?? null,
    venue_fee: row.venue_fee ?? 'none',
    venue_fee_minor: row.venue_fee_minor ?? null,
  };
}
