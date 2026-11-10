/**
 * What Pasadas keeps after six months (0058).
 *
 * The detail of a past session — who went, who arrived — lasts six months.
 * After that purge_pasadas() folds it into a count per month and deletes the
 * roster. These are those counts, for the line under Pasadas: «En marzo
 * fuiste a 6 sesiones y organizaste 2».
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { toApiError } from './errors';

export interface MonthCount {
  /** yyyy-mm-01 */
  month: string;
  went: number;
  organized: number;
}

export function toMonthCounts(raw: unknown): MonthCount[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const r = item as Record<string, unknown>;
    if (typeof r.month !== 'string') return [];
    const went = typeof r.went === 'number' ? r.went : 0;
    const organized = typeof r.organized === 'number' ? r.organized : 0;
    return [{ month: r.month, went, organized }];
  });
}

export async function fetchMonthlyAttendance(db: SupabaseClient): Promise<MonthCount[]> {
  const { data, error } = await db.rpc('my_monthly_attendance');
  if (error) throw toApiError(error);
  return toMonthCounts(data);
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/**
 * «En marzo fuiste a 6 sesiones y organizaste 2». The year is said only when
 * it is not `currentYear`, so a list that crosses January stays readable.
 */
export function monthLine(m: MonthCount, currentYear: number): string {
  const [y, mo] = m.month.split('-').map(Number);
  const name = MONTHS[(mo ?? 1) - 1] ?? m.month;
  const when = y === currentYear ? `En ${name}` : `En ${name} de ${String(y)}`;
  const went = m.went === 1 ? 'fuiste a 1 sesión' : `fuiste a ${String(m.went)} sesiones`;
  if (m.organized === 0) return `${when} ${went}.`;
  const org = m.organized === 1 ? 'organizaste 1' : `organizaste ${String(m.organized)}`;
  return m.went === 0
    ? `${when} ${org === 'organizaste 1' ? 'organizaste 1 sesión' : `${org} sesiones`}.`
    : `${when} ${went} y ${org}.`;
}

/** Said once under the list, so nobody thinks the older sessions were lost. */
export const RETENTION_NOTE =
  'El detalle de cada sesión se guarda 6 meses. Después queda solo cuántas fueron por mes.';
