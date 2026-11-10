-- =====================================================================
-- 57_pasadas_retention_test.sql — rosters older than six months become a
-- monthly count; nothing newer is touched.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. A roster younger than six months is deleted.
--   2. An old roster is kept, or counted twice when the job runs again.
--   3. The counts are wrong: a no-show counted as went, a cancelled session
--      as organized.
--   4. Somebody reads another person's counts, or a client runs the job.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a5700000-0000-0000-0000-000000000001', 'olga57@test.cr', '{"display_name":"Olga"}'),
  ('a5700000-0000-0000-0000-000000000002', 'ana57@test.cr',  '{"display_name":"Ana"}'),
  ('a5700000-0000-0000-0000-000000000003', 'beto57@test.cr', '{"display_name":"Beto"}');

insert into public.locations (id, name, geog, is_public_venue, is_verified, created_by) values
  ('b5700000-0000-0000-0000-000000000001', 'Parque 57',
   extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
   true, true, 'a5700000-0000-0000-0000-000000000001');

-- Two old sessions in the same month (one cancelled), and one recent.
insert into public.activities
  (id, organizer_id, category_id, location_id, title, starts_at, ends_at, status, visibility)
values
  ('c5700000-0000-0000-0000-000000000001', 'a5700000-0000-0000-0000-000000000001', 'running',
   'b5700000-0000-0000-0000-000000000001', 'Vieja 57', '2026-03-10 12:00+00', '2026-03-10 13:00+00', 'completed', 'public'),
  ('c5700000-0000-0000-0000-000000000002', 'a5700000-0000-0000-0000-000000000001', 'running',
   'b5700000-0000-0000-0000-000000000001', 'Vieja cancelada 57', '2026-03-17 12:00+00', '2026-03-17 13:00+00', 'cancelled', 'public'),
  ('c5700000-0000-0000-0000-000000000003', 'a5700000-0000-0000-0000-000000000001', 'running',
   'b5700000-0000-0000-0000-000000000001', 'Reciente 57', now() - interval '20 days', now() - interval '20 days' + interval '1 hour', 'completed', 'public');

insert into public.activity_participants (activity_id, user_id, status) values
  ('c5700000-0000-0000-0000-000000000001', 'a5700000-0000-0000-0000-000000000002', 'attended'),
  ('c5700000-0000-0000-0000-000000000001', 'a5700000-0000-0000-0000-000000000003', 'no_show'),
  ('c5700000-0000-0000-0000-000000000002', 'a5700000-0000-0000-0000-000000000002', 'cancelled'),
  ('c5700000-0000-0000-0000-000000000003', 'a5700000-0000-0000-0000-000000000002', 'attended');

do $$ begin
  if has_function_privilege('authenticated', 'public.purge_pasadas()', 'execute') then
    raise exception 'FAIL: a client can run the purge';
  end if;
  if has_table_privilege('authenticated', 'public.attendance_monthly', 'insert') then
    raise exception 'FAIL: a client can write monthly counts';
  end if;
end $$;

do $$
declare
  v1 jsonb := public.purge_pasadas();
  v2 jsonb := public.purge_pasadas();
begin
  if (v1 ->> 'sessions')::int <> 2 or (v2 ->> 'sessions')::int <> 0 then
    raise exception 'FAIL: purged % then % sessions', v1, v2;
  end if;
  if exists (select 1 from public.activity_participants
              where activity_id in ('c5700000-0000-0000-0000-000000000001', 'c5700000-0000-0000-0000-000000000002')) then
    raise exception 'FAIL: an old roster was kept';
  end if;
  if not exists (select 1 from public.activity_participants
                  where activity_id = 'c5700000-0000-0000-0000-000000000003') then
    raise exception 'FAIL: a recent roster was deleted';
  end if;
  if (select went from public.attendance_monthly
       where user_id = 'a5700000-0000-0000-0000-000000000002' and month = '2026-03-01') <> 1 then
    raise exception 'FAIL: Ana''s March count is wrong';
  end if;
  if exists (select 1 from public.attendance_monthly
              where user_id = 'a5700000-0000-0000-0000-000000000003' and went > 0) then
    raise exception 'FAIL: a no-show was counted as went';
  end if;
  if (select organized from public.attendance_monthly
       where user_id = 'a5700000-0000-0000-0000-000000000001' and month = '2026-03-01') <> 1 then
    raise exception 'FAIL: the cancelled session was counted as organized, or the closed one was not';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'a5700000-0000-0000-0000-000000000003', true);
set local role authenticated;

do $$ begin
  if exists (select 1 from public.attendance_monthly where user_id <> 'a5700000-0000-0000-0000-000000000003') then
    raise exception 'FAIL: Beto reads somebody else''s counts';
  end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', 'a5700000-0000-0000-0000-000000000002', true);
set local role authenticated;

do $$ begin
  if public.my_monthly_attendance() <> '[{"month": "2026-03-01", "went": 1, "organized": 0}]'::jsonb then
    raise exception 'FAIL: my_monthly_attendance() was %', public.my_monthly_attendance();
  end if;
end $$;

reset role;

rollback;
