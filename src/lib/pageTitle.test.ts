import { describe, expect, it } from 'vitest';

import { pageTitle } from './pageTitle';

describe('pageTitle', () => {
  it('names the tabs', () => {
    expect(pageTitle('/')).toBe('Descubrir · Movo');
    expect(pageTitle('/mis-sesiones')).toBe('Mis sesiones · Movo');
    expect(pageTitle('/cuenta')).toBe('Perfil · Movo');
  });

  it('does not say Movo twice on the landing page', () => {
    expect(pageTitle('/inicio')).toBe('Movo — encuentra con quién moverte');
  });

  it('ignores a trailing slash, a query and a fragment', () => {
    expect(pageTitle('/normas/')).toBe('Normas de la comunidad · Movo');
    expect(pageTitle('/sign-in?next=/g/ABC')).toBe('Entrar · Movo');
    expect(pageTitle('/recuperar#type=recovery')).toBe('Cambiar contraseña · Movo');
  });

  it('never names the session, the group or the person', () => {
    expect(pageTitle('/sesion/8e03be8f-0aad-499c-a91e-b80cb4e74499')).toBe('Sesión · Movo');
    expect(pageTitle('/grupos/mejengueros')).toBe('Grupo · Movo');
    expect(pageTitle('/persona/123')).toBe('Perfil · Movo');
    expect(pageTitle('/s/ABC234')).toBe('Sesión · Movo');
  });

  it('covers the pages under a section', () => {
    expect(pageTitle('/ayuda/como-marco-llegue')).toBe('Ayuda · Movo');
    expect(pageTitle('/organizar/serie/abc')).toBe('Organizar · Movo');
    expect(pageTitle('/perfil/contrasena')).toBe('Perfil · Movo');
  });

  it('is plain Movo for a path nobody listed', () => {
    expect(pageTitle('/algo-nuevo')).toBe('Movo');
    expect(pageTitle('')).toBe('Descubrir · Movo');
  });
});
