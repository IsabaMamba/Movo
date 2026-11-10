import { describe, expect, it } from 'vitest';

import { signInMessage } from './authErrors';

describe('signInMessage', () => {
  it('never shows the English sentence Supabase sends', () => {
    const said = signInMessage(new Error('Invalid login credentials'));
    expect(said).toMatch(/no coinciden/);
    expect(said).not.toMatch(/invalid/i);
  });

  it('does not say which half was wrong', () => {
    const said = signInMessage(new Error('Invalid login credentials'));
    expect(said).toMatch(/correo o la contraseña/);
  });

  it('tells an unconfirmed account what is missing', () => {
    expect(signInMessage(new Error('Email not confirmed'))).toMatch(/confirmar tu correo/);
  });

  it('knows too many tries and no connection', () => {
    expect(signInMessage(new Error('Request rate limit reached'))).toMatch(/muchas veces/);
    expect(signInMessage(new TypeError('Failed to fetch'))).toMatch(/conexión/);
  });

  it('has a sentence for anything else, including a non-error', () => {
    expect(signInMessage('boom')).toMatch(/No se pudo iniciar sesión/);
    expect(signInMessage(new Error('something new'))).toMatch(/No se pudo iniciar sesión/);
  });
});
