/**
 * Movo is for people of 18 or older (/normas). Until 0031 that was a sentence
 * under the sign-up button and nothing checked it. Audit of 7 October, item 9.
 *
 * The form asks for the date of birth and refuses under 18 before anything is
 * sent; handle_new_user() checks the same rule again, because the sign-up
 * endpoint is public and a form is only a form. The two must agree on every
 * date, so the rule is written once here and mirrored in SQL:
 *
 *   somebody is 18 on the day their 18th anniversary falls, and somebody born
 *   on 29 February reaches it on 28 February in a common year — which is what
 *   Postgres's `date + interval '18 years'` does.
 *
 * "Today" is the calendar day in Costa Rica, not the device's or UTC's: at
 * 19:00 in San José it is already tomorrow in UTC.
 */

export const MIN_AGE = 18;

/** The calendar date, `YYYY-MM-DD`, in Costa Rica. */
export function todayInCostaRica(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The date `years` after `iso`, with 29 February landing on 28 February. */
export function anniversary(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const year = y + years;
  const day = Math.min(d, daysIn(year, m));
  return `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isAdultOn(birthdate: string, today: string): boolean {
  // ISO dates compare correctly as strings.
  return anniversary(birthdate, MIN_AGE) <= today;
}

export type BirthdateResult = { ok: true; iso: string } | { ok: false; problem: string };

/**
 * Day, month and year as typed, to an ISO date or the sentence the form shows.
 * Nothing typed yet is not a problem worth shouting about; the button stays
 * off and the hint says what is needed.
 */
export function parseBirthdate(
  day: string,
  month: string,
  year: string,
  today: string = todayInCostaRica(),
): BirthdateResult {
  const [d, m, y] = [day, month, year].map((part) => part.trim());
  if (!d || !m || !y) return { ok: false, problem: 'Escribe tu fecha de nacimiento.' };
  if (![d, m, y].every((part) => /^\d+$/u.test(part)) || y.length !== 4) {
    return { ok: false, problem: 'Escribe la fecha con números: día, mes y año de cuatro cifras.' };
  }

  const [dn, mn, yn] = [Number(d), Number(m), Number(y)];
  if (mn < 1 || mn > 12 || dn < 1 || dn > daysIn(yn, mn)) {
    return { ok: false, problem: 'Esa fecha no existe. Revisa el día y el mes.' };
  }

  const iso = `${yn}-${String(mn).padStart(2, '0')}-${String(dn).padStart(2, '0')}`;
  if (yn < 1900 || iso > today) {
    return { ok: false, problem: 'Revisa el año de nacimiento.' };
  }
  if (!isAdultOn(iso, today)) {
    return { ok: false, problem: `Movo es solo para personas de ${MIN_AGE} años o más.` };
  }
  return { ok: true, iso };
}
