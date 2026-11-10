/** Presentation helpers for the discover list. */

const TIME_ZONE = 'America/Costa_Rica';

/** Metres from the RPC, rendered the way a person would say it. */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 50) * 50} m`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;
}

const WEEKDAY_SHORT = new Intl.DateTimeFormat('es-CR', { weekday: 'short', timeZone: TIME_ZONE });
const TIME = new Intl.DateTimeFormat('es-CR', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: TIME_ZONE,
});
const DAY_MONTH = new Intl.DateTimeFormat('es-CR', {
  day: 'numeric',
  month: 'short',
  timeZone: TIME_ZONE,
});
const WEEKDAY_LONG = new Intl.DateTimeFormat('es-CR', { weekday: 'long', timeZone: TIME_ZONE });

export interface DateColumn {
  /** «MAR», «MIÉ», «SÁB». */
  weekday: string;
  /** «06:00». */
  time: string;
  /** «13 oct». */
  day: string;
}

/**
 * The left column of a session card (Descubrir v3, Mis sesiones v4): the
 * weekday in Sun, the time large, the date small. Costa Rica time, whatever
 * the device says.
 */
export function dateColumn(iso: string): DateColumn {
  const at = new Date(iso);
  const weekday = WEEKDAY_SHORT.format(at).replace('.', '').slice(0, 3).toUpperCase();
  return {
    weekday,
    time: TIME.format(at),
    day: DAY_MONTH.format(at).replace('.', ''),
  };
}

/** «Cada martes · 9 fechas», for a series that arrives as one card. */
export function seriesShort(iso: string, upcoming: number): string {
  const day = WEEKDAY_LONG.format(new Date(iso));
  return `Cada ${day} · ${upcoming} ${upcoming === 1 ? 'fecha' : 'fechas'}`;
}

/**
 * What to try when the list is empty. Only what can still be tried: at the
 * widest radius «amplía el radio» has nowhere to go, and without a sport
 * chosen there is no filter to take off.
 */
export function emptyHint(radiusKm: number, maxKm: number, filtered: boolean): string {
  const wider = radiusKm < maxKm;
  const waiting = 'Estamos sumando sesiones de grupos que ya entrenan en la GAM.';
  if (wider && filtered) return `Prueba ampliar el radio o quitar el filtro de deporte. ${waiting}`;
  if (wider) return `Prueba ampliar el radio. ${waiting}`;
  if (filtered) return `Prueba quitar el filtro de deporte. ${waiting}`;
  return waiting;
}

/** «9 sesiones a menos de 15 km». */
export function nearbyCount(count: number, radiusKm: number): { count: string; rest: string } {
  return {
    count: `${count} ${count === 1 ? 'sesión' : 'sesiones'}`,
    rest: ` a menos de ${radiusKm} km`,
  };
}
