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
  ActivityVisibility,
  Category,
  CategoryId,
  CurrencyCode,
  JsonSchemaObject,
  Location,
  NearbyActivity,
  ParticipationStatus,
  SkillLevel,
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

// ------------------------------------------------------------- authoring

/**
 * Thrown when attributes do not satisfy the category's schema. Carries the
 * per-field issues so a form can mark the offending inputs rather than showing
 * one message at the top.
 */
export class AttributeValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(`Attributes failed validation: ${issues.map((i) => i.field).join(', ')}`);
    this.name = 'AttributeValidationError';
    this.issues = issues;
  }
}

/**
 * Venues a session may be published at.
 *
 * Only public ones. `locations.is_public_venue` exists so a session cannot be
 * held at somebody's house, and the create flow is where that is enforced in
 * front of the person rather than after the fact.
 */
export async function fetchPublicVenues(db: SupabaseClient): Promise<Location[]> {
  const { data, error } = await db
    .from('locations')
    .select('*')
    .eq('is_public_venue', true)
    .order('is_verified', { ascending: false })
    .order('name');

  if (error) throw toApiError(error);
  return (data ?? []) as Location[];
}

/** Everything the two authoring calls share. */
export interface NewSessionBase {
  categoryId: CategoryId;
  locationId: string;
  title: string;
  durationMinutes: number;
  skill: SkillLevel;
  /** Stored 1-5; the UI collects three bands and maps them. */
  difficulty: number | null;
  /** null means uncapped, which is the common case. */
  maxParticipants: number | null;
  priceMinor: number;
  currency: CurrencyCode;
  attributes: Record<string, unknown>;
}

export interface NewActivityInput extends NewSessionBase {
  startsAt: Date;
  meetingPoint?: string | null;
  visibility: ActivityVisibility;
  /** Published sessions appear in Descubrir; drafts are visible only to their organizer. */
  publish: boolean;
}

function assertAttributes(schema: JsonSchemaObject, attributes: Record<string, unknown>): void {
  const issues = validateAttributes(schema, attributes);
  if (issues.length > 0) throw new AttributeValidationError(issues);
}

/**
 * Create one session and return its id.
 *
 * There is no RPC for this: `activities` grants INSERT to authenticated and the
 * policy pins `organizer_id` to `auth.uid()`, so the row is safe to write
 * directly. Participation is the thing that needs a function, because capacity
 * is only correct under a lock.
 */
export async function createActivity(
  db: SupabaseClient,
  organizerId: string,
  input: NewActivityInput,
  schema: JsonSchemaObject,
): Promise<string> {
  assertAttributes(schema, input.attributes);

  const endsAt = new Date(input.startsAt.getTime() + input.durationMinutes * 60_000);

  const { data, error } = await db
    .from('activities')
    .insert({
      organizer_id: organizerId,
      category_id: input.categoryId,
      location_id: input.locationId,
      title: input.title.trim(),
      starts_at: input.startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      meeting_point: input.meetingPoint?.trim() || null,
      max_participants: input.maxParticipants,
      skill: input.skill,
      difficulty: input.difficulty,
      price_minor: input.priceMinor,
      currency: input.currency,
      attributes: input.attributes,
      visibility: input.visibility,
      status: input.publish ? 'published' : 'draft',
    })
    .select('id')
    .single();

  if (error) throw toApiError(error);
  return (data as { id: string }).id;
}

export interface NewSeriesInput extends NewSessionBase {
  /** 0 = Sunday, matching Postgres extract(dow). */
  weekday: number;
  /** 'HH:MM' in the series timezone. */
  localStartTime: string;
  timezone?: string;
}

/**
 * Create a recurring series and materialize its first occurrences.
 *
 * A run club is one object that meets every Tuesday, not forty unrelated rows —
 * which is why the create form offers a switch rather than a second flow.
 * Returns the series id and how many sessions were actually generated, because
 * "se repite" without a number is a promise nobody can check.
 */
export async function createSeries(
  db: SupabaseClient,
  organizerId: string,
  input: NewSeriesInput,
  schema: JsonSchemaObject,
  until?: Date,
): Promise<{ seriesId: string; generated: number }> {
  assertAttributes(schema, input.attributes);

  const { data, error } = await db
    .from('activity_series')
    .insert({
      organizer_id: organizerId,
      category_id: input.categoryId,
      location_id: input.locationId,
      title: input.title.trim(),
      frequency: 'weekly',
      weekday: input.weekday,
      local_start_time: input.localStartTime,
      duration_minutes: input.durationMinutes,
      timezone: input.timezone ?? DEFAULT_TIMEZONE,
      skill: input.skill,
      difficulty: input.difficulty,
      max_participants: input.maxParticipants,
      price_minor: input.priceMinor,
      currency: input.currency,
      attributes: input.attributes,
    })
    .select('id')
    .single();

  if (error) throw toApiError(error);

  const seriesId = (data as { id: string }).id;
  const generated = await generateSeriesOccurrences(db, seriesId, until);
  return { seriesId, generated };
}
