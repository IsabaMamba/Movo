/**
 * Mis sesiones v4 (2 November walkthrough, steps 6–8): the week at a glance,
 * the next session first, and the rest grouped by day. Everything here is
 * computed in Costa Rica's calendar — the week starts on Monday, and «hoy»
 * is today in San José, not on the device's clock or in UTC.
 */

const TZ = 'America/Costa_Rica';

const YMD = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const WEEKDAY_SHORT = new Intl.DateTimeFormat('es-CR', { weekday: 'short', timeZone: TZ });
const MONTH_LONG = new Intl.DateTimeFormat('es-CR', { month: 'long', timeZone: TZ });
const MONTH_SHORT = new Intl.DateTimeFormat('es-CR', { month: 'short', timeZone: TZ });

/** «2026-11-02», the calendar day in Costa Rica. */
export function localDay(at: Date | string): string {
  return YMD.format(new Date(at));
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days, 12));
  return t.toISOString().slice(0, 10);
}

/** Monday = 0 … Sunday = 6, for a YYYY-MM-DD. */
function mondayIndex(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export interface WeekDay {
  ymd: string;
  /** «L», «M», «M», «J», «V», «S», «D». */
  letter: string;
  number: number;
  isToday: boolean;
  hasSession: boolean;
}

const LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** This week, Monday to Sunday, marking today and the days with a session. */
export function weekStrip(now: Date, sessionDays: readonly string[]): WeekDay[] {
  const today = localDay(now);
  const monday = addDays(today, -mondayIndex(today));
  const busy = new Set(sessionDays);
  return LETTERS.map((letter, i) => {
    const ymd = addDays(monday, i);
    return {
      ymd,
      letter,
      number: Number(ymd.slice(8, 10)),
      isToday: ymd === today,
      hasSession: busy.has(ymd),
    };
  });
}

/** «Noviembre · esta semana». */
export function weekTitle(now: Date): string {
  const month = MONTH_LONG.format(now);
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} · esta semana`;
}

/** «SÁB 17 OCT» and «mañana», for a day heading. */
export function dayHeading(iso: string, now: Date): { label: string; relative: string | null } {
  const at = new Date(iso);
  const ymd = localDay(at);
  const weekday = WEEKDAY_SHORT.format(at).replace('.', '').slice(0, 3);
  const month = MONTH_SHORT.format(at).replace('.', '');
  const label = `${weekday} ${Number(ymd.slice(8, 10))} ${month}`.toUpperCase();
  const today = localDay(now);
  const relative =
    ymd === today
      ? 'hoy'
      : ymd === addDays(today, 1)
        ? 'mañana'
        : ymd === addDays(today, -1)
          ? 'ayer'
          : null;
  return { label, relative };
}

/** «Empieza en 3 h», «Empieza en 20 min», «Ahora», or null once it is long past. */
export function startsIn(iso: string, now: Date): string | null {
  const minutes = Math.round((new Date(iso).getTime() - now.getTime()) / 60_000);
  if (minutes < -60) return null;
  if (minutes <= 0) return 'Ahora';
  if (minutes < 60) return `Empieza en ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Empieza en ${hours} h`;
  return null;
}

/** «HOY», «MAÑANA» or the weekday, for the «TU PRÓXIMA · …» eyebrow. */
export function eyebrowDay(iso: string, now: Date): string {
  const { relative, label } = dayHeading(iso, now);
  if (relative === 'hoy') return 'HOY';
  if (relative === 'mañana') return 'MAÑANA';
  return label;
}

/**
 * «Cómo llegar»: the destination only, in the person's own maps app. Movo
 * sends no origin — where somebody is leaving from is not Movo's to know.
 */
export function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/** The message «Invitar a alguien» shares, with the session's link when there is one (0055). */
export function inviteText(title: string, iso: string, now: Date, url?: string | null): string {
  const { label, relative } = dayHeading(iso, now);
  const time = new Intl.DateTimeFormat('es-CR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: TZ,
  }).format(new Date(iso));
  const when = relative === 'hoy' ? 'hoy' : relative === 'mañana' ? 'mañana' : label.toLowerCase();
  // With a link (0055) the friend opens the session itself; without one,
  // they are told where to look.
  return url
    ? `Me uní a ${title}, ${when} a las ${time}. ¿Te animas? ${url}`
    : `Me uní a ${title}, ${when} a las ${time}. ¿Te animas? Búscala en Movo.`;
}
