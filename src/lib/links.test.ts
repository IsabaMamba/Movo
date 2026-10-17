import { describe, expect, it } from 'vitest';

import { checkLink, linksProblem } from './links';

/**
 * The same cases as supabase/tests/31_activity_links_test.sql. If the form
 * accepts what the database refuses, the organizer sees a raw error after
 * filling everything in; if it refuses what the database accepts, a valid
 * route cannot be shared. Both are bugs.
 */
describe('checkLink', () => {
  it.each([
    ['https://www.strava.com/routes/123', 'strava.com'],
    ['https://es.wikiloc.com/rutas/abc?x=1', 'es.wikiloc.com'],
    ['https://maps.app.goo.gl/AbC123', 'maps.app.goo.gl'],
    ['HTTPS://Example.CR/ruta', 'example.cr'],
    ['https://example.com:443/a', 'example.com'],
    ['https://xn--caada-rta.cr/', 'xn--caada-rta.cr'],
    ['  https://example.com  ', 'example.com'],
  ])('accepts %s as %s', (url, domain) => {
    expect(checkLink(url)).toEqual({ ok: true, domain });
  });

  it.each([
    ['', 'vacío'],
    ['http://example.com', 'https://'],
    ['javascript:alert(1)', 'https://'],
    ['https://bit.ly/abc', 'acortadores'],
    ['https://www.tinyurl.com/abc', 'acortadores'],
    ['https://192.168.0.1/ruta', 'número IP'],
    ['https://[::1]/ruta', 'número IP'],
    ['https://localhost/ruta', 'número IP'],
    ['https://user:pass@example.com', 'usuario'],
    ['https://example.com:8080/a', 'puerto'],
    ['https://exa mple.com', 'espacios'],
    ['https://ejemplo.cr/' + 'a'.repeat(500), 'largo'],
  ])('refuses %s', (url, fragment) => {
    const result = checkLink(url);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toContain(fragment);
  });
});

describe('linksProblem', () => {
  it('is null for none, one or two good links, ignoring blanks', () => {
    expect(linksProblem([])).toBeNull();
    expect(linksProblem(['', ' '])).toBeNull();
    expect(linksProblem(['https://strava.com/a', 'https://wikiloc.com/b'])).toBeNull();
  });

  it('refuses three, duplicates, and says which link is wrong', () => {
    expect(linksProblem(['https://a.cr/', 'https://b.cr/', 'https://c.cr/'])).toBe(
      'Una sesión puede tener hasta dos enlaces.',
    );
    expect(linksProblem(['https://a.cr/', ' https://a.cr/'])).toBe('Los dos enlaces son iguales.');
    expect(linksProblem(['https://a.cr/', 'http://b.cr/'])).toContain('https://');
  });
});
