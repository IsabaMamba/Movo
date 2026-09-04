/**
 * Typed wrappers around the participation RPCs.
 *
 * Every mutation goes through a Postgres function, never a direct table
 * write, because capacity and waitlist ordering are only correct under the
 * row lock those functions take. There is no INSERT grant on
 * activity_participants, so a direct `.insert()` here would fail anyway —
 * that is the design, not an oversight.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Activity,
  ActivityParticipant,
  Category,
  CategoryId,
  JsonSchemaObject,
  NearbyActivity,
  ParticipationStatus,
} from '../types/database';

/** Maps SQLSTATE codes raised by the RPCs onto something a screen can use. */
export type ApiErrorKind =
  'unauthenticated' | 'forbidden' | 'not_found' | 'invalid_state' | 'unknown';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly code?: string;

  constructor(kind: ApiErrorKind, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.code = code;
  }
}

function toApiError(error: { code?: string; message: string }): ApiError {
  switch (error.code) {
    case '42501':
      return new ApiError('forbidden', error.message, error.code);
    case 'P0002':
      return new ApiError('not_found', error.message, error.code);
    case '22023':
      return new ApiError('invalid_state', error.message, error.code);
    default:
      return new ApiError('unknown', error.message, error.code);
  }
}

// ------------------------------------------------------------ discovery

export interface NearbyOptions {
  lat: number;
  lng: number;
  radiusM?: number;
  categories?: CategoryId[];
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Upcoming public activities within `radiusM`, nearest-first within each
 * start time. Runs as SECURITY INVOKER, so row-level security still applies
 * and community-only sessions never appear for non-members.
 */
export async function fetchNearbyActivities(
  db: SupabaseClient,
  opts: NearbyOptions,
): Promise<NearbyActivity[]> {
  const { data, error } = await db.rpc('nearby_activities', {
    p_lat: opts.lat,
    p_lng: opts.lng,
    p_radius_m: opts.radiusM ?? 15_000,
    p_categories: opts.categories ?? null,
    p_from: (opts.from ?? new Date()).toISOString(),
    p_to: opts.to?.toISOString() ?? null,
    p_limit: opts.limit ?? 50,
    p_offset: opts.offset ?? 0,
  });

  if (error) throw toApiError(error);
  return (data ?? []) as NearbyActivity[];
}

// -------------------------------------------------------- participation

/**
 * Join an activity. Returns the status actually granted: `joined` when a
 * slot was free, `waitlisted` when it was not. Calling twice is a no-op.
 *
 * The screen must render the returned value rather than assuming success —
 * "estás en lista de espera" is a different state from "vas".
 */
export async function joinActivity(
  db: SupabaseClient,
  activityId: string,
): Promise<ParticipationStatus> {
  const { data, error } = await db.rpc('join_activity', {
    p_activity_id: activityId,
  });

  if (error) throw toApiError(error);
  return data as ParticipationStatus;
}

/** Leave. Promotes the head of the waitlist and notifies them. */
export async function leaveActivity(db: SupabaseClient, activityId: string): Promise<void> {
  const { error } = await db.rpc('leave_activity', {
    p_activity_id: activityId,
  });
  if (error) throw toApiError(error);
}

/** Organizer-only. This call is what creates attendance data. */
export async function checkIn(
  db: SupabaseClient,
  activityId: string,
  userId: string,
): Promise<void> {
  const { error } = await db.rpc('check_in', {
    p_activity_id: activityId,
    p_user_id: userId,
  });
  if (error) throw toApiError(error);
}

/**
 * Close a session out. Everyone still merely `joined` becomes `no_show`.
 * Returns how many. Call it from the organizer's post-session screen.
 */
export async function closeActivity(db: SupabaseClient, activityId: string): Promise<number> {
  const { data, error } = await db.rpc('close_activity', {
    p_activity_id: activityId,
  });
  if (error) throw toApiError(error);
  return (data as number) ?? 0;
}

/**
 * Materialize occurrences of a recurring series up to a horizon.
 * Idempotent — safe to call on every organizer app open.
 */
export async function generateSeriesOccurrences(
  db: SupabaseClient,
  seriesId: string,
  until?: Date,
): Promise<number> {
  const { data, error } = await db.rpc('generate_series_occurrences', {
    p_series_id: seriesId,
    p_until: (until ?? addDays(new Date(), 60)).toISOString().slice(0, 10),
  });
  if (error) throw toApiError(error);
  return (data as number) ?? 0;
}

// ------------------------------------------------------------- reading

export async function fetchActivity(
  db: SupabaseClient,
  activityId: string,
): Promise<Activity | null> {
  const { data, error } = await db
    .from('activities')
    .select('*')
    .eq('id', activityId)
    .maybeSingle();

  if (error) throw toApiError(error);
  return (data as Activity) ?? null;
}

/**
 * The roster. Visible to the organizer and to confirmed participants only —
 * enforced by RLS, so this returns an empty list rather than an error for
 * anyone else.
 */
export async function fetchRoster(
  db: SupabaseClient,
  activityId: string,
): Promise<
  Array<ActivityParticipant & { profile: { display_name: string; avatar_url: string | null } }>
> {
  const { data, error } = await db
    .from('activity_participants')
    .select('*, profile:profiles!activity_participants_user_id_fkey(display_name, avatar_url)')
    .eq('activity_id', activityId)
    .in('status', ['joined', 'waitlisted', 'attended'])
    .order('waitlist_pos', { ascending: true, nullsFirst: true });

  if (error) throw toApiError(error);
  return (data ?? []) as never;
}

export async function fetchCategories(db: SupabaseClient): Promise<Category[]> {
  const { data, error } = await db
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  if (error) throw toApiError(error);
  return (data ?? []) as Category[];
}

// ------------------------------------------------- attribute validation

export interface ValidationIssue {
  field: string;
  message: string;
}

/**
 * Validates `attributes` against the JSON Schema stored on the category.
 * Deliberately small — it covers the subset the seed schemas actually use.
 * Run it on the client for instant feedback and again server-side before
 * any write you do not fully control.
 */
export function validateAttributes(
  schema: JsonSchemaObject,
  attributes: Record<string, unknown>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const field of schema.required ?? []) {
    if (attributes[field] === undefined || attributes[field] === null) {
      issues.push({ field, message: 'Campo requerido' });
    }
  }

  for (const [field, value] of Object.entries(attributes)) {
    const prop = schema.properties[field];

    if (!prop) {
      if (schema.additionalProperties === false) {
        issues.push({ field, message: 'Campo no permitido para esta categoría' });
      }
      continue;
    }
    if (value === undefined || value === null) continue;

    const numeric = prop.type === 'number' || prop.type === 'integer';

    if (numeric) {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        issues.push({ field, message: 'Debe ser un número' });
        continue;
      }
      if (prop.type === 'integer' && !Number.isInteger(value)) {
        issues.push({ field, message: 'Debe ser un número entero' });
      }
      if (prop.minimum !== undefined && value < prop.minimum) {
        issues.push({ field, message: `Mínimo ${prop.minimum}` });
      }
      if (prop.maximum !== undefined && value > prop.maximum) {
        issues.push({ field, message: `Máximo ${prop.maximum}` });
      }
    } else if (prop.type === 'boolean' && typeof value !== 'boolean') {
      issues.push({ field, message: 'Debe ser verdadero o falso' });
    } else if (prop.type === 'string') {
      if (typeof value !== 'string') {
        issues.push({ field, message: 'Debe ser texto' });
      } else if (prop.enum && !prop.enum.includes(value)) {
        issues.push({ field, message: `Debe ser uno de: ${prop.enum.join(', ')}` });
      }
    } else if (prop.type === 'array') {
      if (!Array.isArray(value)) {
        issues.push({ field, message: 'Debe ser una lista' });
      } else if (prop.items?.enum) {
        const allowed = prop.items.enum;
        if (value.some((v) => typeof v !== 'string' || !allowed.includes(v))) {
          issues.push({ field, message: `Valores permitidos: ${allowed.join(', ')}` });
        }
      }
    }
  }

  return issues;
}

// --------------------------------------------------------------- utils

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Costa Rica has no DST, but naming the zone keeps Panama/Guatemala honest. */
export const DEFAULT_TIMEZONE = 'America/Costa_Rica';

export function formatSessionTime(
  isoInstant: string,
  timeZone: string = DEFAULT_TIMEZONE,
  locale = 'es-CR',
): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(isoInstant));
}
