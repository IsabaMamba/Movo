-- =====================================================================
-- 01_participation_test.sql — behavioural checks for the participation
-- RPCs and the RLS boundary. Run after the shim + migrations:
--
--   psql app_test -v ON_ERROR_STOP=1 -f supabase/tests/01_participation_test.sql
--
-- Every check raises an exception on failure, so a clean exit is a pass.
-- =====================================================================

begin;

-- ---------------------------------------------------------------- setup

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'org@test.cr',  '{"display_name":"Organizador"}'),
  ('22222222-2222-2222-2222-222222222222', 'ana@test.cr',  '{"display_name":"Ana"}'),
  ('33333333-3333-3333-3333-333333333333', 'beto@test.cr', '{"display_name":"Beto"}'),
  ('44444444-4444-4444-4444-444444444444', 'caro@test.cr', '{"display_name":"Caro"}');

insert into public.locations (id, name, district, geog, is_public_venue, is_verified, created_by)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Parque La Sabana', 'Mata Redonda',
  extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
  true, true, '11111111-1111-1111-1111-111111111111'
);

insert into public.activities (
  id, organizer_id, category_id, location_id, title,
  starts_at, ends_at, max_participants, status, visibility, attributes
) values (
  'bbbbbbbb-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111', 'running',
  'aaaaaaaa-0000-0000-0000-000000000001', 'Corrida de prueba',
  now() + interval '2 days', now() + interval '2 days 1 hour',
  2, 'published', 'public',
  '{"distance_km": 6, "pace_min_per_km": 6.5}'::jsonb
);

-- ------------------------------------------------ capacity and waitlist

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$ begin
  if public.join_activity('bbbbbbbb-0000-0000-0000-000000000001') <> 'joined' then
    raise exception 'FAIL: first join should be joined';
  end if;
end $$;

-- Idempotent: joining twice does not double-count.
do $$ begin
  perform public.join_activity('bbbbbbbb-0000-0000-0000-000000000001');
  if (select joined_count from public.activities
       where id = 'bbbbbbbb-0000-0000-0000-000000000001') <> 1 then
    raise exception 'FAIL: repeat join inflated joined_count';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
do $$ begin
  if public.join_activity('bbbbbbbb-0000-0000-0000-000000000001') <> 'joined' then
    raise exception 'FAIL: second join should be joined';
  end if;
  if (select status from public.activities
       where id = 'bbbbbbbb-0000-0000-0000-000000000001') <> 'full' then
    raise exception 'FAIL: activity should flip to full at capacity';
  end if;
end $$;

-- Third person overflows to the waitlist rather than overfilling.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
do $$ begin
  if public.join_activity('bbbbbbbb-0000-0000-0000-000000000001') <> 'waitlisted' then
    raise exception 'FAIL: over-capacity join should be waitlisted';
  end if;
  if (select waitlist_count from public.activities
       where id = 'bbbbbbbb-0000-0000-0000-000000000001') <> 1 then
    raise exception 'FAIL: waitlist_count not maintained';
  end if;
end $$;

-- ------------------------------------------------- waitlist promotion

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select public.leave_activity('bbbbbbbb-0000-0000-0000-000000000001');

do $$ begin
  if (select status from public.activity_participants
       where activity_id = 'bbbbbbbb-0000-0000-0000-000000000001'
         and user_id = '44444444-4444-4444-4444-444444444444') <> 'joined' then
    raise exception 'FAIL: waitlist head not promoted on cancellation';
  end if;
  if (select status from public.activities
       where id = 'bbbbbbbb-0000-0000-0000-000000000001') <> 'full' then
    raise exception 'FAIL: promotion should keep the activity full';
  end if;
  if not exists (select 1 from public.notifications
                  where user_id = '44444444-4444-4444-4444-444444444444'
                    and type = 'waitlist_promoted') then
    raise exception 'FAIL: promoted user not notified';
  end if;
end $$;

-- --------------------------------------------- check-in and close-out

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select public.check_in('bbbbbbbb-0000-0000-0000-000000000001',
                       '22222222-2222-2222-2222-222222222222');

do $$
declare v_no_show integer;
begin
  if (select status from public.activity_participants
       where activity_id = 'bbbbbbbb-0000-0000-0000-000000000001'
         and user_id = '22222222-2222-2222-2222-222222222222') <> 'attended' then
    raise exception 'FAIL: check_in did not mark attended';
  end if;

  v_no_show := public.close_activity('bbbbbbbb-0000-0000-0000-000000000001');
  if v_no_show <> 1 then
    raise exception 'FAIL: expected 1 no_show, got %', v_no_show;
  end if;
  if (select status from public.activities
       where id = 'bbbbbbbb-0000-0000-0000-000000000001') <> 'completed' then
    raise exception 'FAIL: activity not completed';
  end if;
end $$;

-- Non-organizers cannot check people in.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$ begin
  begin
    perform public.check_in('bbbbbbbb-0000-0000-0000-000000000001',
                            '33333333-3333-3333-3333-333333333333');
    raise exception 'FAIL: non-organizer was allowed to check in';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

-- ------------------------------------------------------- RLS boundary

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

do $$ begin
  -- Another user's private row must be invisible.
  if exists (select 1 from public.profile_private
              where id = '33333333-3333-3333-3333-333333333333') then
    raise exception 'FAIL: profile_private leaked across users';
  end if;
  if not exists (select 1 from public.profile_private
                  where id = '22222222-2222-2222-2222-222222222222') then
    raise exception 'FAIL: own profile_private not visible';
  end if;
end $$;

-- Participation cannot be written directly; capacity is only enforceable
-- inside join_activity, so the table must reject a raw insert.
do $$ begin
  begin
    insert into public.activity_participants (activity_id, user_id, status)
    values ('bbbbbbbb-0000-0000-0000-000000000001',
            '22222222-2222-2222-2222-222222222222', 'joined');
    raise exception 'FAIL: direct insert into activity_participants succeeded';
  exception when insufficient_privilege then
    null; -- expected: no INSERT grant
  end;
end $$;

-- An activity cannot be created in someone else's name.
do $$ begin
  begin
    insert into public.activities (organizer_id, category_id, location_id, title,
                                   starts_at, ends_at)
    values ('11111111-1111-1111-1111-111111111111', 'running',
            'aaaaaaaa-0000-0000-0000-000000000001', 'Suplantada',
            now() + interval '1 day', now() + interval '1 day 1 hour');
    raise exception 'FAIL: created an activity as another organizer';
  exception when insufficient_privilege then
    null; -- expected: WITH CHECK on activities_insert
  end;
end $$;

reset role;

-- ------------------------------------------------------- geo discovery

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
insert into public.activities (
  organizer_id, category_id, location_id, title, starts_at, ends_at, status, visibility
) values (
  '11111111-1111-1111-1111-111111111111', 'running',
  'aaaaaaaa-0000-0000-0000-000000000001', 'Corrida cercana',
  now() + interval '3 days', now() + interval '3 days 1 hour', 'published', 'public'
);

do $$
declare v_near integer; v_far integer;
begin
  select count(*) into v_near
    from public.nearby_activities(9.9350, -84.1035, 5000);
  if v_near < 1 then
    raise exception 'FAIL: nearby_activities found nothing at the venue';
  end if;

  -- Limón, ~160 km east: must fall outside a 5 km radius.
  select count(*) into v_far
    from public.nearby_activities(9.9907, -83.0359, 5000);
  if v_far <> 0 then
    raise exception 'FAIL: radius filter returned % distant rows', v_far;
  end if;
end $$;

rollback;
