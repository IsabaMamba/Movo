/**
 * The invitation link of a private group, from the client's side of 0046.
 *
 * One active link per group, made by whoever organizes it, good for 7 days
 * and a number of uses. The code is the whole secret; the URL around it is
 * this site's origin on the web, and EXPO_PUBLIC_SITE_URL elsewhere until a
 * domain is chosen.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { toApiError } from './errors';

export interface GroupInvite {
  code: string;
  expiresAt: string;
  maxUses: number;
  uses: number;
}

export interface InvitePreview {
  communityId: string;
  slug: string;
  name: string;
  description: string | null;
  rules: string | null;
  categoryIds: string[];
  isPublic: boolean;
  invitedBy: string | null;
  members: number;
  /** The caller is already in the group. */
  already: boolean;
}

export function toInvite(raw: unknown): GroupInvite | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.code !== 'string' || typeof r.expires_at !== 'string') return null;
  return {
    code: r.code,
    expiresAt: r.expires_at,
    maxUses: typeof r.max_uses === 'number' ? r.max_uses : 0,
    uses: typeof r.uses === 'number' ? r.uses : 0,
  };
}

export function toPreview(raw: unknown): InvitePreview | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.community_id !== 'string' || typeof r.name !== 'string') return null;
  return {
    communityId: r.community_id,
    slug: typeof r.slug === 'string' ? r.slug : '',
    name: r.name,
    description: typeof r.description === 'string' ? r.description : null,
    rules: typeof r.rules === 'string' ? r.rules : null,
    categoryIds: Array.isArray(r.category_ids)
      ? r.category_ids.filter((x): x is string => typeof x === 'string')
      : [],
    isPublic: r.is_public === true,
    invitedBy: typeof r.invited_by === 'string' ? r.invited_by : null,
    members: typeof r.members === 'number' ? r.members : 0,
    already: r.already === true,
  };
}

/** The current link, for whoever organizes; null when there is none. */
export async function fetchGroupInvite(
  db: SupabaseClient,
  communityId: string,
): Promise<GroupInvite | null> {
  const { data, error } = await db.rpc('group_invite', { p_community_id: communityId });
  if (error) throw toApiError(error);
  return toInvite(data);
}

/** A new link; the previous one stops working. */
export async function createGroupInvite(
  db: SupabaseClient,
  communityId: string,
  maxUses = 10,
): Promise<GroupInvite> {
  const { data, error } = await db.rpc('create_group_invite', {
    p_community_id: communityId,
    p_max_uses: maxUses,
  });
  if (error) throw toApiError(error);
  const invite = toInvite(data);
  if (!invite) throw new Error('No se pudo crear el enlace.');
  return invite;
}

export async function revokeGroupInvite(db: SupabaseClient, communityId: string): Promise<void> {
  const { error } = await db.rpc('revoke_group_invite', { p_community_id: communityId });
  if (error) throw toApiError(error);
}

/** What the invitation screen shows. Null for a code that does not work. */
export async function fetchInvitePreview(
  db: SupabaseClient,
  code: string,
): Promise<InvitePreview | null> {
  const { data, error } = await db.rpc('invite_preview', { p_code: code });
  if (error) throw toApiError(error);
  return toPreview(data);
}

/** Join with the code. Returns the group's slug, to open it. */
export async function joinGroupWithCode(
  db: SupabaseClient,
  code: string,
): Promise<{ slug: string; already: boolean }> {
  const { data, error } = await db.rpc('join_group_with_code', { p_code: code });
  if (error) throw toApiError(error);
  const r = (data ?? {}) as { slug?: string; already?: boolean };
  return { slug: r.slug ?? '', already: r.already === true };
}

/** «movo.app/g/K7Q2M9XP», with the origin this build knows. */
export function inviteUrl(code: string, origin: string | null): string {
  const base = (origin ?? '').replace(/\/+$/u, '');
  return base === '' ? `/g/${code}` : `${base}/g/${code}`;
}

/** «Vence el lun 9 nov · la usaron 3 de 10». */
export function inviteStatus(invite: GroupInvite): string {
  const day = new Intl.DateTimeFormat('es-CR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Costa_Rica',
  })
    .format(new Date(invite.expiresAt))
    .replace(/[.,]/g, '');
  return `Vence el ${day} · ${invite.uses === 1 ? 'la usó 1' : `la usaron ${invite.uses}`} de ${invite.maxUses}`;
}
