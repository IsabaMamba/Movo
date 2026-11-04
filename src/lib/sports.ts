/**
 * Finding a sport among nineteen (Deportes v1 · 3–4, Sesión v2 · 1).
 * Pure, so the picker on the phone and the console's selector agree.
 */

import type { Category, SportFamily } from '../types/database';

export const FAMILY_ORDER: SportFamily[] = [
  'correr',
  'montana',
  'balon',
  'ruedas',
  'entrenar',
  'agua',
];

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** «beis» finds Béisbol, «moun» finds Ciclismo de montaña by its English name. */
export function searchSports<C extends Pick<Category, 'name_es' | 'name_en'>>(
  categories: readonly C[],
  query: string,
): C[] {
  const q = fold(query);
  if (q === '') return [...categories];
  return categories.filter((c) => fold(c.name_es).includes(q) || fold(c.name_en).includes(q));
}

/** The nineteen grouped by family, in the family order of the boards; empty families dropped. */
export function byFamily<C extends Pick<Category, 'family'>>(
  categories: readonly C[],
): { family: SportFamily; sports: C[] }[] {
  return FAMILY_ORDER.map((family) => ({
    family,
    sports: categories.filter((c) => c.family === family),
  })).filter((group) => group.sports.length > 0);
}
