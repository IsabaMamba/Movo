-- =====================================================================
-- 0005_currency.sql — take the currency out of the column name
--
-- `price_crc` was correct for exactly one market. The moment there is a session
-- in Panamá or Guatemala the column is either wrong or lying, and by then it
-- holds data. This runs while it holds none.
--
-- Two changes:
--   * price_crc (whole colones) -> price_minor (minor units) + currency
--   * currency lives on locations too, so a venue implies its own currency and
--     the create form does not have to ask
-- =====================================================================

-- ISO 4217 alphabetic code. Constrained rather than free text: a typo here
-- silently breaks every price on the screen.
create domain public.currency_code as char(3)
  check (value ~ '^[A-Z]{3}$');

-- ------------------------------------------------------------ locations

alter table public.locations
  add column currency public.currency_code not null default 'CRC';

comment on column public.locations.currency is
  'Currency quoted at this venue. Activities inherit it, so the create form '
  'never asks — the venue already answers.';

-- ----------------------------------------------------------- activities

alter table public.activities
  add column currency public.currency_code not null default 'CRC';

-- Existing values are whole colones; minor units are 100x. There is no
-- production data yet, so this is a formality that keeps the migration
-- correct if it is ever replayed against a seeded database.
alter table public.activities
  alter column price_crc drop default;

update public.activities set price_crc = price_crc * 100;

alter table public.activities
  rename column price_crc to price_minor;

alter table public.activities
  alter column price_minor set default 0;

alter table public.activities
  rename constraint activities_price_crc_check to activities_price_minor_check;

comment on column public.activities.price_minor is
  'Price in MINOR units of `currency` (céntimos for CRC, cents for USD). '
  'Zero means free and must render as "Gratis", never as a zero amount.';

-- ------------------------------------------------------- activity_series

alter table public.activity_series
  add column currency public.currency_code not null default 'CRC';

alter table public.activity_series
  alter column price_crc drop default;

update public.activity_series set price_crc = price_crc * 100;

alter table public.activity_series
  rename column price_crc to price_minor;

alter table public.activity_series
  alter column price_minor set default 0;

alter table public.activity_series
  rename constraint activity_series_price_crc_check to activity_series_price_minor_check;

-- --------------------------------------------- keep the generator in step
--
-- generate_series_occurrences() inserts price_crc by name. Renaming the column
-- does not rewrite the function body, so it must be replaced here or every
-- occurrence generated after this migration fails.

create or replace function public.generate_series_occurrences(
  p_series_id uuid,
  p_until     date default (current_date + 60)
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s       public.activity_series%rowtype;
  v_date    date;
  v_step    integer;
  v_start   timestamptz;
  v_created integer := 0;
begin
  select * into v_s from public.activity_series where id = p_series_id;
  if not found then
    raise exception 'series not found' using errcode = 'P0002';
  end if;

  if v_s.organizer_id <> auth.uid() then
    raise exception 'only the organizer can generate occurrences' using errcode = '42501';
  end if;

  v_step := case v_s.frequency
              when 'weekly'   then 7
              when 'biweekly' then 14
              when 'monthly'  then 28
            end;

  v_date := current_date;
  v_date := v_date + ((7 + v_s.weekday - extract(dow from v_date)::integer) % 7);

  while v_date <= p_until loop
    v_start := (v_date + v_s.local_start_time) at time zone v_s.timezone;

    insert into public.activities (
      series_id, organizer_id, community_id, category_id, location_id,
      title, description, starts_at, ends_at, max_participants,
      skill, difficulty, price_minor, currency, attributes, visibility, status, source
    ) values (
      v_s.id, v_s.organizer_id, v_s.community_id, v_s.category_id, v_s.location_id,
      v_s.title, v_s.description, v_start,
      v_start + make_interval(mins => v_s.duration_minutes),
      v_s.max_participants, v_s.skill, v_s.difficulty, v_s.price_minor, v_s.currency,
      v_s.attributes, 'public', 'published', 'native'
    )
    on conflict (series_id, starts_at) where series_id is not null do nothing;

    if found then
      v_created := v_created + 1;
    end if;

    v_date := v_date + v_step;
  end loop;

  return v_created;
end;
$$;

-- ------------------------------------------------------ discovery query
--
-- nearby_activities() returns price_crc in its result columns. Same problem.

drop function if exists public.nearby_activities(
  double precision, double precision, integer, text[], timestamptz, timestamptz, integer, integer
);

create or replace function public.nearby_activities(
  p_lat        double precision,
  p_lng        double precision,
  p_radius_m   integer     default 15000,
  p_categories text[]      default null,
  p_from       timestamptz default now(),
  p_to         timestamptz default null,
  p_limit      integer     default 50,
  p_offset     integer     default 0
)
returns table (
  id               uuid,
  title            text,
  category_id      text,
  starts_at        timestamptz,
  ends_at          timestamptz,
  location_name    text,
  district         text,
  lat              double precision,
  lng              double precision,
  distance_m       double precision,
  joined_count     integer,
  max_participants integer,
  skill            skill_level,
  difficulty       smallint,
  price_minor      integer,
  currency         public.currency_code,
  cover_url        text,
  organizer_id     uuid,
  status           activity_status
)
language sql
stable
as $$
  with origin as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as g
  )
  select a.id, a.title, a.category_id, a.starts_at, a.ends_at,
         l.name, l.district,
         extensions.st_y(l.geog::extensions.geometry),
         extensions.st_x(l.geog::extensions.geometry),
         extensions.st_distance(l.geog, o.g),
         a.joined_count, a.max_participants, a.skill, a.difficulty,
         a.price_minor, a.currency, a.cover_url, a.organizer_id, a.status
    from public.activities a
    join public.locations  l on l.id = a.location_id
   cross join origin o
   where a.status in ('published', 'full')
     and a.starts_at >= p_from
     and (p_to is null or a.starts_at <= p_to)
     and (p_categories is null or a.category_id = any (p_categories))
     and extensions.st_dwithin(l.geog, o.g, p_radius_m)
     and not public.is_blocked(auth.uid(), a.organizer_id)
   order by a.starts_at, extensions.st_distance(l.geog, o.g)
   limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

grant execute on function public.nearby_activities(
  double precision, double precision, integer, text[], timestamptz, timestamptz, integer, integer
) to authenticated, anon;
