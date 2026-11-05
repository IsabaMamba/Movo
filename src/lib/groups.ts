/**
 * Grupos v1 (2 November walkthrough, step 11): «Tus grupos» with each
 * group's next session, then the open groups with how many sessions they
 * have this week. Two reads on top of fetchCommunities(): the caller's
 * memberships, and the upcoming sessions of the groups on screen — which
 * RLS already filters to what the caller may see (community sessions only
 * for members).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { toApiError } from './errors';

export type GroupRole = 'member' | 'organizer' | 'owner';

export async function fetchMyGroupRoles(
  db: SupabaseClient,
  userId: string,
): Promise<Map<string, GroupRole>> {
  const { data, error } = await db
    .from('community_members')
    .select('community_id, role')
    .eq('user_id', userId);
  if (error) throw toApiError(error);
  return new Map(
    ((data ?? []) as { community_id: string; role: GroupRole }[]).map((r) => [
      r.community_id,
      r.role,
    ]),
  );
}

export interface GroupSessionRow {
  id: string;
  title: string;
  starts_at: string;
  community_id: string;
}

export async function fetchGroupSessions(
  db: SupabaseClient,
  communityIds: readonly string[],
): Promise<GroupSessionRow[]> {
  if (communityIds.length === 0) return [];
  const { data, error } = await db
    .from('activities')
    .select('id, title, starts_at, community_id')
    .in('community_id', communityIds as string[])
    .in('status', ['published', 'full'])
    .gt('starts_at', new Date().toISOString())
    .order('starts_at')
    .limit(200);
  if (error) throw toApiError(error);
  return (data ?? []) as GroupSessionRow[];
}

export interface GroupAgenda {
  next: { id: string; title: string; starts_at: string } | null;
  /** Sessions in the next 7 days. */
  thisWeek: number;
}

/** Per group: its next session and how many it has in the coming week. */
export function groupAgenda(
  rows: readonly GroupSessionRow[],
  now: Date = new Date(),
): Map<string, GroupAgenda> {
  const week = now.getTime() + 7 * 24 * 60 * 60_000;
  const out = new Map<string, GroupAgenda>();
  for (const row of [...rows].sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1))) {
    const t = new Date(row.starts_at).getTime();
    if (t <= now.getTime()) continue;
    const current = out.get(row.community_id) ?? { next: null, thisWeek: 0 };
    if (current.next === null) {
      current.next = { id: row.id, title: row.title, starts_at: row.starts_at };
    }
    if (t <= week) current.thisWeek += 1;
    out.set(row.community_id, current);
  }
  return out;
}

/** «organizas» for an owner or organizer, nothing for a member. */
export function roleWord(role: GroupRole | undefined): string | null {
  return role === 'owner' || role === 'organizer' ? 'organizas' : null;
}

/** Two letters for the group's tile: «Corredores de Tibás» → «CT». */
export function groupInitials(name: string): string {
  const words = name.split(/\s+/u).filter((w) => w.length > 2 || /^[A-ZÁÉÍÓÚÑ0-9]/u.test(w));
  const letters = (words.length >= 2 ? [words[0], words[words.length - 1]] : [words[0] ?? name])
    .map((w) => (w ?? '').charAt(0))
    .join('');
  return letters.toUpperCase() || '·';
}

export interface GroupSession {
  id: string;
  title: string;
  starts_at: string;
  joined_count: number;
  max_participants: number | null;
  series_id: string | null;
  category_id: string;
  visibility: string;
}

/** A group's upcoming sessions for its «Sesiones» tab. RLS decides which. */
export async function fetchGroupUpcoming(
  db: SupabaseClient,
  communityId: string,
): Promise<GroupSession[]> {
  const { data, error } = await db
    .from('activities')
    .select(
      'id, title, starts_at, joined_count, max_participants, series_id, category_id, visibility',
    )
    .eq('community_id', communityId)
    .in('status', ['published', 'full'])
    .gt('starts_at', new Date().toISOString())
    .order('starts_at')
    .limit(30);
  if (error) throw toApiError(error);
  return (data ?? []) as GroupSession[];
}

// ------------------------------------------------- up to three sports (0037)

export const MAX_GROUP_SPORTS = 3;

/**
 * A group's sports, in its order. Rows read before 0037 reached the client
 * carry only category_id, so that is the fallback.
 */
export function groupSports(group: {
  category_id: string | null;
  category_ids?: readonly string[] | null;
}): string[] {
  if (group.category_ids && group.category_ids.length > 0) return [...group.category_ids];
  return group.category_id ? [group.category_id] : [];
}

/** Tap a sport chip: off if it was on, on if there is room; the fourth does nothing. */
export function toggleSport(selected: readonly string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter((s) => s !== id);
  return selected.length >= MAX_GROUP_SPORTS ? [...selected] : [...selected, id];
}

// ------------------------------------------------- Ajustes del grupo (Grupos v6 · 5)

export interface GroupEdit {
  name: string;
  description: string;
  rules: string;
  categoryIds: string[];
  isPublic: boolean;
}

/**
 * Whoever organizes edits the group directly: communities_update_organizer
 * (0003) allows it, and 0037's trigger checks the sports and keeps
 * category_id as the first.
 */
export async function updateGroup(
  db: SupabaseClient,
  communityId: string,
  edit: GroupEdit,
): Promise<void> {
  const { error } = await db
    .from('communities')
    .update({
      name: edit.name.trim(),
      description: edit.description.trim() || null,
      rules: edit.rules.trim() || null,
      category_ids: edit.categoryIds,
      is_public: edit.isPublic,
    })
    .eq('id', communityId);
  if (error) throw toApiError(error);
}

/**
 * Make somebody organize, or stop. Never the owner's row: whoever created
 * the group stays its owner until it is handed over.
 */
export async function setMemberRole(
  db: SupabaseClient,
  communityId: string,
  userId: string,
  role: 'member' | 'organizer',
): Promise<void> {
  const { error } = await db
    .from('community_members')
    .update({ role })
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .neq('role', 'owner');
  if (error) throw toApiError(error);
}

/** Why the group form cannot be saved yet, or null. */
export function groupEditProblem(edit: Pick<GroupEdit, 'name' | 'categoryIds'>): string | null {
  const name = edit.name.trim();
  if (name.length < 2) return 'El nombre necesita al menos 2 letras.';
  if (name.length > 80) return 'El nombre cabe en 80 caracteres.';
  if (edit.categoryIds.length > MAX_GROUP_SPORTS) return 'Hasta 3 deportes.';
  return null;
}
