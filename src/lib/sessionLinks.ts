/**
 * A session's invitation link, movo.app/s/<code> (Enlace v1, 0055).
 *
 * The code is the caller's own for that session, made on first request, so
 * the page can say «Andrea te invita». The preview is open signed out and
 * says which state the session is in; it never names who is going.
 */

import { Platform } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

import { toApiError } from './errors';

export type LinkState = 'open' | 'full' | 'cancelled' | 'past' | 'group' | 'missing';

export interface LinkPreview {
  state: LinkState;
  activityId: string | null;
  seriesId: string | null;
  title: string;
  categoryId: string;
  skill: string;
  startsAt: string;
  endsAt: string;
  description: string | null;
  joinedCount: number;
  waitlistCount: number;
  maxParticipants: number | null;
  priceMinor: number;
  currency: string;
  venue: string;
  district: string | null;
  organizer: string;
  invitedBy: string | null;
  /** The caller's own status on this session, if any. */
  mine: string | null;
  /** For a past date of a series: the next one. */
  next: { activityId: string; startsAt: string } | null;
}

const STATES: readonly LinkState[] = ['open', 'full', 'cancelled', 'past', 'group', 'missing'];

function str(r: Record<string, unknown>, key: string): string | null {
  const v = r[key];
  return typeof v === 'string' && v !== '' ? v : null;
}

function num(r: Record<string, unknown>, key: string): number | null {
  const v = r[key];
  return typeof v === 'number' ? v : null;
}

export function toLinkPreview(raw: unknown): LinkPreview {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const state = STATES.find((s) => s === r.state) ?? 'missing';
  const next = (typeof r.next === 'object' && r.next !== null ? r.next : null) as Record<
    string,
    unknown
  > | null;
  const nextId = next ? str(next, 'activity_id') : null;
  const nextAt = next ? str(next, 'starts_at') : null;
  return {
    state,
    activityId: str(r, 'activity_id'),
    seriesId: str(r, 'series_id'),
    title: str(r, 'title') ?? '',
    categoryId: str(r, 'category_id') ?? '',
    skill: str(r, 'skill') ?? 'any',
    startsAt: str(r, 'starts_at') ?? '',
    endsAt: str(r, 'ends_at') ?? '',
    description: str(r, 'description'),
    joinedCount: num(r, 'joined_count') ?? 0,
    waitlistCount: num(r, 'waitlist_count') ?? 0,
    maxParticipants: num(r, 'max_participants'),
    priceMinor: num(r, 'price_minor') ?? 0,
    currency: str(r, 'currency') ?? 'CRC',
    venue: str(r, 'venue') ?? '',
    district: str(r, 'district'),
    organizer: str(r, 'organizer') ?? 'Quien organiza',
    invitedBy: str(r, 'invited_by'),
    mine: str(r, 'mine'),
    next: nextId && nextAt ? { activityId: nextId, startsAt: nextAt } : null,
  };
}

export async function fetchLinkPreview(db: SupabaseClient, code: string): Promise<LinkPreview> {
  const { data, error } = await db.rpc('session_link_preview', { p_code: code });
  if (error) throw toApiError(error);
  return toLinkPreview(data);
}

/** The caller's code for this session; the same one every time. */
export async function fetchSessionLink(db: SupabaseClient, activityId: string): Promise<string> {
  const { data, error } = await db.rpc('session_link', { p_activity_id: activityId });
  if (error) throw toApiError(error);
  if (typeof data !== 'string') throw new Error('No se pudo crear el enlace.');
  return data;
}

/** The web knows its own origin; a native build needs EXPO_PUBLIC_SITE_URL until there is a domain. */
export function siteOrigin(): string | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return process.env.EXPO_PUBLIC_SITE_URL ?? null;
}

/** «https://movo.app/s/7Q2K9M», or a path when the origin is not known. */
export function sessionLinkUrl(code: string, origin: string | null): string {
  const base = (origin ?? '').replace(/\/+$/u, '');
  return base === '' ? `/s/${code}` : `${base}/s/${code}`;
}

/** «1 de 10 van», «4 van». Only a count: the page never names who. */
export function goingLine(p: Pick<LinkPreview, 'joinedCount' | 'maxParticipants'>): string {
  return p.maxParticipants === null
    ? `${String(p.joinedCount)} van`
    : `${String(p.joinedCount)} de ${String(p.maxParticipants)} van`;
}
