/**
 * Perfil › Notificaciones (Avisos v3 · 6, 0049): which optional notices arrive.
 *
 * Four kinds can be switched off. Everything else is «Siempre», because with
 * it off somebody would turn up to a session that was cancelled. The check
 * runs in the database before a notice is written, so the inbox, the count
 * and the push all agree; this module only reads and writes the person's row.
 * No row means the defaults.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { toApiError } from './errors';

export interface NotificationPrefs {
  reminders: boolean;
  invitations: boolean;
  chat: boolean;
  joins: boolean;
}

export type PrefKey = keyof NotificationPrefs;

export const DEFAULT_PREFS: NotificationPrefs = {
  reminders: true,
  invitations: true,
  chat: true,
  joins: false,
};

/** The switches, in the board's order and words. */
export const PREF_ROWS: readonly { key: PrefKey; title: string; sub: string }[] = [
  { key: 'reminders', title: 'Recordatorio el día antes', sub: 'De cada sesión a la que vas.' },
  {
    key: 'invitations',
    title: 'Invitaciones',
    sub: 'Cuando alguien te invita a una sesión o a una serie.',
  },
  {
    key: 'chat',
    title: 'Chat',
    sub: 'Respuestas a ti y mensajes de quien organiza. Cada chat se puede silenciar.',
  },
  {
    key: 'joins',
    title: 'Quién se une o sale',
    sub: 'De las sesiones que organizas. Se juntan en un solo aviso al día.',
  },
];

/** What cannot be switched off, and why it says so. */
export const ALWAYS_ROWS: readonly { title: string; sub: string }[] = [
  {
    title: 'Cambios, cancelaciones y lugares',
    sub: 'Lo que cambia en una sesión tuya, y la lista de espera.',
  },
  {
    title: 'Tu cuenta y tu seguridad',
    sub: 'Reportes, verificación y avisos del equipo de Movo.',
  },
];

export async function fetchNotificationPrefs(
  db: SupabaseClient,
  userId: string,
): Promise<NotificationPrefs> {
  const { data, error } = await db
    .from('notification_preferences')
    .select('reminders, invitations, chat, joins')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw toApiError(error);
  return { ...DEFAULT_PREFS, ...((data as Partial<NotificationPrefs> | null) ?? {}) };
}

/** Writes the whole row, so a first change also stores the other defaults. */
export async function saveNotificationPrefs(
  db: SupabaseClient,
  userId: string,
  prefs: NotificationPrefs,
): Promise<void> {
  const { error } = await db
    .from('notification_preferences')
    .upsert({ user_id: userId, ...prefs, updated_at: new Date().toISOString() });
  if (error) throw toApiError(error);
}

/** «Todo encendido», «Chat apagado», «2 apagados» — the value on the Perfil row. */
export function prefsSummary(prefs: NotificationPrefs): string {
  const off = PREF_ROWS.filter((r) => r.key !== 'joins' && !prefs[r.key]);
  if (off.length === 0) return 'Todo encendido';
  if (off.length === 1) return `${off[0]?.title ?? ''} apagado`;
  return `${String(off.length)} apagados`;
}
