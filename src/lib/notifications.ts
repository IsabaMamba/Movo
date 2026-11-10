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
import { cadenceLabel } from './series';
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
  /** The notification's type, for its icon and the inbox filters. */
  kind: string;
  /** ISO instant. Render in America/Costa_Rica, like every other time. */
  createdAt: string;
  read: boolean;
  /** Already assembled — the screen renders this and nothing else. */
  text: string;
  /** The session to open, or null when the notification leads nowhere. */
  activityId: string | null;
  /**
   * Open the organizer's roster rather than the public session page. Only
   * for notices that ask the organizer to do something the roster is for.
   */
  opensRoster?: true;
  /**
   * Open a chat rather than a session page (0040): the session's chat when
   * `activityId` is set, or this group's chat.
   */
  opensChat?: true;
  communityId?: string;
  /** Open the series page (0052), where the person can join it whole. */
  seriesId?: string;
  /** With `seriesId`: open the organizer's series screen instead (0057). */
  opensOrganizerSeries?: true;
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
  const base = {
    id: row.id,
    createdAt: row.created_at,
    read: row.read_at !== null,
    kind: row.type,
  };
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
      // Written by delete_my_account() (0029). The session is deleted with
      // the account, so there is nothing to open and no id to open it by.
      // Written by delete_community() (0045): the group went, and its
      // group-only sessions with it. The session row stays, cancelled.
      if (text(payload, 'by') === 'group_deleted') {
        const group = text(payload, 'group');
        return {
          ...base,
          text:
            group === null
              ? `${title} se canceló: el grupo ya no existe.`
              : `${title} se canceló: el grupo ${group} ya no existe.`,
          activityId,
        };
      }
      if (text(payload, 'by') === 'gone') {
        return {
          ...base,
          text: `${title} se canceló: quien la organizaba ya no está en Movo.`,
          activityId: null,
        };
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

    // Written by cancel_for_weather() and cancel_water_sessions_in_zone()
    // (0041). The alert is the CNE's words; the rule is fixed for water.
    case 'activity_cancelled_weather': {
      const alert = text(payload, 'alert');
      return {
        ...base,
        text:
          alert === null
            ? `${title} se canceló por una alerta de la CNE. En el agua es una regla fija.`
            : `${title} se canceló: la CNE declaró ${alert}. En el agua es una regla fija.`,
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

    // Written by warn_solo_sessions() (0022), once, inside the last 24 hours.
    // Neither names anybody: the organizer already sees who joined, and the
    // participant already knows who organizes.
    case 'solo_session_organizer':
      return {
        ...base,
        text: `Solo una persona se unió a ${title}. Si nadie más se une, sería un encuentro a solas. Puedes cancelarla o esperar a que se una alguien más.`,
        activityId,
      };

    case 'solo_session_participant':
      return {
        ...base,
        text: `Por ahora eres la única persona que va a ${title}. Si nadie más se une, estarías a solas con quien organiza. Si prefieres no ir así, puedes salir de la sesión.`,
        activityId,
      };

    // Written by remind_unclosed_sessions() (0023), once, an hour after the
    // end. Opens the roster, because marking who came is the thing to do.
    // Written by set_activity_links() (0032) to everybody going, when the
    // organizer changes the links after they joined. Opens the session, where
    // the links are shown with their domains.
    case 'activity_link_changed':
      return {
        ...base,
        text: `Cambiaron los enlaces de ${title}. Revísalos antes de ir.`,
        activityId,
      };

    case 'close_reminder':
      return {
        ...base,
        text: `${title} ya terminó y sigue abierta. Revisa quién llegó y ciérrala: sin eso, la asistencia no cuenta.`,
        activityId,
        opensRoster: true,
      };

    // Written by delete_my_account() (0029) to whoever inherits a group.
    // 0045: a group's owner offers it to you; you answer on the group's page.
    case 'group_handover_offered': {
      const name = text(payload, 'name') ?? 'un grupo';
      return {
        ...base,
        text: `Te quieren pasar el grupo ${name}. Entra al grupo desde Grupos para aceptarlo o rechazarlo; la oferta dura 7 días.`,
        activityId: null,
      };
    }
    case 'group_handover_accepted': {
      const name = text(payload, 'name') ?? 'el grupo';
      return {
        ...base,
        text: `Aceptaron administrar ${name}. Sigues en el grupo.`,
        activityId: null,
      };
    }
    case 'group_handover_declined': {
      const name = text(payload, 'name') ?? 'el grupo';
      return {
        ...base,
        text: `No aceptaron administrar ${name}. Sigues a cargo; puedes ofrecérselo a otra persona.`,
        activityId: null,
      };
    }
    case 'group_deleted': {
      const name = text(payload, 'name');
      return {
        ...base,
        text:
          name === null
            ? 'Un grupo en el que estabas ya no existe. Quien lo creó lo eliminó.'
            : `El grupo ${name} ya no existe. Quien lo creó lo eliminó.`,
        activityId: null,
      };
    }

    case 'group_handed_over': {
      const name = text(payload, 'name');
      return {
        ...base,
        text:
          name === null
            ? 'Ahora administras un grupo: quien lo creó ya no está en Movo.'
            : `Ahora administras el grupo ${name}: quien lo creó ya no está en Movo.`,
        activityId: null,
      };
    }

    // Written by notify_blocked_person_going() (0039), only to the person who
    // blocked. Never names who: they know, and nobody else is told anything.
    case 'blocked_person_going':
      return {
        ...base,
        text: `Alguien que bloqueaste se unió a ${title}. No sabe que vas y no ve tus mensajes. Tú decides si sigues yendo.`,
        activityId,
      };

    // Written by notify_participants_daily() (0050), once a day, only to an
    // organizer who switched «Quién se une o sale» on (0049).
    case 'participants_daily': {
      return { ...base, text: dailyDigestText(payload, title), activityId };
    }

    // Written by leave_series() (0048) to the organizer: who left, the whole
    // series or one date, and a reason only if the person picked one of three.
    case 'series_left':
    case 'series_date_left': {
      const name = text(payload, 'name') ?? 'Alguien';
      const reason = text(payload, 'reason');
      const why =
        reason === 'trabajo'
          ? ' Por trabajo.'
          : reason === 'salud'
            ? ' Por salud.'
            : reason === 'viaje'
              ? ' Por un viaje.'
              : '';
      const startsAt = text(payload, 'starts_at');
      const when = startsAt === null ? 'una fecha' : `el ${noticeDay(startsAt)}`;
      return {
        ...base,
        text:
          row.type === 'series_left'
            ? `${name} salió de la serie ${title} y liberó sus lugares en las próximas fechas.${why}`
            : `${name} no puede ir ${when} a ${title}. Sigue en las demás fechas.${why}`,
        activityId: row.type === 'series_left' ? null : activityId,
      };
    }

    // Written by invite_to_series() (0052), once per person per series. Opens
    // the series page, where «Unirme a la serie» is join_series() (0048).
    case 'series_invitation': {
      const name = text(payload, 'name') ?? 'Quien organiza';
      const seriesId = text(payload, 'series_id');
      const weekday = payload.weekday;
      const time = text(payload, 'local_start_time');
      const when =
        typeof weekday === 'number' && time !== null
          ? `, ${cadenceLabel(weekday, time).toLowerCase()}`
          : '';
      return {
        ...base,
        text: `${name} te invita a toda la serie ${title}${when}. Únete a todas las fechas de una vez.`,
        activityId: null,
        ...(seriesId === null ? {} : { seriesId }),
      };
    }

    // Written by offer_series_renewals() (0057) to the organizer, a month
    // before the last date. Opens the series screen, where renewing is.
    case 'series_renewal_offer': {
      const seriesId = text(payload, 'series_id');
      const lastStart = text(payload, 'last_start');
      const remaining = payload.remaining;
      const left =
        typeof remaining === 'number'
          ? `le ${remaining === 1 ? 'queda 1 fecha' : `quedan ${String(remaining)} fechas`}`
          : 'le quedan pocas fechas';
      const until = lastStart === null ? '' : `, hasta el ${noticeDay(lastStart)}`;
      return {
        ...base,
        text: `A ${title} ${left}${until}. ¿Agregas 8 más?`,
        activityId: null,
        ...(seriesId === null ? {} : { seriesId, opensOrganizerSeries: true as const }),
      };
    }

    // Written by renew_series() (0057) to everybody on the whole series.
    case 'series_renewal': {
      const seriesId = text(payload, 'series_id');
      const name = text(payload, 'name') ?? 'Quien organiza';
      const added = typeof payload.added === 'number' ? payload.added : 8;
      const lastStart = text(payload, 'last_start');
      const until =
        lastStart === null ? '' : ` Si no respondes, terminas el ${noticeDay(lastStart)}.`;
      return {
        ...base,
        text: `${name} agregó ${String(added)} fechas a ${title}. ¿Sigues?${until}`,
        activityId: null,
        ...(seriesId === null ? {} : { seriesId }),
      };
    }

    // Written by send_message() and remove_message() (0040). Never the text of
    // a message: who wrote, and where. Each opens the chat it is about.
    case 'chat_reply':
    case 'chat_organizer':
    case 'chat_message':
    case 'chat_message_removed': {
      const communityId = text(payload, 'community_id');
      const where = text(payload, 'title') ?? 'tu chat';
      const name = text(payload, 'name') ?? 'Alguien';
      const reason = text(payload, 'reason');
      const sentence =
        row.type === 'chat_reply'
          ? `${name} respondió a tu mensaje en el chat de ${where}.`
          : row.type === 'chat_organizer'
            ? `${name}, que organiza, escribió en el chat de ${where}.`
            : row.type === 'chat_message'
              ? `Hay mensajes nuevos en el chat de ${where}.`
              : reason === null
                ? `Quien organiza ${where} quitó un mensaje tuyo del chat porque no cumple las reglas.`
                : `Quien organiza ${where} quitó un mensaje tuyo del chat porque no cumple: «${reason}».`;
      return {
        ...base,
        text: sentence,
        activityId,
        opensChat: true,
        ...(communityId === null ? {} : { communityId }),
      };
    }

    // Written by return_location() (0043) to whoever added the venue.
    case 'venue_returned': {
      const name = text(payload, 'name') ?? 'tu lugar';
      const note = text(payload, 'note');
      return {
        ...base,
        text:
          note === null
            ? `El equipo te devolvió ${name} para corregirlo. Mientras tanto no se puede elegir en Crear.`
            : `El equipo te devolvió ${name} para corregirlo: «${note}». Mientras tanto no se puede elegir en Crear.`,
        activityId: null,
      };
    }

    // Written by publish_legal_version() (0044) to every account.
    case 'terms_updated': {
      const doc = text(payload, 'document');
      const what =
        doc === 'privacy'
          ? 'el aviso de privacidad'
          : doc === 'terms'
            ? 'los términos'
            : 'los términos y el aviso de privacidad';
      const version = text(payload, 'version');
      return {
        ...base,
        text: `Actualizamos ${what}${version ? `, del ${legalDate(version)}` : ''}. Lee el resumen de qué cambió.`,
        activityId: null,
      };
    }

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

/** «2026-11-04» → «4 de noviembre». A version that is not a date is shown as written. */
function legalDate(version: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(version);
  if (!m) return version;
  const months = [
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
  return `${Number(m[3])} de ${months[Number(m[2]) - 1] ?? m[2]}`;
}

/**
 * The unread count, spoken.
 *
 * A badge is a number sitting beside a word, which a screen reader reads as
 * two unrelated fragments — "Avisos", then "2". This is the sentence, and it
 * is also why the badge itself is hidden from assistive technology.
 */
/** Notices about running something rather than going to it (Avisos v2 filter). */
const ORGANIZER_KINDS = new Set([
  'close_reminder',
  'solo_session_organizer',
  'activity_cancelled_by_movo',
  'group_handed_over',
  'group_handover_offered',
  'group_handover_accepted',
  'group_handover_declined',
  'venue_returned',
  'series_left',
  'series_date_left',
  'participants_daily',
]);

export type InboxFilter = 'todos' | 'sesiones' | 'organizar';

export function inFilter(item: Pick<InboxItem, 'kind'>, filter: InboxFilter): boolean {
  if (filter === 'todos') return true;
  return filter === 'organizar' ? ORGANIZER_KINDS.has(item.kind) : !ORGANIZER_KINDS.has(item.kind);
}

/**
 * «3 personas se unieron a Trote suave: Ana, Beto y 1 más. Caro no puede ir.»
 * Exported for the test. Names come from the payload, at most two who joined
 * and one who left; the rest are a count.
 */
export function dailyDigestText(payload: Record<string, unknown>, title: string): string {
  const count = (key: string) => {
    const v = payload[key];
    return typeof v === 'number' ? v : 0;
  };
  const names = (key: string) => {
    const v = payload[key];
    return Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string') : [];
  };
  const joined = count('joined');
  const left = count('left');
  const who = names('names');
  const gone = names('left_names');
  const parts: string[] = [];
  if (joined > 0) {
    const rest = joined - who.length;
    const list =
      who.length === 0
        ? ''
        : rest > 0
          ? `: ${who.join(', ')} y ${String(rest)} más`
          : `: ${who.length === 2 ? `${who[0] ?? ''} y ${who[1] ?? ''}` : (who[0] ?? '')}`;
    parts.push(
      `${joined === 1 ? '1 persona se unió' : `${String(joined)} personas se unieron`} a ${title}${list}.`,
    );
  }
  if (left > 0) {
    const first = gone[0];
    if (left === 1 && first) parts.push(`${first} no puede ir.`);
    else parts.push(`${left === 1 ? '1 persona salió' : `${String(left)} personas salieron`}.`);
  }
  return parts.length > 0 ? parts.join(' ') : `Hubo cambios en la lista de ${title}.`;
}

/** «sábado 7 de noviembre», in Costa Rica time. */
function noticeDay(iso: string): string {
  return new Intl.DateTimeFormat('es-CR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Costa_Rica',
  })
    .format(new Date(iso))
    .replace(',', '');
}

/** «hace 20 min», «hace 2 h», «ayer», «sáb 31 oct». */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  if (hours < 48) return 'ayer';
  return new Intl.DateTimeFormat('es-CR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Costa_Rica',
  })
    .format(new Date(iso))
    .replace(/[.,]/g, '');
}

export function unreadA11yLabel(unread: number): string {
  if (unread <= 0) return 'Avisos. No tienes avisos sin leer.';
  return `Avisos. ${unread} ${unread === 1 ? 'aviso sin leer' : 'avisos sin leer'}.`;
}
