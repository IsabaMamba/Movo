-- =====================================================================
-- 38_blocking_rpcs_test.sql — blocks are written by RPC, listed for their
-- owner, and spoken about only to the person who blocked.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. The blocked person learns they were blocked: a notice, a name, a
--      flag on their side of a session.
--   2. A client writes `blocks` directly, or anon calls the RPCs.
--   3. The person who blocked is not told that the blocked person is now
--      going to their session, or is told every time they rejoin.
--   4. The Bloqueos list shows somebody else's blocks, or private data.
--   5. Reports lose the session they happened in, or the queue order.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

-- ---------------------------------------------------------------- setup
--
-- Olga organizes. Ana goes and blocks Beto; Beto joins later. Caro also
-- goes and has blocked nobody: the control.

insert into auth.users (id, email, raw_user_meta_data) values
  ('a3800000-0000-0000-0000-000000000001', 'olga38@test.cr', '{"display_name":"Olga"}'),
  ('a3800000-0000-0000-0000-000000000002', 'ana38@test.cr',  '{"display_name":"Ana"}'),
  ('a3800000-0000-0000-0000-000000000003', 'beto38@test.cr', '{"display_name":"Beto"}'),
  ('a3800000-0000-0000-0000-000000000004', 'caro38@test.cr', '{"display_name":"Caro"}');

insert into public.locations (id, name, geog, is_public_venue, is_verified, created_by) values
  ('b3800000-0000-0000-0000-000000000001', 'Parque 38',
   extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
   true, true, 'a3800000-0000-0000-0000-000000000001');

insert into public.activities
  (id, organizer_id, category_id, location_id, title, starts_at, ends_at, status, visibility)
values
  ('c3800000-0000-0000-0000-000000000001', 'a3800000-0000-0000-0000-000000000001', 'running',
   'b3800000-0000-0000-0000-000000000001', 'Trote 38',
   now() + interval '2 days', now() + interval '2 days 1 hour', 'published', 'public');

-- ------------------------------------------------------------- grants

do $$ begin
  if has_function_privilege('anon', 'public.block_user(uuid)', 'execute')
     or has_function_privilege('anon', 'public.unblock_user(uuid)', 'execute')
     or has_function_privilege('anon', 'public.my_blocked_people()', 'execute')
     or has_function_privilege('anon', 'public.blocked_person_going(uuid)', 'execute') then
    raise exception 'FAIL: anon can call a blocking RPC';
  end if;
  if has_function_privilege('authenticated', 'public.notify_blocked_person_going()', 'execute') then
    raise exception 'FAIL: a client can call the notice trigger function';
  end if;
  if has_table_privilege('authenticated', 'public.blocks', 'insert')
     or has_table_privilege('authenticated', 'public.blocks', 'delete') then
    raise exception 'FAIL: clients can still write blocks directly';
  end if;
end $$;

-- ------------------------------------------------------- Ana blocks Beto

select set_config('request.jwt.claim.sub', 'a3800000-0000-0000-0000-000000000002', true);
set local role authenticated;

select public.join_activity('c3800000-0000-0000-0000-000000000001');
select public.block_user('a3800000-0000-0000-0000-000000000003');
-- Twice is not an error.
select public.block_user('a3800000-0000-0000-0000-000000000003');

do $$ begin
  begin
    perform public.block_user('a3800000-0000-0000-0000-000000000002');
    raise exception 'FAIL: Ana blocked herself';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.block_user('a3800000-0000-0000-0000-0000000000ff');
    raise exception 'FAIL: a block was written for nobody';
  exception when sqlstate 'P0002' then null;
  end;
end $$;

do $$
declare
  v jsonb := public.my_blocked_people();
begin
  if jsonb_array_length(v) <> 1
     or v -> 0 ->> 'id' <> 'a3800000-0000-0000-0000-000000000003'
     or v -> 0 ->> 'display_name' <> 'Beto' then
    raise exception 'FAIL: the Bloqueos list was %', v;
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(v -> 0) k)
     <> array['avatar_url', 'blocked_at', 'display_name', 'id'] then
    raise exception 'FAIL: the Bloqueos list returns more than the public name: %', v -> 0;
  end if;
  if public.blocked_person_going('c3800000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: the notice shows before Beto goes';
  end if;
end $$;

-- ------------------------------------------------------- Caro and Beto go

reset role;
select set_config('request.jwt.claim.sub', 'a3800000-0000-0000-0000-000000000004', true);
set local role authenticated;
select public.join_activity('c3800000-0000-0000-0000-000000000001');

reset role;
select set_config('request.jwt.claim.sub', 'a3800000-0000-0000-0000-000000000003', true);
set local role authenticated;
select public.join_activity('c3800000-0000-0000-0000-000000000001');

do $$ begin
  if public.my_blocked_people() <> '[]'::jsonb then
    raise exception 'FAIL: Beto sees Ana''s block in his own list';
  end if;
  if public.blocked_person_going('c3800000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: Beto is told about a block he did not make';
  end if;
end $$;

-- Leaving and coming back does not repeat the notice.
select public.leave_activity('c3800000-0000-0000-0000-000000000001');
select public.join_activity('c3800000-0000-0000-0000-000000000001');

reset role;

do $$
declare
  v_payload jsonb;
begin
  if (select count(*) from public.notifications
       where user_id = 'a3800000-0000-0000-0000-000000000002'
         and type = 'blocked_person_going') <> 1 then
    raise exception 'FAIL: Ana got % notices, not one',
      (select count(*) from public.notifications
        where user_id = 'a3800000-0000-0000-0000-000000000002' and type = 'blocked_person_going');
  end if;

  select payload into v_payload from public.notifications
   where user_id = 'a3800000-0000-0000-0000-000000000002' and type = 'blocked_person_going';
  if v_payload::text like '%a3800000-0000-0000-0000-000000000003%'
     or v_payload::text like '%Beto%' then
    raise exception 'FAIL: the notice names who is going: %', v_payload;
  end if;

  if exists (select 1 from public.notifications
              where type = 'blocked_person_going'
                and user_id in ('a3800000-0000-0000-0000-000000000003',
                                'a3800000-0000-0000-0000-000000000004',
                                'a3800000-0000-0000-0000-000000000001')) then
    raise exception 'FAIL: somebody other than Ana was told';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'a3800000-0000-0000-0000-000000000002', true);
set local role authenticated;

do $$ begin
  if not public.blocked_person_going('c3800000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: the detail notice does not show for Ana';
  end if;
end $$;

-- Unblocking ends it.
select public.unblock_user('a3800000-0000-0000-0000-000000000003');

do $$ begin
  if public.blocked_person_going('c3800000-0000-0000-0000-000000000001')
     or public.my_blocked_people() <> '[]'::jsonb then
    raise exception 'FAIL: unblocking left the block in place';
  end if;
end $$;

-- ------------------------------------------------------------- reports

insert into public.reports (reporter_id, subject_type, subject_id, reason, context_activity_id)
values ('a3800000-0000-0000-0000-000000000002', 'user', 'a3800000-0000-0000-0000-000000000003',
        'not_eligible', 'c3800000-0000-0000-0000-000000000001'),
       ('a3800000-0000-0000-0000-000000000002', 'user', 'a3800000-0000-0000-0000-000000000003',
        'suplantacion', null),
       ('a3800000-0000-0000-0000-000000000002', 'activity', 'c3800000-0000-0000-0000-000000000001',
        'spam', null);

reset role;

do $$ begin
  if (select array_agg(reason || ':' || priority order by priority, reason) from public.reports
       where reporter_id = 'a3800000-0000-0000-0000-000000000002')
     <> array['not_eligible:0', 'suplantacion:1', 'spam:2'] then
    raise exception 'FAIL: report priorities were %',
      (select array_agg(reason || ':' || priority) from public.reports
        where reporter_id = 'a3800000-0000-0000-0000-000000000002');
  end if;
  if (select context_activity_id from public.reports
       where reporter_id = 'a3800000-0000-0000-0000-000000000002' and reason = 'not_eligible')
     <> 'c3800000-0000-0000-0000-000000000001' then
    raise exception 'FAIL: the session where it happened was not kept';
  end if;
end $$;

rollback;
