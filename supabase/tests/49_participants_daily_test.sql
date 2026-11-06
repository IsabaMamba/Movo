-- =====================================================================
-- 49_participants_daily_test.sql — one digest per session, only if wanted.
--
--   1. Off by default: nothing reaches an organizer who never switched it on.
--   2. On: one notice per session with movement, naming at most two.
--   3. No client can run the function.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a5000000-0000-0000-0000-000000000001', 'org@daily.test', '{"display_name":"Luis"}'),
  ('a5000000-0000-0000-0000-000000000002', 'a@daily.test',   '{"display_name":"Ana"}'),
  ('a5000000-0000-0000-0000-000000000003', 'b@daily.test',   '{"display_name":"Beto"}'),
  ('a5000000-0000-0000-0000-000000000004', 'c@daily.test',   '{"display_name":"Caro"}');

insert into public.locations (id, name, district, geog, is_public_venue, is_verified, created_by)
values ('a5000000-0000-0000-0000-0000000000a1', 'La Sabana', 'Mata Redonda',
        extensions.st_setsrid(extensions.st_makepoint(-84.10, 9.93), 4326)::extensions.geography,
        true, true, 'a5000000-0000-0000-0000-000000000001');

insert into public.activities (
  id, organizer_id, category_id, location_id, title,
  starts_at, ends_at, max_participants, status, visibility, attributes
) values
  ('a5000000-0000-0000-0000-0000000000c1', 'a5000000-0000-0000-0000-000000000001', 'running',
   'a5000000-0000-0000-0000-0000000000a1', 'Trote suave', now() + interval '3 days',
   now() + interval '3 days 1 hour', 10, 'published', 'public',
   '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb),
  ('a5000000-0000-0000-0000-0000000000c2', 'a5000000-0000-0000-0000-000000000001', 'running',
   'a5000000-0000-0000-0000-0000000000a1', 'Sin movimiento', now() + interval '4 days',
   now() + interval '4 days 1 hour', 10, 'published', 'public',
   '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb);

-- Ana, Beto and Caro join c1 today; Caro then leaves.
insert into public.activity_participants (activity_id, user_id, status, joined_at) values
  ('a5000000-0000-0000-0000-0000000000c1', 'a5000000-0000-0000-0000-000000000002', 'joined', now() - interval '2 hours'),
  ('a5000000-0000-0000-0000-0000000000c1', 'a5000000-0000-0000-0000-000000000003', 'joined', now() - interval '1 hour'),
  ('a5000000-0000-0000-0000-0000000000c1', 'a5000000-0000-0000-0000-000000000004', 'joined', now() - interval '3 hours');
update public.activity_participants set status = 'cancelled', cancelled_at = now()
 where activity_id = 'a5000000-0000-0000-0000-0000000000c1'
   and user_id = 'a5000000-0000-0000-0000-000000000004';

-- ------------------------------------------------- 3. not for clients

do $$ begin
  if has_function_privilege('authenticated', 'public.notify_participants_daily()', 'execute')
     or has_function_privilege('anon', 'public.notify_participants_daily()', 'execute') then
    raise exception 'FAIL: a client can run the daily digest';
  end if;
end $$;

-- ------------------------------------------------- 1. off by default

select public.notify_participants_daily();
do $$ begin
  if exists (select 1 from public.notifications where type = 'participants_daily') then
    raise exception 'FAIL: the digest reached an organizer who never switched it on';
  end if;
end $$;

-- ------------------------------------------------- 2. on

insert into public.notification_preferences (user_id, joins)
values ('a5000000-0000-0000-0000-000000000001', true);
select public.notify_participants_daily();

do $$
declare v_p jsonb;
begin
  if (select count(*) from public.notifications where type = 'participants_daily') <> 1 then
    raise exception 'FAIL: expected one digest, for the session with movement';
  end if;
  select payload into v_p from public.notifications where type = 'participants_daily';
  if (v_p ->> 'joined')::int <> 2 or (v_p ->> 'left')::int <> 1 then
    raise exception 'FAIL: wrong counts: %', v_p;
  end if;
  if jsonb_array_length(v_p -> 'names') <> 2 or (v_p -> 'names' ->> 0) <> 'Beto'
     or (v_p -> 'left_names' ->> 0) <> 'Caro' then
    raise exception 'FAIL: wrong names: %', v_p;
  end if;
end $$;

rollback;
