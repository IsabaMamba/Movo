-- =====================================================================
-- 35_sports_catalog_test.sql — nineteen sports in six families, and the
-- fixed rules of a sport cannot be left out.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. A water session is stored without its life-jacket, swimming or CNE
--      rule, because the client did not send them or sent false.
--   2. Editing the attributes later drops a fixed rule.
--   3. A sport is missing, or has no family.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

-- ------------------------------------------------------------ catalog

do $$ begin
  if (select count(*) from public.categories) <> 19 then
    raise exception 'FAIL: expected 19 sports, found %', (select count(*) from public.categories);
  end if;
  if exists (select 1 from public.categories where family is null) then
    raise exception 'FAIL: a sport has no family';
  end if;
  if (select count(distinct family) from public.categories) <> 6 then
    raise exception 'FAIL: expected six families';
  end if;
  if (select array_agg(id order by id) from public.categories where family = 'agua')
       <> array['kayak', 'rafting', 'surf'] then
    raise exception 'FAIL: the water family is not surf, kayak and rafting';
  end if;
end $$;

-- ------------------------------------------------------- fixed rules

insert into auth.users (id, email, raw_user_meta_data) values
  ('a3500000-0000-0000-0000-000000000001', 'remo35@test.cr', '{"display_name":"Remo"}');

insert into public.locations (id, name, geog, is_public_venue, is_verified, created_by) values
  ('b3500000-0000-0000-0000-000000000001', 'Lago 35',
   extensions.st_setsrid(extensions.st_makepoint(-83.8, 9.8), 4326)::extensions.geography,
   true, true, 'a3500000-0000-0000-0000-000000000001');

insert into public.activities
  (id, organizer_id, category_id, location_id, title, starts_at, ends_at, status, visibility, attributes)
values
  ('c3500000-0000-0000-0000-000000000001', 'a3500000-0000-0000-0000-000000000001', 'kayak',
   'b3500000-0000-0000-0000-000000000001', 'Kayak 35',
   now() + interval '2 days', now() + interval '2 days 3 hours', 'published', 'public',
   '{"water": "lago", "equipment": "incluido", "life_jackets": false}');

do $$
declare
  a jsonb := (select attributes from public.activities where id = 'c3500000-0000-0000-0000-000000000001');
begin
  if a -> 'life_jackets' <> 'true'::jsonb
     or a -> 'swimmers_only' <> 'true'::jsonb
     or a -> 'cne_alert_cancels' <> 'true'::jsonb then
    raise exception 'FAIL: a kayak session was stored without its three rules: %', a;
  end if;
  if a ->> 'water' <> 'lago' then
    raise exception 'FAIL: the organizer''s own answers were overwritten';
  end if;
end $$;

update public.activities
   set attributes = '{"water": "rio", "equipment": "incluido"}'
 where id = 'c3500000-0000-0000-0000-000000000001';

do $$ begin
  if (select attributes -> 'life_jackets' from public.activities
       where id = 'c3500000-0000-0000-0000-000000000001') is distinct from 'true'::jsonb then
    raise exception 'FAIL: editing the attributes dropped a fixed rule';
  end if;
end $$;

-- A sport without fixed rules is left exactly as sent.
update public.activities
   set category_id = 'running', attributes = '{"distance_km": 5, "pace_min_per_km": 6}'
 where id = 'c3500000-0000-0000-0000-000000000001';

do $$ begin
  if (select attributes from public.activities where id = 'c3500000-0000-0000-0000-000000000001')
       <> '{"distance_km": 5, "pace_min_per_km": 6}'::jsonb then
    raise exception 'FAIL: running gained attributes it does not have';
  end if;
end $$;

-- ------------------------------------------------------------- grants

do $$ begin
  if has_function_privilege('authenticated', 'public.apply_fixed_attributes()', 'execute')
     or has_function_privilege('anon', 'public.apply_fixed_attributes()', 'execute') then
    raise exception 'FAIL: a client can call the trigger function';
  end if;
end $$;

rollback;
