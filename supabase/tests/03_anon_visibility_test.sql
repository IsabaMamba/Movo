-- =====================================================================
-- 03_anon_visibility_test.sql — what a logged-out visitor can see.
--
-- The existing suite exercises RLS as `authenticated` and never as `anon`,
-- which left the one path the product depends on untested: Descubrir is
-- deliberately open, and the cold-start argument in docs/architecture.md is
-- that a stranger sees real sessions before signing up. If anon can read
-- nothing, that argument is false and nobody notices until launch.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

-- ---------------------------------------------------------------- setup

insert into auth.users (id, email, raw_user_meta_data) values
  ('55555555-5555-5555-5555-555555555555', 'vis@test.cr', '{"display_name":"Visible"}');

insert into public.locations (id, name, district, geog, is_public_venue, is_verified, created_by)
values (
  'aaaaaaaa-0000-0000-0000-000000000009',
  'Parque de prueba', 'Mata Redonda',
  extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
  true, true, '55555555-5555-5555-5555-555555555555'
);

-- Written exactly the way createActivity() writes it: published, public, no
-- capacity limit, price zero. If the app and this row disagree, the app is
-- what needs fixing.
insert into public.activities (
  id, organizer_id, category_id, location_id, title,
  starts_at, ends_at, max_participants, status, visibility, attributes
) values (
  'bbbbbbbb-0000-0000-0000-000000000009',
  '55555555-5555-5555-5555-555555555555', 'running',
  'aaaaaaaa-0000-0000-0000-000000000009', 'Corrida pública',
  now() + interval '2 days', now() + interval '2 days 1 hour',
  null, 'published', 'public',
  '{"distance_km": 6, "pace_min_per_km": 6.5}'::jsonb
);

-- The control: same everything, not listed.
insert into public.activities (
  id, organizer_id, category_id, location_id, title,
  starts_at, ends_at, status, visibility, attributes
) values (
  'bbbbbbbb-0000-0000-0000-00000000000a',
  '55555555-5555-5555-5555-555555555555', 'running',
  'aaaaaaaa-0000-0000-0000-000000000009', 'Corrida con enlace',
  now() + interval '2 days', now() + interval '2 days 1 hour',
  'published', 'unlisted',
  '{"distance_km": 6, "pace_min_per_km": 6.5}'::jsonb
);

-- ------------------------------------------------------- as a stranger

-- No JWT at all: auth.uid() must be null, the way it is for a logged-out
-- request carrying only the anon key.
select set_config('request.jwt.claim.sub', '', true);
set local role anon;

do $$ begin
  if auth.uid() is not null then
    raise exception 'FAIL: auth.uid() should be null for anon, got %', auth.uid();
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from public.activities where id = 'bbbbbbbb-0000-0000-0000-000000000009'
  ) then
    raise exception
      'FAIL: anon cannot read a public, published activity — Descubrir is empty for strangers';
  end if;
end $$;

do $$ begin
  if exists (
    select 1 from public.activities where id = 'bbbbbbbb-0000-0000-0000-00000000000a'
  ) then
    raise exception 'FAIL: anon can read an unlisted activity';
  end if;
end $$;

-- The venue has to come with it, or the card cannot say where the session is.
do $$ begin
  if not exists (
    select 1 from public.locations where id = 'aaaaaaaa-0000-0000-0000-000000000009'
  ) then
    raise exception 'FAIL: anon cannot read the venue of a public activity';
  end if;
end $$;

-- ------------------------------------------- through what Descubrir calls

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from public.nearby_activities(9.9350, -84.1035, 15000);

  if v_count <> 1 then
    raise exception
      'FAIL: nearby_activities returned % rows for anon, expected exactly the public one', v_count;
  end if;
end $$;

reset role;

rollback;
