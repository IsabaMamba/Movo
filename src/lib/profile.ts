/**
 * Perfil v2 (0034): the caller's own profile, edited in one place.
 *
 * The zone is a distrito code that no client can select (0034), so the
 * owner reads it through my_profile() and nobody else reads it at all. The
 * public profile — what people sharing a session or a group see — is the
 * name, the photo when there is one, the sports, the bio, and since when.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { toApiError } from './errors';

export const BIO_MAX = 160;
export const MAX_SPORTS = 10;

export interface MyProfile {
  id: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  home_district: string | null;
  district_name: string | null;
  canton_name: string | null;
  interests: string[];
}

export async function fetchMyProfile(db: SupabaseClient): Promise<MyProfile | null> {
  const { data, error } = await db.rpc('my_profile');
  if (error) throw toApiError(error);
  return (data as MyProfile | null) ?? null;
}

export interface ProfileEdit {
  userId: string;
  displayName: string;
  bio: string;
  homeDistrict: string | null;
  interests: string[];
}

export async function saveMyProfile(db: SupabaseClient, edit: ProfileEdit): Promise<void> {
  const { error } = await db
    .from('profiles')
    .update({
      display_name: edit.displayName.trim(),
      bio: edit.bio.trim() || null,
      home_district: edit.homeDistrict,
    })
    .eq('id', edit.userId);
  if (error) throw toApiError(error);

  const { error: sportsError } = await db.rpc('set_my_interests', {
    p_categories: edit.interests,
  });
  if (sportsError) throw toApiError(sportsError);
}

// ------------------------------------------------------------ the zone

export interface DistrictOption {
  code: string;
  /** «Tibás · San José»: the distrito, then its cantón. */
  label: string;
  /** Lower-case, no accents, for searching. */
  key: string;
}

interface ZoneRow {
  code: string;
  kind: string;
  name: string;
  parent_code: string | null;
}

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Every distrito with its cantón, sorted by label. */
export function districtOptions(rows: readonly ZoneRow[]): DistrictOption[] {
  const cantons = new Map(rows.filter((r) => r.kind === 'canton').map((r) => [r.code, r.name]));
  return rows
    .filter((r) => r.kind === 'distrito')
    .map((r) => {
      const canton = r.parent_code ? cantons.get(r.parent_code) : undefined;
      const label = canton ? `${r.name} · ${canton}` : r.name;
      return { code: r.code, label, key: fold(label) };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

/** Matches on any word start, ignoring accents: «tibas», «san jo». */
export function searchDistricts(
  options: readonly DistrictOption[],
  query: string,
  limit = 8,
): DistrictOption[] {
  const q = fold(query);
  if (q.length < 2) return [];
  return options.filter((o) => o.key.startsWith(q) || o.key.includes(` ${q}`)).slice(0, limit);
}

export async function fetchDistrictOptions(db: SupabaseClient): Promise<DistrictOption[]> {
  const { data, error } = await db
    .from('zones')
    .select('code, kind, name, parent_code')
    .in('kind', ['distrito', 'canton']);
  if (error) throw toApiError(error);
  return districtOptions((data ?? []) as ZoneRow[]);
}

// ------------------------------------------------------- what others see

/** «En Movo desde septiembre 2026», in Costa Rica's calendar. */
export function sinceLabel(createdAt: string): string {
  const month = new Intl.DateTimeFormat('es-CR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Costa_Rica',
  }).format(new Date(createdAt));
  return `En Movo desde ${month.replace(' de ', ' ')}`;
}

/** Up to two initials, for the avatar until there is a photo. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '·';
}

export function bioProblem(bio: string): string | null {
  return bio.trim().length > BIO_MAX ? `Hasta ${BIO_MAX} caracteres.` : null;
}
