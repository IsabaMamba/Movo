/**
 * Links on a session (0032): a route on Strava or Wikiloc, a map pin, the
 * club's page. Up to two, https only, and always shown with their domain.
 *
 * The rules live in the database (`link_domain()`), which is what decides.
 * They are mirrored here so the form can say what is wrong before sending,
 * and the two must agree: `links.test.ts` and `31_activity_links_test.sql`
 * hold the same cases.
 *
 * A link is the one thing in a session that takes somebody where Movo has
 * no say. That is why shorteners are refused — a person should see where a
 * tap goes before making it — and why the domain is stored and shown
 * separately rather than trusted to a link's text.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { toApiError } from './errors';

export const MAX_LINKS = 2;
export const MAX_LINK_LENGTH = 500;

/** Exact hosts, as in is_link_shortener(). App links like maps.app.goo.gl pass. */
const SHORTENERS = new Set([
  'bit.ly',
  'bitly.com',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'v.gd',
  'buff.ly',
  'rebrand.ly',
  'cutt.ly',
  'shorturl.at',
  'rb.gy',
  't.ly',
  'tiny.cc',
  'lnkd.in',
  's.id',
  'bl.ink',
  'qrco.de',
  'shorte.st',
  'adf.ly',
  'tiny.one',
  'urlz.fr',
  'acortar.link',
]);

const HOST_PATTERN = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/u;

// Whitespace or a control character anywhere.
// eslint-disable-next-line no-control-regex
const BLANK_OR_CONTROL = /[\s\u0000-\u001f\u007f]/u;

export type LinkResult = { ok: true; domain: string } | { ok: false; problem: string };

/** The domain to show, or the sentence the form shows. Mirrors link_domain(). */
export function checkLink(raw: string): LinkResult {
  const url = raw.trim();
  if (url === '') return { ok: false, problem: 'El enlace está vacío.' };
  if (url.length > MAX_LINK_LENGTH) return { ok: false, problem: 'El enlace es demasiado largo.' };
  if (BLANK_OR_CONTROL.test(url)) {
    return { ok: false, problem: 'El enlace no puede tener espacios.' };
  }
  if (url.slice(0, 8).toLowerCase() !== 'https://') {
    return { ok: false, problem: 'El enlace tiene que empezar con https://.' };
  }

  const match = /^https:\/\/([^/?#]+)([/?#].*)?$/iu.exec(url);
  if (!match?.[1]) return { ok: false, problem: 'Ese enlace no se puede leer.' };
  let host = match[1].toLowerCase();
  if (host.includes('@')) {
    return { ok: false, problem: 'El enlace no puede llevar usuario ni contraseña.' };
  }
  if (host.startsWith('[')) {
    return { ok: false, problem: 'Usa la dirección de una página, no un número IP.' };
  }
  if (host.includes(':')) {
    if (!host.endsWith(':443')) {
      return { ok: false, problem: 'El enlace no puede usar otro puerto.' };
    }
    host = host.slice(0, -':443'.length);
  }
  host = host.replace(/\.+$/u, '');

  if (!HOST_PATTERN.test(host)) {
    return { ok: false, problem: 'Usa la dirección de una página, no un número IP.' };
  }
  host = host.replace(/^www\./u, '');
  if (SHORTENERS.has(host)) {
    return {
      ok: false,
      problem: 'Los acortadores de enlaces no se aceptan: pega el enlace completo.',
    };
  }
  return { ok: true, domain: host };
}

/** The first problem in a set of links, or null. Empty entries are ignored. */
export function linksProblem(raw: readonly string[]): string | null {
  const urls = raw.map((u) => u.trim()).filter(Boolean);
  if (urls.length > MAX_LINKS) return 'Una sesión puede tener hasta dos enlaces.';
  if (urls.length === 2 && urls[0] === urls[1]) return 'Los dos enlaces son iguales.';
  for (const url of urls) {
    const result = checkLink(url);
    if (!result.ok) return result.problem;
  }
  return null;
}

export interface ActivityLink {
  position: number;
  url: string;
  domain: string;
}

export async function fetchActivityLinks(
  db: SupabaseClient,
  activityId: string,
): Promise<ActivityLink[]> {
  const { data, error } = await db
    .from('activity_links')
    .select('position, url, domain')
    .eq('activity_id', activityId)
    .order('position');
  if (error) throw toApiError(error);
  return (data ?? []) as ActivityLink[];
}

/** Replaces the session's links. Organizer only; the roster is told if they change. */
export async function setActivityLinks(
  db: SupabaseClient,
  activityId: string,
  urls: readonly string[],
): Promise<void> {
  const { error } = await db.rpc('set_activity_links', {
    p_activity_id: activityId,
    p_urls: urls.map((u) => u.trim()).filter(Boolean),
  });
  if (error) throw toApiError(error);
}
