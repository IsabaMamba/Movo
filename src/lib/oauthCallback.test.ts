import { describe, expect, it } from 'vitest';

import { readCallback } from './oauthCallback';

describe('readCallback', () => {
  it('takes the tokens from after the #', () => {
    expect(
      readCallback('movo://auth-callback#access_token=aaa&refresh_token=rrr&token_type=bearer'),
    ).toEqual({ ok: true, tokens: { accessToken: 'aaa', refreshToken: 'rrr' } });
  });

  it('says when the person cancelled', () => {
    const r = readCallback(
      'movo://auth-callback?error=access_denied&error_description=The+user+denied+access',
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.problem).toContain('Cancelaste');
  });

  it('says something else went wrong in plain words', () => {
    const r = readCallback('movo://auth-callback#error=server_error');
    expect(!r.ok && r.problem).toContain('No pudimos entrar');
  });

  it('is nothing for a bare link', () => {
    expect(readCallback('movo://auth-callback')).toEqual({ ok: false, problem: null });
  });
});
