/**
 * Every zone at every level, for the team's «cancelar por alerta» (0041).
 * A CNE alert is declared for an area — often a cantón or a provincia — and
 * cancel_water_sessions_in_zone() takes any of the three, by code prefix.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { toApiError } from './errors';

export type ZoneKind = 'provincia' | 'canton' | 'distrito';

export interface ZoneOption {
  code: string;
  kind: ZoneKind;
  /** «Cantón de Tibás · San José». */
  label: string;
  /** Lower-case, no accents, for searching. */
  key: string;
}

interface ZoneRow {
  code: string;
  kind: ZoneKind;
  name: string;
  parent_code: string | null;
}

const KIND_WORD: Record<ZoneKind, string> = {
  provincia: 'Provincia de',
  canton: 'Cantón de',
  distrito: 'Distrito de',
};

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function zoneOptions(rows: readonly ZoneRow[]): ZoneOption[] {
  const byCode = new Map(rows.map((r) => [r.code, r]));
  return rows
    .map((r) => {
      const parent = r.parent_code ? byCode.get(r.parent_code) : undefined;
      const label = `${KIND_WORD[r.kind]} ${r.name}${parent ? ` · ${parent.name}` : ''}`;
      return { code: r.code, kind: r.kind, label, key: fold(`${r.name} ${parent?.name ?? ''}`) };
    })
    .sort((a, b) => a.code.length - b.code.length || a.label.localeCompare(b.label, 'es'));
}

/** Bigger areas first, as the CNE declares them. */
export function searchZones(
  options: readonly ZoneOption[],
  query: string,
  limit = 8,
): ZoneOption[] {
  const q = fold(query);
  if (q.length < 2) return [];
  return options.filter((o) => o.key.includes(q)).slice(0, limit);
}

export async function fetchZoneOptions(db: SupabaseClient): Promise<ZoneOption[]> {
  const { data, error } = await db.from('zones').select('code, kind, name, parent_code');
  if (error) throw toApiError(error);
  return zoneOptions((data ?? []) as ZoneRow[]);
}
