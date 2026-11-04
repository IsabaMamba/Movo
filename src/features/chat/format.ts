/**
 * The times a chat shows (Chat v1): «18:20» under a message from today,
 * «ayer 20:31» or «lun 20:14» within the week, «2 nov» before that.
 * Costa Rica time, 24-hour clock, like every other time in Movo.
 */

const TZ = 'America/Costa_Rica';

function dayKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
}

export function chatTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat('es-CR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: TZ,
  }).format(d);
  if (dayKey(d) === dayKey(now)) return time;
  const yesterday = new Date(now.getTime() - 24 * 60 * 60_000);
  if (dayKey(d) === dayKey(yesterday)) return `ayer ${time}`;
  const days = (now.getTime() - d.getTime()) / (24 * 60 * 60_000);
  const fmt = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('es-CR', { ...o, timeZone: TZ }).format(d).replace(/[.,]/g, '');
  if (days < 7) return `${fmt({ weekday: 'short' })} ${time}`;
  return fmt({ day: 'numeric', month: 'short' });
}

/** Two letters for an author without a photo: «Luis Arias» → «LA». */
export function authorInitials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/u).filter(Boolean);
  const letters = words.length >= 2 ? [words[0], words[words.length - 1]] : words.slice(0, 1);
  return letters.map((w) => (w ?? '').charAt(0).toUpperCase()).join('') || '·';
}

/** The reasons an organizer picks from when removing a message; one is sent as the rule. */
export const REMOVAL_REASONS = [
  'Las normas del grupo',
  'Faltó el respeto',
  'Datos personales de otra persona',
  'Publicidad o ventas',
] as const;
