/**
 * Registro v3 (4 November; 0060): the account first, then four steps.
 *
 * Apple and Google create the account without a date of birth, so the steps
 * are calls made with a session rather than sign-up metadata:
 *
 *   1. Sobre ti — name and date of birth (`set_about_me`). Under 18 the
 *      database deletes the account there and then.
 *   2. Tu género — `set_my_gender` (0035).
 *   3. Tus deportes — `set_my_interests` (0034); the level comes later, in
 *      Perfil.
 *   4. ¿Dónde te mueves? — the approximate point becomes a distrito
 *      (`set_my_district_from_point`), or the person types it. Only the
 *      code is kept.
 *
 * Then the rules (`record_consent('rules', …)`), `finish_signup()`, and the
 * notifications. The app shows the steps until `completed` is true.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { MIN_AGE, parseBirthdate, todayInCostaRica } from './age';
import type { Gender } from './gender';
import type { Point } from './location';
import { toApiError } from './errors';

export type SignupStep = 'about' | 'gender' | 'sports' | 'zone' | 'rules' | 'push';

/** The four numbered steps; the rules and the notifications come after. */
export const NUMBERED_STEPS: readonly SignupStep[] = ['about', 'gender', 'sports', 'zone'];
export const STEP_COUNT = NUMBERED_STEPS.length;

/** «Paso 2 de 4», or null after the numbered steps. */
export function stepLabel(step: SignupStep): string | null {
  const i = NUMBERED_STEPS.indexOf(step);
  return i < 0 ? null : `Paso ${String(i + 1)} de ${String(STEP_COUNT)}`;
}

export interface SignupStatus {
  displayName: string;
  hasBirthdate: boolean;
  gender: Gender | null;
  sports: number;
  district: Zone | null;
  radiusKm: RadiusKm;
  completed: boolean;
}

export interface Zone {
  code: string;
  name: string;
  canton: string | null;
}

/** «San Juan, Tibás». */
export function zoneLabel(z: Zone): string {
  return z.canton && z.canton !== z.name ? `${z.name}, ${z.canton}` : z.name;
}

export const RADIUS_CHOICES = [5, 15, 25, 50] as const;
export type RadiusKm = (typeof RADIUS_CHOICES)[number];
export const DEFAULT_RADIUS: RadiusKm = 25;

function asRadius(value: unknown): RadiusKm {
  return RADIUS_CHOICES.find((r) => r === value) ?? 15;
}

/** The handle_new_user() fallback: not a name anybody chose. */
const PLACEHOLDER_NAME = 'Nuevo usuario';

interface StatusRow {
  display_name?: string | null;
  has_birthdate?: boolean;
  gender?: string | null;
  sports?: number;
  home_district?: string | null;
  district_name?: string | null;
  canton_name?: string | null;
  radius_km?: number;
  completed?: boolean;
}

export function toStatus(row: StatusRow): SignupStatus {
  const gender = row.gender;
  return {
    displayName: row.display_name && row.display_name !== PLACEHOLDER_NAME ? row.display_name : '',
    hasBirthdate: row.has_birthdate === true,
    gender: gender === 'mujer' || gender === 'hombre' || gender === 'no_dice' ? gender : null,
    sports: row.sports ?? 0,
    district:
      row.home_district && row.district_name
        ? { code: row.home_district, name: row.district_name, canton: row.canton_name ?? null }
        : null,
    radiusKm: asRadius(row.radius_km),
    completed: row.completed === true,
  };
}

/**
 * The first step still to do. Going through them in order on every visit
 * would ask an Apple account for things it already gave; this resumes.
 */
export function firstStep(status: SignupStatus, rulesAccepted: boolean): SignupStep {
  if (!status.hasBirthdate || status.displayName === '') return 'about';
  if (status.gender === null) return 'gender';
  if (status.sports === 0) return 'sports';
  if (status.district === null) return 'zone';
  if (!rulesAccepted || !status.completed) return 'rules';
  return 'push';
}

/** Null when the caller has no profile (signed out, or just deleted). */
export async function fetchSignupStatus(db: SupabaseClient): Promise<SignupStatus | null> {
  const { data, error } = await db.rpc('my_signup');
  if (error) throw toApiError(error);
  return data ? toStatus(data as StatusRow) : null;
}

/** 'under_age': the account no longer exists; sign out and say so. */
export async function setAboutMe(
  db: SupabaseClient,
  displayName: string,
  birthdate: string,
): Promise<'ok' | 'under_age'> {
  const { data, error } = await db.rpc('set_about_me', {
    p_display_name: displayName.trim(),
    p_birthdate: birthdate,
  });
  if (error) throw toApiError(error);
  return data === 'under_age' ? 'under_age' : 'ok';
}

export async function setMySports(
  db: SupabaseClient,
  categories: readonly string[],
): Promise<void> {
  const { error } = await db.rpc('set_my_interests', { p_categories: categories });
  if (error) throw toApiError(error);
}

function toZone(data: unknown): Zone | null {
  if (data === null || typeof data !== 'object') return null;
  const z = data as { code?: string; name?: string; canton?: string | null };
  return z.code && z.name ? { code: z.code, name: z.name, canton: z.canton ?? null } : null;
}

/**
 * The point is already rounded to a kilometre (`coarsen`), is rounded again
 * by the database, and is kept by neither. Null: outside Costa Rica.
 */
export async function districtFromPoint(db: SupabaseClient, point: Point): Promise<Zone | null> {
  const { data, error } = await db.rpc('set_my_district_from_point', {
    p_lat: point.lat,
    p_lng: point.lng,
  });
  if (error) throw toApiError(error);
  return toZone(data);
}

export async function setDistrict(db: SupabaseClient, code: string): Promise<Zone> {
  const { data, error } = await db.rpc('set_my_district', { p_code: code });
  if (error) throw toApiError(error);
  const zone = toZone(data);
  if (zone === null) throw new Error('Elige un distrito de la lista.');
  return zone;
}

export async function setSearchRadius(db: SupabaseClient, km: RadiusKm): Promise<void> {
  const { error } = await db.rpc('set_my_search_radius', { p_km: km });
  if (error) throw toApiError(error);
}

export async function finishSignup(db: SupabaseClient): Promise<void> {
  const { error } = await db.rpc('finish_signup');
  if (error) throw toApiError(error);
}

/** The five rules the last step shows (Registro v3 · 12); the rest are a link away. */
export const RULES_TOP_FIVE: readonly {
  icon: 'pin' | 'hand' | 'shield' | 'flag' | 'lock';
  title: string;
  detail: string;
}[] = [
  {
    icon: 'pin',
    title: 'Solo lugares públicos',
    detail: 'Parques, canchas y senderos. Nunca una casa.',
  },
  {
    icon: 'hand',
    title: 'Trata bien a la gente',
    detail: 'Sin insultos ni discriminación. Quien empieza vale igual.',
  },
  {
    icon: 'shield',
    title: 'Lo solo para mujeres se respeta',
    detail: 'Entrar sin serlo es suspensión.',
  },
  {
    icon: 'flag',
    title: 'Si algo pasa, reporta',
    detail: 'Una persona del equipo lee cada reporte.',
  },
  {
    icon: 'lock',
    title: 'Lo de las otras personas no sale de Movo',
    detail: 'Ni fotos ni listas, sin permiso.',
  },
];

/** «A 25 km buscamos sesiones de tus deportes.» */
export function radiusLine(km: RadiusKm): string {
  return `A ${String(km)} km de tu zona buscamos sesiones de tus deportes. Lo cambias en Descubrir.`;
}

export type BirthStep =
  | { kind: 'ok'; iso: string }
  /** A real date, under 18: the account is deleted when they confirm. */
  | { kind: 'under_age'; iso: string }
  | { kind: 'problem'; problem: string };

/**
 * Step 1's date. Unlike the old form, an under-18 date is not just refused:
 * the account already exists (Apple, Google), so it is sent and deleted.
 */
export function birthStep(
  day: string,
  month: string,
  year: string,
  today: string = todayInCostaRica(),
): BirthStep {
  const parsed = parseBirthdate(day, month, year, today);
  if (parsed.ok) return { kind: 'ok', iso: parsed.iso };
  if (parsed.problem.includes(`${String(MIN_AGE)} años`)) {
    const any = parseBirthdate(day, month, year, '9999-12-31');
    if (any.ok) return { kind: 'under_age', iso: any.iso };
  }
  return { kind: 'problem', problem: parsed.problem };
}
