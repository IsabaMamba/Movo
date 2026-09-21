/**
 * Database types.
 *
 * Hand-written to match supabase/migrations. Once the project exists you can
 * regenerate the authoritative version with:
 *
 *   supabase gen types typescript --local > src/types/database.generated.ts
 *
 * Keep this file for the domain-level aliases and RPC signatures, which the
 * generator does not express as well.
 */

export type SkillLevel = 'any' | 'beginner' | 'intermediate' | 'advanced';

export type ActivityStatus = 'draft' | 'published' | 'full' | 'cancelled' | 'completed';

export type ActivityVisibility = 'public' | 'community' | 'unlisted';

/** `imported` marks a real public session seeded before you own the supply. */
export type ActivitySource = 'native' | 'imported';

export type ParticipationStatus =
  'interested' | 'joined' | 'waitlisted' | 'cancelled' | 'attended' | 'no_show';

export type CommunityRole = 'member' | 'organizer' | 'owner';

export type RecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly';

export type ReportSubject = 'user' | 'activity' | 'message' | 'community';

export type ReportStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed';

/** MVP categories. Adding one is a row in `categories`, not a type change. */
export type CategoryId = 'running' | 'hiking' | 'football' | (string & {});

/**
 * ISO 4217 alphabetic code, matching the `currency_code` domain in
 * 0005_currency.sql. Prices are stored in MINOR units of this currency —
 * céntimos for CRC, cents for USD — never in whole units.
 */
export type CurrencyCode = 'CRC' | 'USD' | (string & {});

// ---------------------------------------------------------------- rows

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  /** District-level only. There is deliberately no precise home location. */
  home_district: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfilePrivate {
  id: string;
  phone: string | null;
  emergency_contact: string | null;
  birthdate: string | null;
  locale: string;
}

export interface Category {
  id: CategoryId;
  name_es: string;
  name_en: string;
  icon: string | null;
  /** JSON Schema subset describing `Activity.attributes` for this category. */
  attribute_schema: JsonSchemaObject;
  is_active: boolean;
  sort_order: number;
}

export interface Location {
  id: string;
  name: string;
  address: string | null;
  district: string | null;
  currency: CurrencyCode;
  is_public_venue: boolean;
  is_verified: boolean;
  created_by: string | null;
  created_at: string;
}

export interface ActivitySeries {
  id: string;
  organizer_id: string;
  community_id: string | null;
  category_id: CategoryId;
  location_id: string;
  title: string;
  description: string | null;
  frequency: RecurrenceFrequency;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  local_start_time: string;
  duration_minutes: number;
  timezone: string;
  skill: SkillLevel;
  difficulty: number | null;
  max_participants: number | null;
  price_minor: number;
  currency: CurrencyCode;
  attributes: ActivityAttributes;
  is_active: boolean;
}

export interface Activity {
  id: string;
  series_id: string | null;
  organizer_id: string;
  community_id: string | null;
  category_id: CategoryId;
  location_id: string;
  title: string;
  description: string | null;
  /** ISO instant. Render in America/Costa_Rica; never parse as local naive. */
  starts_at: string;
  ends_at: string;
  meeting_point: string | null;
  max_participants: number | null;
  joined_count: number;
  waitlist_count: number;
  skill: SkillLevel;
  difficulty: number | null;
  price_minor: number;
  currency: CurrencyCode;
  equipment: string[];
  rules: string | null;
  attributes: ActivityAttributes;
  visibility: ActivityVisibility;
  status: ActivityStatus;
  /** Set by cancel_activity(). The reason is shown to everyone on the roster. */
  cancelled_at: string | null;
  cancel_reason: string | null;
  /**
   * True when the Movo team cancelled it from a report (0019). Says who, never
   * why: cancel_reason stays null, and the team's note lives in reports.
   */
  cancelled_by_staff: boolean;
  source: ActivitySource;
  source_url: string | null;
  claimed_by: string | null;
  cover_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityParticipant {
  activity_id: string;
  user_id: string;
  status: ParticipationStatus;
  waitlist_pos: number | null;
  joined_at: string;
  cancelled_at: string | null;
  checked_in_at: string | null;
  checked_in_by: string | null;
}

export interface Message {
  id: string;
  activity_id: string | null;
  community_id: string | null;
  author_id: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
}

/**
 * Types written in the wild: `waitlist_promoted` and `activity_cancelled`
 * since 0008, `report_resolved` since 0012, `activity_cancelled_by_movo`
 * (to the organizer) since 0019. Left open on purpose — the column
 * is plain `text`, a newer server can write a type this build has never heard
 * of, and the inbox has to render that row rather than fall over on it.
 */
export type NotificationType =
  | 'waitlist_promoted'
  | 'activity_cancelled'
  | 'activity_cancelled_by_movo'
  | 'report_resolved'
  | (string & {});

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  /** jsonb. Its shape follows `type`; read it through lib/notifications.ts. */
  payload: Record<string, unknown>;
  /**
   * Null until the owner opens it. The only column a client may write: 0011
   * narrowed the UPDATE grant to this one, so a write touching anything else
   * fails with 42501.
   */
  read_at: string | null;
  created_at: string;
}

export interface Community {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category_id: CategoryId | null;
  cover_url: string | null;
  rules: string | null;
  is_public: boolean;
  created_by: string | null;
}

export interface Report {
  id: string;
  reporter_id: string;
  subject_type: ReportSubject;
  /**
   * The reported row. One column points at four different tables depending on
   * `subject_type`, so it carries no foreign key — nothing can embed it, and
   * whoever reads the queue joins it themselves.
   */
  subject_id: string;
  /** Free text in the column; one of `REPORT_REASONS` in practice. */
  reason: string;
  details: string | null;
  status: ReportStatus;
  /**
   * Stamped by resolve_report() from auth.uid(), never sent by a client: the
   * record of who looked at a safety report cannot be allowed to name somebody
   * who did not.
   */
  reviewed_by: string | null;
  reviewed_at: string | null;
  action_taken: string | null;
  created_at: string;
}

/**
 * Added in 0012. Who may read and resolve reports.
 *
 * Nothing in the app can read this row: the table has no grants for anon or
 * authenticated at all, and membership is assigned from the Supabase panel.
 * The shape is written down here so the schema is described in one place, not
 * because a screen is ever going to select it.
 */
export interface Staff {
  user_id: string;
  granted_at: string;
  granted_by: string | null;
  note: string | null;
}

// ------------------------------------------------- category attributes

export interface RunningAttributes {
  distance_km: number;
  pace_min_per_km: number;
  route_type?: 'calle' | 'trail' | 'pista';
  has_pacers?: boolean;
  route_url?: string;
  no_drop?: boolean;
}

export interface HikingAttributes {
  distance_km: number;
  elevation_gain_m: number;
  trail_name?: string;
  estimated_hours?: number;
  transport_provided?: boolean;
  entrance_fee_crc?: number;
  water_liters?: number;
}

export interface FootballAttributes {
  format: '5v5' | '7v7' | '9v9' | '11v11';
  surface: 'sintetica' | 'natural' | 'cemento';
  cancha_cost_crc?: number;
  split_cost?: boolean;
  positions_needed?: Array<'portero' | 'defensa' | 'medio' | 'delantero'>;
  bring_two_shirts?: boolean;
  referee?: boolean;
}

export type ActivityAttributes =
  RunningAttributes | HikingAttributes | FootballAttributes | Record<string, unknown>;

/** Narrow `attributes` once the category is known. */
export type AttributesFor<C extends CategoryId> = C extends 'running'
  ? RunningAttributes
  : C extends 'hiking'
    ? HikingAttributes
    : C extends 'football'
      ? FootballAttributes
      : Record<string, unknown>;

// ------------------------------------------------------ rpc signatures

/** Row shape returned by the `nearby_activities` RPC. */
export interface NearbyActivity {
  id: string;
  title: string;
  category_id: CategoryId;
  starts_at: string;
  ends_at: string;
  location_name: string;
  district: string | null;
  lat: number;
  lng: number;
  distance_m: number;
  joined_count: number;
  max_participants: number | null;
  skill: SkillLevel;
  difficulty: number | null;
  price_minor: number;
  currency: CurrencyCode;
  cover_url: string | null;
  organizer_id: string;
  status: ActivityStatus;
  /**
   * Added in 0009. Occurrences of one series arrive as a single row — the next
   * date that matches — so this is null for a one-off session. Optional so a
   * client talking to a database without 0009 still renders.
   */
  series_id?: string | null;
  /** Matching dates left in the series, including this one. */
  series_upcoming?: number;
}

export interface NearbyActivitiesArgs {
  p_lat: number;
  p_lng: number;
  p_radius_m?: number;
  p_categories?: CategoryId[] | null;
  p_from?: string;
  p_to?: string | null;
  p_limit?: number;
  p_offset?: number;
}

// ----------------------------------------------------- json schema bits

export interface JsonSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array';
  title?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  default?: unknown;
  items?: JsonSchemaProperty;
}

export interface JsonSchemaObject {
  type: 'object';
  additionalProperties?: boolean;
  required?: string[];
  properties: Record<string, JsonSchemaProperty>;
}
