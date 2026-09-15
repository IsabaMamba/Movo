-- =====================================================================
-- 09_attendance_window_test.sql — attendance is recorded around the session.
--
-- On the live project a session was checked in hours ahead and closed before
-- it started. These checks pin the window that prevents both, and the stale
-- check-in stamp a re-join used to carry.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('e0000000-0000-0000-0000-000000000001', 'org9@test.cr',  '{"display_name":"Organiza"}'),
  ('e0000000-0000-0000-0000-000000000002', 'ana9@test.cr',  '{"display_name":"Ana"}'),
  ('e0000000-0000-0000-0000-000000000003', 'beto9@test.cr', '{"display_name":"Beto"}');

insert into public.locations (id, name, geog, is_public_venue, is_verified, created_by) values
  ('e1000000-0000-0000-0000-000000000001', 'Cancha nueve',
   extensions.st_setsrid(extensions.st_makepoint(-84.0700, 9.9400), 4326)::extensions.geography,
   true, true, 'e0000000-0000-0000-0000-000000000001');

-- soon:    starts in 20 minutes — check-in open, not started
-- later:   starts in 2 hours    — check-in closed
-- started: began 10 minutes ago — both open
insert into public.activities
  (id, organizer_id, category_id, location_id, title, starts_at, ends_at, status, visibility)
values
  ('e2000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'football',
   'e1000000-0000-0000-0000-000000000001', 'Pronto',
   now() + interval '20 minutes', now() + interval '80 minutes', 'published', 'public'),
  ('e2000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'football',
   'e1000000-0000-0000-0000-000000000001', 'Más tarde',
   now() + interval '2 hours', now() + interval '3 hours', 'published', 'public'),
  ('e2000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001', 'football',
   'e1000000-0000-0000-0000-000000000001', 'Empezada',
   now() - interval '10 minutes', now() + interval '50 minutes', 'published', 'public');

select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000002', true);
select public.join_activity('e2000000-0000-0000-0000-000000000001');
select public.join_activity('e2000000-0000-0000-0000-000000000002');
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000003', true);
select public.join_activity('e2000000-0000-0000-0000-000000000001');

-- join_activity() refuses a started session, so these two are placed directly.
insert into public.activity_participants (activity_id, user_id, status) values
  ('e2000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000002', 'joined'),
  ('e2000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000003', 'joined');

select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', true);

-- ------------------------------------------------ check-in window

do $$ begin
  begin
    perform public.check_in('e2000000-0000-0000-0000-000000000002',
                            'e0000000-0000-0000-0000-000000000002');
    raise exception 'FAIL: checked somebody in two hours before the start';
  exception when sqlstate '22023' then
    null;
  end;
end $$;

select public.check_in('e2000000-0000-0000-0000-000000000001',
                       'e0000000-0000-0000-0000-000000000002');

do $$ begin
  if (select status from public.activity_participants
       where activity_id = 'e2000000-0000-0000-0000-000000000001'
         and user_id = 'e0000000-0000-0000-0000-000000000002') <> 'attended' then
    raise exception 'FAIL: check-in 20 minutes before the start was refused';
  end if;
end $$;

-- ------------------------------------------------ close needs a started session

do $$ begin
  begin
    perform public.close_activity('e2000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: closed a session that has not started';
  exception when sqlstate '22023' then
    null;
  end;

  if (select status from public.activity_participants
       where activity_id = 'e2000000-0000-0000-0000-000000000001'
         and user_id = 'e0000000-0000-0000-0000-000000000003') <> 'joined' then
    raise exception 'FAIL: a refused close still marked somebody absent';
  end if;
end $$;

do $$
declare
  v_no_show integer;
begin
  perform public.check_in('e2000000-0000-0000-0000-000000000003',
                          'e0000000-0000-0000-0000-000000000002');
  v_no_show := public.close_activity('e2000000-0000-0000-0000-000000000003');
  if v_no_show <> 1 then
    raise exception 'FAIL: closing a started session should record 1 no_show, got %', v_no_show;
  end if;
end $$;

-- ------------------------------------------------ re-join clears the old stamp

select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000002', true);
select public.leave_activity('e2000000-0000-0000-0000-000000000001');
select public.join_activity('e2000000-0000-0000-0000-000000000001');

do $$
declare
  v_row public.activity_participants%rowtype;
begin
  select * into v_row from public.activity_participants
   where activity_id = 'e2000000-0000-0000-0000-000000000001'
     and user_id = 'e0000000-0000-0000-0000-000000000002';
  if v_row.status <> 'joined' or v_row.checked_in_at is not null or v_row.checked_in_by is not null then
    raise exception 'FAIL: a re-join kept the old check-in (status %, checked_in_at %)',
      v_row.status, v_row.checked_in_at;
  end if;
end $$;

rollback;
