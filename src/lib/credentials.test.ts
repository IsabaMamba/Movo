import { describe, expect, it } from 'vitest';

import { emailProblem, friendlyAuthError, hasPassword, newPasswordProblem } from './credentials';

describe('emailProblem', () => {
  it('asks for a complete, different email', () => {
    expect(emailProblem('', 'a@b.cr')).toMatch(/Escribe/u);
    expect(emailProblem('ana@', 'a@b.cr')).toMatch(/completo/u);
    expect(emailProblem(' A@B.cr ', 'a@b.cr')).toMatch(/ya es tu correo/u);
    expect(emailProblem('nuevo@b.cr', 'a@b.cr')).toBeNull();
  });
});

describe('newPasswordProblem', () => {
  it('checks the current, the length, the change and the repeat', () => {
    expect(newPasswordProblem('', 'abcdefgh', 'abcdefgh')).toMatch(/actual/u);
    expect(newPasswordProblem('viejaaaa', 'corta', 'corta')).toMatch(/8 caracteres/u);
    expect(newPasswordProblem('mismamisma', 'mismamisma', 'mismamisma')).toMatch(/distinta/u);
    expect(newPasswordProblem('viejaaaa', 'nuevanueva', 'nuevanuev')).toMatch(/no coinciden/u);
    expect(newPasswordProblem('viejaaaa', 'nuevanueva', 'nuevanueva')).toBeNull();
  });
});

describe('hasPassword', () => {
  it('is true for email accounts and false for Google or Apple only', () => {
    expect(hasPassword({ app_metadata: { provider: 'email' }, identities: [] })).toBe(true);
    expect(hasPassword({ app_metadata: {}, identities: [{ provider: 'google' }] as never })).toBe(
      false,
    );
    expect(
      hasPassword({
        app_metadata: {},
        identities: [{ provider: 'google' }, { provider: 'email' }] as never,
      }),
    ).toBe(true);
  });
});

describe('friendlyAuthError', () => {
  it('turns Supabase messages into ours', () => {
    expect(friendlyAuthError('A user with this email address has already been registered')).toMatch(
      /ya tiene una cuenta/u,
    );
    expect(friendlyAuthError('Email rate limit exceeded')).toMatch(/Espera/u);
    expect(friendlyAuthError('something odd')).toMatch(/No se pudo guardar/u);
  });
});
