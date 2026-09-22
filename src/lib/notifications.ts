/**
 * The inbox.
 *
 * Since 0008 the database writes a notification row every time somebody is
 * promoted off a waitlist and every time a session is cancelled, and 0012 adds
 * one when a report is resolved. Until this file nothing read them, which is
 * why two shipped decisions read the way they do: update_activity() locks the
 * time and the venue once anybody has joined, and cancel_activity() tells the
 * organiser to message people by hand. Both are workarounds for delivery that
 * did not exist.
 *
 * Reads are plain table reads — the policies on `notifications` restrict them
 * to the caller's own rows, so there is nothing for an RPC to protect. The one
 * write is `read_at`: 0011 narrowed the UPDATE grant to that single column, so
 * an update carrying any other key fails with 42501 rather than being ignored.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { toApiError } from './errors';
import { suspensionUntilLabel } from './suspensions';
import type { Notification } from '../types/database';

/**
 * How many rows the inbox asks for.
 *
 * `notifications_inbox_idx` is a partial index — `(user_id, created_at desc)
 * where read_at is null` — so the unread count below rides it and this query,
 * which wants read rows too, does not. A cap keeps that honest: nobody needs
 * last March's waitlist promotion, and the screen is not paginated.
 */
const INBOX_LIMIT = 50;

/** Everything in the caller's inbox, newest first, read and unread alike. */
export async function fetchNotifications(
  db: SupabaseClient,
  userId: string,
  limit: number = INBOX_LIMIT,
): Promise<Notification[]> {
  const { data, error } = await db
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw toApiError(error);
  return (data ?? []) as Notification[];
}

/**
 * How many are unread.
 *
 * A head request: `count: 'exact'` with no body, so the answer is a number off
 * `notifications_inbox_idx` rather than fifty rows the header would throw
 * away. This runs on Descubrir, which is the first screen of the app.
 */
export async function countUnreadNotifications(
  db: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await db
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) throw toApiError(error);
  return count ?? 0;
}

/**
 * Mark one notification read.
 *
 * `read_at` is the only key in the update object and that is not a style
 * choice: 0011 revoked UPDATE on the table and granted it back on `read_at`
 * alone, so adding `type` or `payload` here — even set to the value already
 * stored — makes the whole statement fail with 42501. The row is chosen by id
 * and the policy still checks `user_id = auth.uid()`, so there is nothing to
 * gain by filtering on the user as well.
 */
export async function markNotificationRead(
  db: SupabaseClient,
  notificationId: string,
): Promise<void> {
  const { error } = await db
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId);

  if (error) throw toApiError(error);
}

// ------------------------------------------------------------ presentation

/** A notification as the screen needs it: one sentence, and somewhere to go. */
export interface InboxItem {
  id: string;
  /** ISO instant. Render in America/Costa_Rica, like every other time. */
  createdAt: string;
  read: boolean;
  /** Already assembled — the screen renders this and nothing else. */
  text: string;
  /** The session to open, or null when the notification leads nowhere. */
  activityId: string | null;
}

/**
 * A payload value, if it is a non-empty string.
 *
 * `payload` is jsonb written by a function this client does not run, so every
 * key is a maybe. Trimmed because `reason` arrives from a text field somebody
 * typed into, and a reason of three spaces is not a reason.
 */
function text(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * What a session is called when the payload does not say.
 *
 * Both RPCs write the title, so this should never show. It exists because the
 * alternative when it does is the word "undefined" in the middle of a sentence
 * about somebody's Saturday.
 */
const UNNAMED_SESSION = 'la sesión';

/**
 * One row to one line.
 *
 * An unrecognised `type` is neither dropped nor printed raw. Dropping it would
 * make the badge and the list disagree — the count is a head query over every
 * unread row, so a hidden row reads as a counter that is simply wrong.
 * Printing the payload would put a server's internals on a user's screen, in
 * English, as JSON. So the row says the one true thing this build knows about
 * it: something arrived, and the app is too old to read it. It gets no
 * destination either, because the key that would carry one is part of what is
 * not understood.
 */
export function toInboxItem(row: Notification): InboxItem {
  const base = { id: row.id, createdAt: row.created_at, read: row.read_at !== null };
  const payload = row.payload ?? {};
  const title = text(payload, 'title') ?? UNNAMED_SESSION;
  const activityId = text(payload, 'activity_id');

  switch (row.type) {
    case 'waitlist_promoted':
      return { ...base, text: `Se liberó un lugar: ya vas a ${title}.`, activityId };

    case 'activity_cancelled': {
      // Written by moderate_cancel_activity() (0019). Deliberately no reason:
      // what the team decided, and that anybody reported, is not the roster's
      // to receive — in a small session it would name the reporter.
      if (text(payload, 'by') === 'movo') {
        return { ...base, text: `El equipo de Movo canceló ${title}.`, activityId };
      }
      const reason = text(payload, 'reason');
      return {
        ...base,
        text:
          reason === null
            ? `${title} se canceló. Sin motivo escrito.`
            : `${title} se canceló. Quien organiza escribió: «${reason}».`,
        // Still openable: activities_read lets somebody who was on the roster
        // read a cancelled session, and the detail screen is where the reason
        // and the rest of the roster are.
        activityId,
      };
    }

    case 'activity_cancelled_by_movo':
      // To the organizer. Says the rule, not the report: who reported is
      // exactly what this sentence must not let them work out.
      return {
        ...base,
        text: `El equipo de Movo canceló ${title} por no cumplir las normas de la comunidad.`,
        activityId,
      };

    case 'account_suspended': {
      // Until when, and what it means. Never why, and never that somebody
      // reported: suspend_account() writes only the end date.
      const endsAt = text(payload, 'ends_at');
      return {
        ...base,
        text: `El equipo de Movo suspendió tu cuenta ${suspensionUntilLabel(endsAt)}. Mientras dure no puedes crear sesiones, unirte a una ni escribir en los chats, y tus sesiones futuras se cancelaron.`,
        activityId: null,
      };
    }

    case 'account_restored':
      return {
        ...base,
        text: 'El equipo de Movo levantó la suspensión de tu cuenta. Ya puedes volver a usar Movo.',
        activityId: null,
      };

    case 'report_resolved':
      // Deliberately says only that it was reviewed — resolve_report() writes
      // nothing else, because what was decided about another person is not the
      // reporter's to receive. Nowhere to send them, so no destination.
      return { ...base, text: 'Revisamos tu reporte. Gracias por avisar.', activityId: null };

    default:
      return {
        ...base,
        text: 'Te llegó un aviso que esta versión de Movo todavía no sabe mostrar. Actualiza la app.',
        activityId: null,
      };
  }
}

/**
 * The unread count, spoken.
 *
 * A badge is a number sitting beside a word, which a screen reader reads as
 * two unrelated fragments — "Avisos", then "2". This is the sentence, and it
 * is also why the badge itself is hidden from assistive technology.
 */
export function unreadA11yLabel(unread: number): string {
  if (unread <= 0) return 'Avisos. No tienes avisos sin leer.';
  return `Avisos. ${unread} ${unread === 1 ? 'aviso sin leer' : 'avisos sin leer'}.`;
}
