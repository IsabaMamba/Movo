-- =====================================================================
-- 0001_schema.sql — core schema
--
-- Deviations from the original spec, each deliberate (see README):
--   * locations owns geography; activities reference it (spec duplicated lat/lng)
--   * activity_series added — recurring sessions are the retention object
--   * participation gains 'waitlisted'; counters are trigger-maintained
--   * category-specific fields live in activities.attributes (jsonb),
--     validated against a schema stored in categories.attribute_schema
--   * activities.source lets you list real club sessions you don't own yet
--   * profiles split into public/private so RLS can expose one and not the other
-- =====================================================================

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------- enums

create type skill_level as enum ('any', 'beginner', 'intermediate', 'advanced');

create type activity_status as enum ('draft', 'published', 'full', 'cancelled', 'completed');

create type activity_visibility as enum ('public', 'community', 'unlisted');

-- 'imported' = a real public session you seeded but do not control.
-- Without this the map is empty on day one, which is the app's death screen.
create type activity_source as enum ('native', 'imported');

create type participation_status as enum (
  'interested', 'joined', 'waitlisted', 'cancelled', 'attended', 'no_show'
);

create type community_role as enum ('member', 'organizer', 'owner');

create type recurrence_frequency as enum ('weekly', 'biweekly', 'monthly');

create type report_subject as enum ('user', 'activity', 'message', 'community');

create type report_status as enum ('open', 'reviewing', 'actioned', 'dismissed');

-- ------------------------------------------------------------- profiles

-- Public. Anything here is readable by any authenticated user, because the
-- app must show organizer and participant identity. Keep it minimal.
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text        not null check (length(trim(display_name)) between 2 and 60),
  avatar_url    text,
  bio           text        check (length(bio) <= 400),
  -- District-level only, never a precise home location.
  home_district text,
  is_verified   boolean     not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Private. Never exposed to any client but the owner.
create table public.profile_private (
  id                uuid primary key references auth.users (id) on delete cascade,
  phone             text,
  emergency_contact text,
  birthdate         date,
  locale            text        not null default 'es-CR',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ----------------------------------------------------------- categories

-- A table, not an enum: adding padel or cycling later is an INSERT.
create table public.categories (
  id               text primary key check (id ~ '^[a-z][a-z0-9_]{1,30}$'),
  name_es          text    not null,
  name_en          text    not null,
  icon             text,
  -- JSON Schema fragment describing category-specific fields. Validated in
  -- the API layer on write; stored here so mobile can render the form.
  attribute_schema jsonb   not null default '{"type":"object","properties":{}}'::jsonb,
  is_active        boolean not null default true,
  sort_order       smallint not null default 100
);

create table public.user_interests (
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  category_id text        not null references public.categories (id) on delete cascade,
  skill       skill_level not null default 'beginner',
  primary key (user_id, category_id)
);

-- ------------------------------------------------------------ locations

create table public.locations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) between 2 and 120),
  address         text,
  district        text,
  -- geography(Point, 4326): metre-accurate distance without projection math.
  geog            extensions.geography(Point, 4326) not null,
  -- Public venues only. Enforced socially at creation, structurally here.
  is_public_venue boolean not null default true,
  is_verified     boolean not null default false,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index locations_geog_idx on public.locations using gist (geog);
create index locations_district_idx on public.locations (district);

-- ---------------------------------------------------------- communities

create table public.communities (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name        text not null check (length(trim(name)) between 2 and 80),
  description text,
  category_id text references public.categories (id) on delete set null,
  cover_url   text,
  rules       text,
  is_public   boolean not null default true,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.community_members (
  community_id uuid           not null references public.communities (id) on delete cascade,
  user_id      uuid           not null references public.profiles (id) on delete cascade,
  role         community_role not null default 'member',
  joined_at    timestamptz    not null default now(),
  primary key (community_id, user_id)
);

create index community_members_user_idx on public.community_members (user_id);

-- ------------------------------------------------------- activity series

-- The object a run club actually is: "every Tuesday 6pm at Parque La Sabana".
-- Individual activities are generated occurrences of it.
create table public.activity_series (
  id                     uuid primary key default gen_random_uuid(),
  organizer_id           uuid not null references public.profiles (id) on delete cascade,
  community_id           uuid references public.communities (id) on delete set null,
  category_id            text not null references public.categories (id),
  location_id            uuid not null references public.locations (id),
  title                  text not null check (length(trim(title)) between 3 and 120),
  description            text,
  frequency              recurrence_frequency not null default 'weekly',
  -- 0 = Sunday … 6 = Saturday, matching Postgres extract(dow).
  weekday                smallint not null check (weekday between 0 and 6),
  local_start_time       time not null,
  duration_minutes       integer not null check (duration_minutes between 15 and 1440),
  timezone               text not null default 'America/Costa_Rica',
  skill                  skill_level not null default 'any',
  difficulty             smallint check (difficulty between 1 and 5),
  max_participants       integer check (max_participants between 2 and 1000),
  price_crc              integer not null default 0 check (price_crc >= 0),
  attributes             jsonb not null default '{}'::jsonb,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index activity_series_organizer_idx on public.activity_series (organizer_id) where is_active;

-- ----------------------------------------------------------- activities

create table public.activities (
  id                uuid primary key default gen_random_uuid(),
  series_id         uuid references public.activity_series (id) on delete set null,
  organizer_id      uuid not null references public.profiles (id) on delete cascade,
  community_id      uuid references public.communities (id) on delete set null,
  category_id       text not null references public.categories (id),
  location_id       uuid not null references public.locations (id),

  title             text not null check (length(trim(title)) between 3 and 120),
  description       text check (length(description) <= 4000),
  -- Absolute instants. Render in America/Costa_Rica on the client; never
  -- store a naive local date+time, which breaks the moment you add Panama.
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  -- Free text refinement of the venue: "portón norte, junto a la fuente".
  meeting_point     text check (length(meeting_point) <= 200),

  max_participants  integer check (max_participants between 2 and 1000),
  joined_count      integer not null default 0 check (joined_count >= 0),
  waitlist_count    integer not null default 0 check (waitlist_count >= 0),

  skill             skill_level not null default 'any',
  difficulty        smallint check (difficulty between 1 and 5),
  price_crc         integer not null default 0 check (price_crc >= 0),
  equipment         text[] not null default '{}',
  rules             text check (length(rules) <= 2000),

  -- Category-specific fields, shaped by categories.attribute_schema.
  attributes        jsonb not null default '{}'::jsonb,

  visibility        activity_visibility not null default 'public',
  status            activity_status     not null default 'draft',
  source            activity_source     not null default 'native',
  -- For imported sessions: where you found it, and who claimed it later.
  source_url        text,
  claimed_by        uuid references public.profiles (id) on delete set null,

  cover_url         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint activities_time_order check (ends_at > starts_at),
  constraint activities_capacity   check (max_participants is null or joined_count <= max_participants)
);

-- Discovery hits these three together: upcoming + published + by category.
create index activities_discovery_idx
  on public.activities (starts_at)
  where status in ('published', 'full') and visibility = 'public';

create index activities_category_time_idx on public.activities (category_id, starts_at);
create index activities_organizer_idx     on public.activities (organizer_id);
create index activities_series_idx        on public.activities (series_id);
create index activities_community_idx     on public.activities (community_id);
create index activities_attributes_idx    on public.activities using gin (attributes);

-- One generated occurrence per series per start instant.
create unique index activities_series_occurrence_idx
  on public.activities (series_id, starts_at)
  where series_id is not null;

-- -------------------------------------------------------- participation

create table public.activity_participants (
  activity_id   uuid                not null references public.activities (id) on delete cascade,
  user_id       uuid                not null references public.profiles (id) on delete cascade,
  status        participation_status not null default 'joined',
  -- Position in the waitlist queue; null unless status = 'waitlisted'.
  waitlist_pos  integer,
  joined_at     timestamptz         not null default now(),
  cancelled_at  timestamptz,
  -- Check-in is what turns 'joined' into 'attended'. Without it the
  -- attendance data an organizer would pay for never comes into existence.
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles (id) on delete set null,
  primary key (activity_id, user_id)
);

create index activity_participants_user_idx   on public.activity_participants (user_id, status);
create index activity_participants_status_idx on public.activity_participants (activity_id, status);

create table public.saved_activities (
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  activity_id uuid        not null references public.activities (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, activity_id)
);

-- --------------------------------------------------------------- chat

-- Two nullable scopes with a XOR check keeps real foreign keys, which a
-- polymorphic (scope_type, scope_id) pair would throw away.
create table public.messages (
  id           uuid primary key default gen_random_uuid(),
  activity_id  uuid references public.activities (id) on delete cascade,
  community_id uuid references public.communities (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  body         text not null check (length(trim(body)) between 1 and 2000),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint messages_one_scope check (
    (activity_id is not null and community_id is null) or
    (activity_id is null and community_id is not null)
  )
);

create index messages_activity_idx  on public.messages (activity_id, created_at desc);
create index messages_community_idx on public.messages (community_id, created_at desc);

-- --------------------------------------------------------- safety layer

create table public.blocks (
  blocker_id uuid        not null references public.profiles (id) on delete cascade,
  blocked_id uuid        not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

-- Reports need a resolution workflow, not just a submission endpoint —
-- an unread report queue is the same as having no reporting at all.
create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid           not null references public.profiles (id) on delete set null,
  subject_type report_subject not null,
  subject_id   uuid           not null,
  reason       text           not null,
  details      text           check (length(details) <= 2000),
  status       report_status  not null default 'open',
  reviewed_by  uuid references public.profiles (id) on delete set null,
  reviewed_at  timestamptz,
  action_taken text,
  created_at   timestamptz    not null default now()
);

create index reports_triage_idx on public.reports (status, created_at);

-- ------------------------------------------------------- notifications

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  type       text        not null,
  payload    jsonb       not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_inbox_idx on public.notifications (user_id, created_at desc)
  where read_at is null;

create table public.device_tokens (
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  token      text        not null,
  platform   text        not null check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);
