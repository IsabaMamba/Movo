import { describe, expect, it } from 'vitest';

import { MIN_PASSWORD_LENGTH, passwordOk, passwordProblem } from './password';

describe('the password rule', () => {
  it('is eight characters, as the handoff and config.toml say', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(passwordOk('1234567')).toBe(false);
    expect(passwordOk('12345678')).toBe(true);
  });

  it('says how many are missing, and nothing while the field is empty', () => {
    expect(passwordProblem('')).toBeNull();
    expect(passwordProblem('abc')).toBe('Te faltan 5 caracteres.');
    expect(passwordProblem('abcdefg')).toBe('Te falta 1 carácter.');
    expect(passwordProblem('abcdefgh')).toBeNull();
  });
});
