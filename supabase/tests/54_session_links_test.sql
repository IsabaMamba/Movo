-- =====================================================================
-- 54_session_links_test.sql — movo.app/s/<code> (0055).
--
--   1. session_link() makes one code per person and session, for somebody
--      who can see it; not for a draft, and not for anon.
--   2. session_link_preview() is open to anon and says the state: open,
--      full, cancelled, past with the next date, group, missing.
--   3. It never lists who is going; a block reads as missing.
--   4. Thirty misses from one IP in ten minutes, and that IP sees nothing.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a5400000-0000-0000-0000-000000000001', 'pablo@link.test', '{"display_name":"Pablo Vargas"}'),
  ('a5400000-0000-0000-0000-000000000002', 'andrea@link.test', '{"display_name":"Andrea Molina"}'),
  ('a5400000-0000-0000-0000-000000000003', 'beto@link.test',   '{"display_name":"Beto"}');

insert into public.locations (id, name, district, geog, is_public_venue, is_verified, created_by)
values ('a5400000-0000-0000-0000-0000000000a1', 'Parque del Este', 'San Rafael',
        extensions.st_setsrid(extensions.st_makepoint(-84.02, 9.94), 4326)::extensions.geography,
        true, true, 'a5400000-0000-0000-0000-000000000001');

insert into public.communities (id, name, slug, category_id, created_by, is_public)
values ('a5400000-0000-0000-0000-0000000000d1', 'Club del Este', 'club-del-este-link', 'running',
        'a5400000-0000-0000-0000-000000000001', false);

insert into public.activity_series (
  id, organizer_id, category_id, location_id, title,
  frequency, weekday, local_start_time, duration_minutes,
  skill, max_participants, price_minor, currency, attributes
) values
  ('a5400000-0000-0000-0000-0000000000b1', 'a5400000-0000-0000-0000-000000000001', 'running',
   'a5400000-0000-0000-0000-0000000000a1', 'Vuelta al Parque', 'weekly', 6, '07:00', 60,
   'any', 10, 0, 'CRC', '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb);

-- c1 open, c2 full (cap 2), c3 cancelled, c4 past in the series, c5 next in
-- the series, c6 a group's, c7 a draft.
insert into public.activities (
  id, series_id, community_id, organizer_id, category_id, location_id, title,
  starts_at, ends_at, max_participants, status, visibility, attributes
)
select v.id::uuid, v.series::uuid, v.community::uuid, 'a5400000-0000-0000-0000-000000000001',
       'running', 'a5400000-0000-0000-0000-0000000000a1', 'Vuelta al Parque',
       now() + v.offs, now() + v.offs + interval '1 hour', v.cap,
       v.status::public.activity_status, v.vis::public.activity_visibility,
       '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb
  from (values
    ('a5400000-0000-0000-0000-0000000000c1', null, null, interval '2 days', 10, 'published', 'public'),
    ('a5400000-0000-0000-0000-0000000000c2', null, null, interval '3 days', 2,  'published', 'public'),
    ('a5400000-0000-0000-0000-0000000000c3', null, null, interval '4 days', 10, 'cancelled', 'public'),
    ('a5400000-0000-0000-0000-0000000000c4', 'a5400000-0000-0000-0000-0000000000b1', null, interval '-3 days', 10, 'completed', 'public'),
    ('a5400000-0000-0000-0000-0000000000c5', 'a5400000-0000-0000-0000-0000000000b1', null, interval '4 days', 10, 'published', 'public'),
    ('a5400000-0000-0000-0000-0000000000c6', null, 'a5400000-0000-0000-0000-0000000000d1', interval '5 days', 10, 'published', 'community'),
    ('a5400000-0000-0000-0000-0000000000c7', null, null, interval '6 days', 10, 'draft', 'public')
  ) as v(id, series, community, offs, cap, status, vis);

-- c2 is full.
insert into public.activity_participants (activity_id, user_id, status) values
  ('a5400000-0000-0000-0000-0000000000c2', 'a5400000-0000-0000-0000-000000000002', 'joined'),
  ('a5400000-0000-0000-0000-0000000000c2', 'a5400000-0000-0000-0000-000000000003', 'joined');

-- Codes are written directly for the states; session_link() is tested below.
insert into public.session_links (code, activity_id, created_by) values
  ('AAAAA2', 'a5400000-0000-0000-0000-0000000000c1', 'a5400000-0000-0000-0000-000000000002'),
  ('AAAAA3', 'a5400000-0000-0000-0000-0000000000c2', 'a5400000-0000-0000-0000-000000000002'),
  ('AAAAA4', 'a5400000-0000-0000-0000-0000000000c3', 'a5400000-0000-0000-0000-000000000002'),
  ('AAAAA5', 'a5400000-0000-0000-0000-0000000000c4', 'a5400000-0000-0000-0000-000000000002'),
  ('AAAAA6', 'a5400000-0000-0000-0000-0000000000c6', 'a5400000-0000-0000-0000-000000000001'),
  ('AAAAA7', 'a5400000-0000-0000-0000-0000000000c7', 'a5400000-0000-0000-0000-000000000001');

-- ------------------------------------------------- 1. making a code

do $$ begin
  if has_function_privilege('anon', 'public.session_link(uuid)', 'execute') then
    raise exception 'FAIL: anon can make a link';
  end if;
  if not has_function_privilege('anon', 'public.session_link_preview(text)', 'execute') then
    raise exception 'FAIL: anon cannot read a link';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'a5400000-0000-0000-0000-000000000003', true);
set local role authenticated;
do $$
declare v_a text; v_b text;
begin
  v_a := public.session_link('a5400000-0000-0000-0000-0000000000c1');
  v_b := public.session_link('a5400000-0000-0000-0000-0000000000c1');
  if v_a !~ '^[A-HJ-NP-Z2-9]{6}$' or v_a <> v_b then
    raise exception 'FAIL: one six-character code per person and session, got % and %', v_a, v_b;
  end if;
  begin
    perform public.session_link('a5400000-0000-0000-0000-0000000000c7');
    raise exception 'FAIL: a draft got a link';
  exception when no_data_found then null;
  end;
end $$;
reset role;

-- ------------------------------------------------- 2–3. the states, as anon

select set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$
declare v jsonb;
begin
  v := public.session_link_preview('aaaaa2');
  if v ->> 'state' <> 'open' or v ->> 'invited_by' <> 'Andrea' or v ->> 'venue' <> 'Parque del Este' then
    raise exception 'FAIL: open session, got %', v;
  end if;
  if v::text ~* 'beto|andrea molina' then
    raise exception 'FAIL: the preview names somebody: %', v;
  end if;

  v := public.session_link_preview('AAAAA3');
  if v ->> 'state' <> 'full' or (v ->> 'joined_count')::int <> 2 then
    raise exception 'FAIL: full session, got %', v;
  end if;
  if v::text ~* 'beto' then
    raise exception 'FAIL: the preview names who is going: %', v;
  end if;

  if public.session_link_preview('AAAAA4') ->> 'state' <> 'cancelled' then
    raise exception 'FAIL: cancelled session';
  end if;

  v := public.session_link_preview('AAAAA5');
  if v ->> 'state' <> 'past' or v -> 'next' ->> 'activity_id' <> 'a5400000-0000-0000-0000-0000000000c5' then
    raise exception 'FAIL: past date should point at the next one, got %', v;
  end if;

  v := public.session_link_preview('AAAAA6');
  if v ->> 'state' <> 'group' or v ? 'title' or v ? 'venue' then
    raise exception 'FAIL: a group session should say only that, got %', v;
  end if;

  if public.session_link_preview('AAAAA7') ->> 'state' <> 'missing'
     or public.session_link_preview('ZZZZZZ') ->> 'state' <> 'missing' then
    raise exception 'FAIL: a draft and an unknown code should both be missing';
  end if;
end $$;
reset role;

-- A block reads as missing.
insert into public.blocks (blocker_id, blocked_id)
values ('a5400000-0000-0000-0000-000000000001', 'a5400000-0000-0000-0000-000000000003');
select set_config('request.jwt.claim.sub', 'a5400000-0000-0000-0000-000000000003', true);
set local role authenticated;
do $$ begin
  if public.session_link_preview('AAAAA2') ->> 'state' <> 'missing' then
    raise exception 'FAIL: a blocked person should see the link as missing';
  end if;
end $$;
reset role;

-- ------------------------------------------------- 4. walking the space

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.9, 10.0.0.1"}', true);
set local role anon;
do $$ begin
  for i in 1..30 loop
    perform public.session_link_preview('ZZZZZ' || chr(50 + (i % 8)));
  end loop;
  if public.session_link_preview('AAAAA2') ->> 'state' <> 'missing' then
    raise exception 'FAIL: thirty misses should stop that IP';
  end if;
end $$;
reset role;

rollback;
