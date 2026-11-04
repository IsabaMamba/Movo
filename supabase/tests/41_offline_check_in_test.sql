-- =====================================================================
-- 41_offline_check_in_test.sql — «Llegué» sent after reconnecting.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. A tap outside the window, in the future, or after the organizer
--      closed the session counts as a check-in.
--   2. The offline path skips the code or the five-attempt lock.
--   3. An offline check-in looks like any other on the roster, or somebody
--      other than the organizer confirms it.
--   4. Undoing a check-in leaves the offline flag behind.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a4100000-0000-0000-0000-000000000001', 'olga41@test.cr', '{"display_name":"Olga"}'),
  ('a4100000-0000-0000-0000-000000000002', 'ana41@test.cr',  '{"display_name":"Ana"}'),
  ('a4100000-0000-0000-0000-000000000003', 'beto41@test.cr', '{"display_name":"Beto"}'),
  ('a4100000-0000-0000-0000-000000000004', 'caro41@test.cr', '{"display_name":"Caro"}');

insert into public.locations (id, name, geog, is_public_venue, is_verified, created_by) values
  ('b4100000-0000-0000-0000-000000000001', 'Sendero 41',
   extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
   true, true, 'a4100000-0000-0000-0000-000000000001');

-- Started 30 minutes ago: inside the window now, and a tap 10 minutes ago
-- was too.
insert into public.activities
  (id, organizer_id, category_id, location_id, title, starts_at, ends_at, status, visibility)
values
  ('c4100000-0000-0000-0000-000000000001', 'a4100000-0000-0000-0000-000000000001', 'hiking',
   'b4100000-0000-0000-0000-000000000001', 'Subida 41',
   now() - interval '30 minutes', now() + interval '2 hours', 'published', 'public');

insert into public.activity_participants (activity_id, user_id, status) values
  ('c4100000-0000-0000-0000-000000000001', 'a4100000-0000-0000-0000-000000000002', 'joined'),
  ('c4100000-0000-0000-0000-000000000001', 'a4100000-0000-0000-0000-000000000003', 'joined'),
  ('c4100000-0000-0000-0000-000000000001', 'a4100000-0000-0000-0000-000000000004', 'joined');

do $$ begin
  if has_function_privilege('anon', 'public.self_check_in_offline(uuid, text, timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.confirm_offline_check_in(uuid, uuid)', 'execute') then
    raise exception 'FAIL: anon can check in offline or confirm';
  end if;
  if has_column_privilege('authenticated', 'public.activity_participants', 'check_in_offline', 'update') then
    raise exception 'FAIL: a client can clear its own offline flag';
  end if;
end $$;

-- The organizer opens today's code.
select set_config('request.jwt.claim.sub', 'a4100000-0000-0000-0000-000000000001', true);
create temporary table code41 on commit drop as
  select public.check_in_code('c4100000-0000-0000-0000-000000000001') as code;
grant select on code41 to authenticated;

-- ------------------------------------------------------------ Ana's tap

select set_config('request.jwt.claim.sub', 'a4100000-0000-0000-0000-000000000002', true);
set local role authenticated;

do $$
declare
  v_code text := (select code from code41);
  v_tap  timestamptz := now() - interval '10 minutes';
begin
  begin
    perform public.self_check_in_offline('c4100000-0000-0000-0000-000000000001', v_code, now() + interval '1 hour');
    raise exception 'FAIL: a tap in the future was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.self_check_in_offline('c4100000-0000-0000-0000-000000000001', v_code, now() - interval '2 hours');
    raise exception 'FAIL: a tap before the window opened was accepted';
  exception when sqlstate '22023' then null;
  end;

  if public.self_check_in_offline('c4100000-0000-0000-0000-000000000001', '0000', v_tap)
     not in ('wrong_code', 'checked_in') then
    raise exception 'FAIL: a wrong code was not answered';
  end if;

  if public.self_check_in_offline('c4100000-0000-0000-0000-000000000001', v_code, v_tap) not in ('checked_in', 'already') then
    raise exception 'FAIL: Ana''s tap was not accepted';
  end if;
  if public.self_check_in_offline('c4100000-0000-0000-0000-000000000001', v_code, v_tap) <> 'already' then
    raise exception 'FAIL: sending the same tap twice was not «already»';
  end if;
end $$;

reset role;

do $$ begin
  if not exists (select 1 from public.activity_participants
                  where activity_id = 'c4100000-0000-0000-0000-000000000001'
                    and user_id = 'a4100000-0000-0000-0000-000000000002'
                    and status = 'attended'
                    and check_in_offline
                    and checked_in_at < now() - interval '9 minutes') then
    raise exception 'FAIL: the check-in did not keep the time of the tap and the offline mark';
  end if;
end $$;

-- ------------------------------------------------------- Beto's lock

select set_config('request.jwt.claim.sub', 'a4100000-0000-0000-0000-000000000003', true);
set local role authenticated;

do $$
declare
  i integer;
  v text;
begin
  for i in 1..5 loop
    v := public.self_check_in_offline('c4100000-0000-0000-0000-000000000001',
                                      case when (select code from code41) = '9999' then '9998' else '9999' end,
                                      now() - interval '5 minutes');
  end loop;
  if v <> 'locked' then
    raise exception 'FAIL: five wrong codes did not lock the offline path (got %)', v;
  end if;
  if public.self_check_in_offline('c4100000-0000-0000-0000-000000000001', (select code from code41),
                                  now() - interval '5 minutes') <> 'locked' then
    raise exception 'FAIL: the right code got through after the lock';
  end if;
  begin
    perform public.confirm_offline_check_in('c4100000-0000-0000-0000-000000000001',
                                            'a4100000-0000-0000-0000-000000000002');
    raise exception 'FAIL: a participant confirmed somebody''s check-in';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ------------------------------------------------- the organizer confirms

reset role;
select set_config('request.jwt.claim.sub', 'a4100000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.confirm_offline_check_in('c4100000-0000-0000-0000-000000000001',
                                       'a4100000-0000-0000-0000-000000000002');
reset role;

do $$ begin
  if (select check_in_offline from public.activity_participants
       where activity_id = 'c4100000-0000-0000-0000-000000000001'
         and user_id = 'a4100000-0000-0000-0000-000000000002') then
    raise exception 'FAIL: confirming left the offline mark';
  end if;
end $$;

-- Undo clears the flag; then the organizer closes, and Caro's late sync is
-- refused.
update public.activity_participants set check_in_offline = true
 where activity_id = 'c4100000-0000-0000-0000-000000000001'
   and user_id = 'a4100000-0000-0000-0000-000000000002';

select set_config('request.jwt.claim.sub', 'a4100000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.undo_check_in('c4100000-0000-0000-0000-000000000001', 'a4100000-0000-0000-0000-000000000002');
reset role;

do $$ begin
  if (select check_in_offline from public.activity_participants
       where activity_id = 'c4100000-0000-0000-0000-000000000001'
         and user_id = 'a4100000-0000-0000-0000-000000000002') then
    raise exception 'FAIL: undoing a check-in left the offline mark';
  end if;
end $$;

update public.activities set status = 'completed' where id = 'c4100000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub', 'a4100000-0000-0000-0000-000000000004', true);
set local role authenticated;

do $$ begin
  begin
    perform public.self_check_in_offline('c4100000-0000-0000-0000-000000000001',
                                         (select code from code41), now() - interval '10 minutes');
    raise exception 'FAIL: a tap synced after the session was closed was accepted';
  exception when sqlstate '22023' then null;
  end;
end $$;

reset role;

rollback;
