/**
 * What the browser tab says.
 *
 * Until now every page had an empty title, so a tab, a bookmark and the
 * browser's history all read «localhost:8081» or the bare address. Decided in
 * one place, like the robots rule (lib/robots.ts), so a new screen has a
 * title without anybody remembering: an unknown path is plain «Movo».
 *
 * A title never names a session, a group or a person: titles end up in the
 * browser's history and in shared screens, and those pages are noindex for
 * the same reason.
 */

const NAME = 'Movo';

/** Exact paths. The first segment decides for everything else. */
const EXACT: Readonly<Record<string, string>> = {
  '/': 'Descubrir',
  '/inicio': 'Movo — encuentra con quién moverte',
  '/mis-sesiones': 'Mis sesiones',
  '/crear': 'Crear una sesión',
  '/grupos': 'Grupos',
  '/cuenta': 'Perfil',
  '/sign-in': 'Entrar',
  '/sign-up': 'Crear cuenta',
  '/recuperar': 'Cambiar contraseña',
  '/registro': 'Tu cuenta',
  '/normas': 'Normas de la comunidad',
  '/ayuda': 'Ayuda',
  '/avisos': 'Avisos',
  '/chats': 'Chats',
  '/historial': 'Historial',
  '/lugares': 'Mis lugares',
  '/permisos': 'Tus permisos',
  '/organizar': 'Organizar',
};

const BY_SECTION: Readonly<Record<string, string>> = {
  sesion: 'Sesión',
  serie: 'Serie',
  s: 'Sesión',
  g: 'Invitación a un grupo',
  grupos: 'Grupo',
  persona: 'Perfil',
  perfil: 'Perfil',
  chat: 'Chat',
  editar: 'Editar sesión',
  organizar: 'Organizar',
  ayuda: 'Ayuda',
  staff: 'Equipo',
};

/** «Mis sesiones · Movo». Query strings and trailing slashes are ignored. */
export function pageTitle(pathname: string): string {
  const path = pathname.split(/[?#]/u)[0] ?? '';
  const trimmed = path.length > 1 ? path.replace(/\/+$/u, '') : path || '/';
  const exact = EXACT[trimmed];
  if (exact !== undefined) return exact.includes(NAME) ? exact : `${exact} · ${NAME}`;
  const section = BY_SECTION[trimmed.split('/')[1] ?? ''];
  return section === undefined ? NAME : `${section} · ${NAME}`;
}
