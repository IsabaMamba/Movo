-- =====================================================================
-- 50_zone_summary_test.sql — the zone sheet says counts, never a person.
--
--   1. Sessions per sport in the zone and its children, inside the window.
--   2. People only from five; below that, null («menos de 5»).
--   3. Private, cancelled, out-of-window and blocked organizers' sessions
--      are not counted.
--   4. Filtered by sport; anon cannot call it; a bad window is refused.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into public.zones (code, kind, name, parent_code, centroid, area_km2, boundary, source)
values
  ('9', 'provincia', 'Pruebalandia', null,
   extensions.st_setsrid(extensions.st_makepoint(-87.05, 10.05), 4326)::extensions.geography, 242.0,
   extensions.st_multi(extensions.st_makeenvelope(-87.10, 10.00, -87.00, 10.10, 4326))::extensions.geography, 'test'),
  ('901', 'canton', 'Cantón Norte', '9',
   extensions.st_setsrid(extensions.st_makepoint(-87.075, 10.05), 4326)::extensions.geography, 121.0,
   extensions.st_multi(extensions.st_makeenvelope(-87.10, 10.00, -87.05, 10.10, 4326))::extensions.geography, 'test'),
  ('90101', 'distrito', 'Distrito Uno', '901',
   extensions.st_setsrid(extensions.st_makepoint(-87.075, 10.05), 4326)::extensions.geography, 121.0,
   extensions.st_multi(extensions.st_makeenvelope(-87.10, 10.00, -87.05, 10.10, 4326))::extensions.geography, 'test');

insert into auth.users (id, email, raw_user_meta_data) values
  ('a5100000-0000-0000-0000-000000000001', 'org@zona.test',   '{"display_name":"Luis"}'),
  ('a5100000-0000-0000-0000-000000000002', 'ana@zona.test',   '{"display_name":"Ana"}'),
  ('a5100000-0000-0000-0000-000000000003', 'otro@zona.test',  '{"display_name":"Otro"}');

insert into public.locations (id, name, district, geog, is_public_venue, is_verified, created_by)
values ('a5100000-0000-0000-0000-0000000000a1', 'Parque', 'Distrito Uno',
        extensions.st_setsrid(extensions.st_makepoint(-87.07, 10.05), 4326)::extensions.geography,
        true, true, 'a5100000-0000-0000-0000-000000000001');

do $$ begin
  if (select district_code from public.locations
       where id = 'a5100000-0000-0000-0000-0000000000a1') <> '90101' then
    raise exception 'FAIL: setup — the venue did not resolve into the test district';
  end if;
end $$;

-- Two running and one basketball that count; then one each of what must not.
insert into public.activities (
  id, organizer_id, category_id, location_id, title,
  starts_at, ends_at, max_participants, joined_count, status, visibility, attributes
)
select v.id::uuid, v.org::uuid, v.cat, 'a5100000-0000-0000-0000-0000000000a1', 'Sesión',
       now() + v.offs, now() + v.offs + interval '1 hour', 20, v.joined,
       v.status::public.activity_status, v.vis::public.activity_visibility, v.attrs::jsonb
  from (values
    ('a5100000-0000-0000-0000-0000000000c1', 'a5100000-0000-0000-0000-000000000001', 'running', interval '1 day',  2, 'published', 'public',  '{"distance_km": 5, "pace_min_per_km": 6.0}'),
    ('a5100000-0000-0000-0000-0000000000c2', 'a5100000-0000-0000-0000-000000000001', 'running', interval '2 days', 1, 'published', 'public',  '{"distance_km": 5, "pace_min_per_km": 6.0}'),
    ('a5100000-0000-0000-0000-0000000000c3', 'a5100000-0000-0000-0000-000000000001', 'basketball', interval '3 days', 3, 'published', 'public',  '{}'),
    ('a5100000-0000-0000-0000-0000000000c4', 'a5100000-0000-0000-0000-000000000001', 'running', interval '3 days', 9, 'cancelled', 'public',  '{"distance_km": 5, "pace_min_per_km": 6.0}'),
    ('a5100000-0000-0000-0000-0000000000c5', 'a5100000-0000-0000-0000-000000000001', 'running', interval '3 days', 9, 'published', 'unlisted', '{"distance_km": 5, "pace_min_per_km": 6.0}'),
    ('a5100000-0000-0000-0000-0000000000c6', 'a5100000-0000-0000-0000-000000000001', 'running', interval '20 days',9, 'published', 'public',  '{"distance_km": 5, "pace_min_per_km": 6.0}'),
    ('a5100000-0000-0000-0000-0000000000c7', 'a5100000-0000-0000-0000-000000000003', 'running', interval '1 day',  9, 'published', 'public',  '{"distance_km": 5, "pace_min_per_km": 6.0}')
  ) as v(id, org, cat, offs, joined, status, vis, attrs);

-- Ana blocked Otro, so c7 is not hers to count.
insert into public.blocks (blocker_id, blocked_id)
values ('a5100000-0000-0000-0000-000000000002', 'a5100000-0000-0000-0000-000000000003');

do $$ begin
  if has_function_privilege('anon', 'public.zone_summary(text, text[], integer)', 'execute') then
    raise exception 'FAIL: anon can read the zone sheet';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'a5100000-0000-0000-0000-000000000002', true);
set local role authenticated;

do $$
declare v jsonb;
begin
  -- The cantón includes its district.
  v := public.zone_summary('901');
  if (v ->> 'sessions')::int <> 3 then
    raise exception 'FAIL: expected 3 sessions, got %', v;
  end if;
  if (v ->> 'people')::int <> 6 then
    raise exception 'FAIL: expected 6 people, got %', v;
  end if;
  if (v -> 'sports' -> 0 ->> 'category_id') <> 'running'
     or (v -> 'sports' -> 0 ->> 'sessions')::int <> 2 then
    raise exception 'FAIL: running should lead with 2: %', v;
  end if;
  if jsonb_array_length(v -> 'activity_ids') <> 3 then
    raise exception 'FAIL: expected 3 ids: %', v;
  end if;

  -- Running alone is 3 people: «menos de 5».
  v := public.zone_summary('90101', array['running']);
  if (v ->> 'sessions')::int <> 2 or v -> 'people' <> 'null'::jsonb then
    raise exception 'FAIL: below five must be null: %', v;
  end if;

  begin
    perform public.zone_summary('901', null, 90);
    raise exception 'FAIL: a 90-day window was accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;

reset role;
rollback;
