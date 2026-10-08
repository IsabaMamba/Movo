/**
 * Which pages a search engine may list.
 *
 * The web build pre-renders every route to its own HTML (`web.output:
 * "static"`), so each one is a URL a crawler can reach. Almost all of them
 * need an account: a crawler gets the empty shell, not the data — rendering
 * happens after sign-in — but the URLs still land in an index, and «Mis
 * sesiones» or «Reportes» in a search result is not something Movo should
 * show. Audit of 7 October, item 3.
 *
 * So the rule is an allowlist, not a blocklist. A screen added tomorrow is
 * noindex until somebody decides otherwise, and `robots.test.ts` walks
 * `src/app` to make sure every route is covered by this one function.
 *
 * Session and group pages are noindex too, although they render without an
 * account: a search result for a session is a place and a time with people
 * at it, which is exactly what Movo does not publish beyond the app.
 */

/** Pathnames a search engine may list. Exact match; everything else is noindex. */
export const INDEXABLE_PATHS: readonly string[] = ['/', '/normas', '/sign-in', '/sign-up'];

export const NOINDEX = 'noindex, nofollow';

/** Whether a pathname may be listed. Trailing slashes and query strings are ignored. */
export function isIndexable(pathname: string): boolean {
  const path = pathname.split(/[?#]/u)[0] ?? '';
  const trimmed = path.length > 1 ? path.replace(/\/+$/u, '') : path;
  return INDEXABLE_PATHS.includes(trimmed || '/');
}
