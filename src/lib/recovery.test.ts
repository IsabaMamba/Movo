import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import {
  isRecoveryUrl,
  recoveredPasswordProblem,
  recoveryLinkFailed,
  requestRecovery,
  saveRecoveredPassword,
} from './recovery';

describe('isRecoveryUrl', () => {
  it('recognises the fragment Supabase comes back with', () => {
    expect(isRecoveryUrl('#access_token=a&refresh_token=b&type=recovery', '')).toBe(true);
  });

  it('recognises the query form too', () => {
    expect(isRecoveryUrl('', '?code=abc&type=recovery')).toBe(true);
  });

  it('is false for a sign-up confirmation and for nothing', () => {
    expect(isRecoveryUrl('#access_token=a&type=signup', '')).toBe(false);
    expect(isRecoveryUrl('', '')).toBe(false);
  });
});

describe('recoveryLinkFailed', () => {
  it('sees an expired link, in the fragment or the query', () => {
    expect(recoveryLinkFailed('#error=access_denied&error_code=otp_expired', '')).toBe(true);
    expect(recoveryLinkFailed('', '?error_code=otp_expired')).toBe(true);
    expect(recoveryLinkFailed('#access_token=a&type=recovery', '')).toBe(false);
  });
});

describe('recoveredPasswordProblem', () => {
  it('asks for eight characters, then for the two to match', () => {
    expect(recoveredPasswordProblem('corta', 'corta')).toMatch(/8 caracteres/);
    expect(recoveredPasswordProblem('suficiente', 'distinta1')).toMatch(/no coinciden/);
    expect(recoveredPasswordProblem('suficiente', 'suficiente')).toBeNull();
  });
});

function client(auth: Record<string, unknown>): SupabaseClient {
  return { auth } as unknown as SupabaseClient;
}

describe('requestRecovery', () => {
  it('sends the trimmed, lower-cased address', async () => {
    const reset = vi.fn().mockResolvedValue({ error: null });
    await requestRecovery(client({ resetPasswordForEmail: reset }), '  Ana@Ejemplo.CR ', 'x');
    expect(reset).toHaveBeenCalledWith('ana@ejemplo.cr', { redirectTo: 'x' });
  });

  it('does not say whether the address has an account', async () => {
    const reset = vi.fn().mockResolvedValue({ error: { message: 'User not found' } });
    await expect(
      requestRecovery(client({ resetPasswordForEmail: reset }), 'a@b.cr', undefined),
    ).resolves.toBeUndefined();
  });

  it('does say when the person tried too many times', async () => {
    const reset = vi.fn().mockResolvedValue({ error: { message: 'Email rate limit exceeded' } });
    await expect(
      requestRecovery(client({ resetPasswordForEmail: reset }), 'a@b.cr', undefined),
    ).rejects.toThrow(/muchas veces/);
  });
});

describe('saveRecoveredPassword', () => {
  it('saves, then signs the other sessions out', async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    const signOut = vi.fn().mockResolvedValue({ error: null });
    await saveRecoveredPassword(client({ updateUser, signOut }), 'nueva-clave');
    expect(updateUser).toHaveBeenCalledWith({ password: 'nueva-clave' });
    expect(signOut).toHaveBeenCalledWith({ scope: 'others' });
  });

  it('keeps the other sessions when the save fails', async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: { message: 'weak password' } });
    const signOut = vi.fn();
    await expect(saveRecoveredPassword(client({ updateUser, signOut }), 'x')).rejects.toThrow(
      /8 caracteres/,
    );
    expect(signOut).not.toHaveBeenCalled();
  });
});
