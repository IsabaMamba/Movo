/**
 * Gender (0035; board Mujeres v1): asked once, seen only by its owner, used
 * for one thing — deciding who sees women-only sessions and groups.
 *
 * The labels and hints are the board's. «Mujer» includes trans women;
 * «Prefiero no decir» still sees women-only content and confirms once per
 * session or group (backend item 2, not built yet).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { toApiError } from './errors';

export type Gender = 'mujer' | 'hombre' | 'no_dice';

export const GENDER_OPTIONS: readonly { value: Gender; label: string; hint: string | null }[] = [
  { value: 'mujer', label: 'Mujer', hint: 'Incluye a las mujeres trans.' },
  { value: 'hombre', label: 'Hombre', hint: null },
  {
    value: 'no_dice',
    label: 'Prefiero no decir',
    hint: 'Igual ves lo solo para mujeres, y confirmas al unirte.',
  },
];

/** Why it is asked, said where it is asked. */
export const GENDER_PURPOSE =
  'Solo sirve para una cosa: mostrarte las sesiones y los grupos solo para mujeres. No aparece en tu perfil ni nadie más lo ve.';

export function genderLabel(value: string | null | undefined): string | null {
  return GENDER_OPTIONS.find((o) => o.value === value)?.label ?? null;
}

export function isGender(value: unknown): value is Gender {
  return value === 'mujer' || value === 'hombre' || value === 'no_dice';
}

/** Logged on every real change (gender_changes); the same answer writes nothing. */
export async function setMyGender(db: SupabaseClient, gender: Gender): Promise<void> {
  const { error } = await db.rpc('set_my_gender', { p_gender: gender });
  if (error) throw toApiError(error);
}
