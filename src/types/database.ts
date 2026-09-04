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
  price_crc: number;
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
  price_crc: number;
  equipment: string[];
  rules: string | null;
  attributes: ActivityAttributes;
  visibility: ActivityVisibility;
  status: ActivityStatus;
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
  price_crc: number;
  cover_url: string | null;
  organizer_id: string;
  status: ActivityStatus;
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
