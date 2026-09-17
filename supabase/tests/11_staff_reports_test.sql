-- =====================================================================
-- 11_staff_reports_test.sql — the report queue has a reader, and only one.
--
-- Three things, which are the three ways this can be wrong:
--
--   1. Somebody without the role sees only their own report. If this fails,
--      every user can read every safety report — including the reports made
--      about them, with the reporter's name attached.
--   2. Staff sees the whole queue. If this fails, the queue has no reader
--      again and the button is back to being theatre.
--   3. Only staff resolves, the stamp names the caller, and a resolved
--      report cannot be reopened or re-resolved.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

-- ---------------------------------------------------------------- setup

insert into auth.users (id, email, raw_user_meta_data) values
  ('bb000000-0000-0000-0000-0000000000b1', 'reporta@test.cr',  '{"display_name":"Quien reporta"}'),
  ('bb000000-0000-0000-0000-0000000000b2', 'cualquiera@test.cr','{"display_name":"Cualquiera"}'),
  ('bb000000-0000-0000-0000-0000000000b3', 'staff@test.cr',    '{"display_name":"Equipo Movo"}');

insert into public.staff (user_id, note)
values ('bb000000-0000-0000-0000-0000000000b3', 'Test fixture');

-- A cancelled session, which is the case that matters: `activities_read`
-- does not admit one, and a cancelled session is a likely thing to be
-- reported about.
insert into public.locations (id, name, district, geog, is_public_venue, is_verified, created_by)
values (
  'ee000000-0000-0000-0000-0000000000e1', 'Parque reportado', 'Mata Redonda',
  extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
  true, true, 'bb000000-0000-0000-0000-0000000000b2'
);

insert into public.activities (
  id, organizer_id, category_id, location_id, title,
  starts_at, ends_at, status, visibility, attributes
) values (
  '11111111-1111-1111-1111-111111111111',
  'bb000000-0000-0000-0000-0000000000b2', 'running',
  'ee000000-0000-0000-0000-0000000000e1', 'Sesion reportada',
  now() + interval '2 days', now() + interval '2 days 1 hour',
  'cancelled', 'public',
  '{"distance_km": 5, "pace_min_per_km": 6.0}'::jsonb
);

insert into public.reports (id, reporter_id, subject_type, subject_id, reason, details) values
  ('dd000000-0000-0000-0000-0000000000d1',
   'bb000000-0000-0000-0000-0000000000b1', 'activity',
   '11111111-1111-1111-1111-111111111111', 'comportamiento', null),
  ('dd000000-0000-0000-0000-0000000000d2',
   'bb000000-0000-0000-0000-0000000000b2', 'activity',
   '22222222-2222-2222-2222-222222222222', 'spam', 'Otro reporte');

-- ------------------------------------------- who is staff cannot be asked

-- is_staff() answers only about the caller. An overload that takes an id is an
-- oracle: profiles are world-readable, so walking every profile id through it
-- lists the whole team, which is what keeping `staff` in its own table prevents.
do $$ begin
  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'is_staff' and p.pronargs > 0
  ) then
    raise exception 'FAIL: is_staff() can be asked about somebody other than the caller';
  end if;

  -- New functions are executable by PUBLIC unless revoked, the same trap as
  -- the default table privileges, one object type over.
  if has_function_privilege('anon', 'public.is_staff()', 'execute') then
    raise exception 'FAIL: anon can execute is_staff()';
  end if;
  if has_function_privilege(
       'anon', 'public.resolve_report(uuid, public.report_status, text)', 'execute') then
    raise exception 'FAIL: anon can execute resolve_report()';
  end if;
end $$;

-- ------------------------------------------- a user with no role assigned

select set_config('request.jwt.claim.sub', 'bb000000-0000-0000-0000-0000000000b1', true);
set local role authenticated;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.reports;
  if v_count <> 1 then
    raise exception
      'FAIL: a user without the staff role reads % reports, expected only their own', v_count;
  end if;
end $$;

do $$ begin
  if public.is_staff() then
    raise exception 'FAIL: a user without the role is treated as staff';
  end if;
end $$;

-- `staff` itself must not be readable. Who moderates is not public.
do $$
declare
  v_sqlstate text;
begin
  begin
    perform 1 from public.staff;
    raise exception 'FAIL: a user can read the staff table';
  exception
    when insufficient_privilege then
      null; -- expected: no grant at all
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate = 'P0001' then raise; end if;
      raise exception 'FAIL: reading staff refused with %, expected 42501', v_sqlstate;
  end;
end $$;

-- And they cannot resolve anything, not even their own report.
do $$
declare
  v_sqlstate text;
begin
  begin
    perform public.resolve_report(
      'dd000000-0000-0000-0000-0000000000d1'::uuid, 'dismissed'::report_status, 'nope');
    raise exception 'FAIL: a user without the staff role resolved a report';
  exception
    when insufficient_privilege then
      null; -- expected, raised by the function
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate = 'P0001' then raise; end if;
      raise exception 'FAIL: resolve refused with %, expected 42501', v_sqlstate;
  end;
end $$;

reset role;

-- --------------------------------------------------------------- as staff

select set_config('request.jwt.claim.sub', 'bb000000-0000-0000-0000-0000000000b3', true);
set local role authenticated;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.reports;
  if v_count <> 2 then
    raise exception 'FAIL: staff reads % reports, expected the whole queue of 2', v_count;
  end if;
end $$;

do $$ begin
  if not public.is_staff() then
    raise exception 'FAIL: a staff member is not recognised as staff';
  end if;
end $$;

-- Staff can open the session a report is about, even cancelled — otherwise the
-- queue names a report and cannot show what it concerns.
do $$ begin
  if not exists (
    select 1 from public.activities where id = '11111111-1111-1111-1111-111111111111'
  ) then
    raise exception 'FAIL: staff cannot read the cancelled session a report is about';
  end if;
end $$;

-- 'open' is where a report starts, not somewhere it returns to.
do $$
declare
  v_sqlstate text;
begin
  begin
    perform public.resolve_report(
      'dd000000-0000-0000-0000-0000000000d1'::uuid, 'open'::report_status, null);
    raise exception 'FAIL: a report was moved back to open';
  exception
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate = 'P0001' then raise; end if;
      if v_sqlstate <> '22023' then
        raise exception 'FAIL: reopening refused with %, expected 22023', v_sqlstate;
      end if;
  end;
end $$;

-- 'reviewing' is a real state: picked up, not finished.
select public.resolve_report(
  'dd000000-0000-0000-0000-0000000000d1'::uuid, 'reviewing'::report_status, null);

do $$
declare
  v_status report_status;
  v_by     uuid;
  v_at     timestamptz;
begin
  select status, reviewed_by, reviewed_at into v_status, v_by, v_at
    from public.reports where id = 'dd000000-0000-0000-0000-0000000000d1';

  if v_status <> 'reviewing' then
    raise exception 'FAIL: status is % after resolve_report(reviewing)', v_status;
  end if;
  -- The stamp comes from auth.uid(), not from an argument, so it cannot name
  -- somebody who did not do the reviewing.
  if v_by is distinct from 'bb000000-0000-0000-0000-0000000000b3' then
    raise exception 'FAIL: reviewed_by is %, expected the calling staff member', v_by;
  end if;
  if v_at is null then
    raise exception 'FAIL: reviewed_at was not stamped';
  end if;
end $$;

-- Nothing reaches the reporter yet — "we reviewed it" followed by a week of
-- silence is worse than silence.
do $$ begin
  if exists (select 1 from public.notifications where type = 'report_resolved') then
    raise exception 'FAIL: reviewing notified the reporter; only a resolution should';
  end if;
end $$;

-- Finishing it does notify, and says only that it was reviewed.
select public.resolve_report(
  'dd000000-0000-0000-0000-0000000000d1'::uuid,
  'dismissed'::report_status,
  '  Reporte de prueba.  ');

do $$ begin
  if not exists (
    select 1 from public.reports
     where id = 'dd000000-0000-0000-0000-0000000000d1'
       and status = 'dismissed'
       and action_taken = 'Reporte de prueba.'   -- trimmed by the function
  ) then
    raise exception 'FAIL: the report was not recorded as dismissed with its note';
  end if;
end $$;

-- The notification is checked with the role reset rather than as staff, and
-- the reason is itself a property worth stating: `notifications_read_own`
-- restricts reads to the recipient, so staff cannot see what the reporter was
-- sent. A first version of this test asserted it as staff and failed — the
-- policy was right and the assertion was wrong.
reset role;

do $$
declare
  v_payload jsonb;
begin
  select payload into v_payload
    from public.notifications
   where user_id = 'bb000000-0000-0000-0000-0000000000b1'
     and type    = 'report_resolved';

  if v_payload is null then
    raise exception 'FAIL: the reporter was never told their report was reviewed';
  end if;
  -- What was decided about another person is not the reporter's to receive.
  if v_payload ? 'action_taken' or v_payload ? 'status' then
    raise exception 'FAIL: the report_resolved payload leaks the outcome: %', v_payload;
  end if;
end $$;

-- Back to staff for the last check.
select set_config('request.jwt.claim.sub', 'bb000000-0000-0000-0000-0000000000b3', true);
set local role authenticated;

-- A resolved report is finished. Re-resolving it would overwrite who looked
-- at it and when, which is the entire audit trail.
do $$
declare
  v_sqlstate text;
begin
  begin
    perform public.resolve_report(
      'dd000000-0000-0000-0000-0000000000d1'::uuid, 'actioned'::report_status, 'otra vez');
    raise exception 'FAIL: an already-resolved report was resolved again';
  exception
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate = 'P0001' then raise; end if;
      if v_sqlstate <> '22023' then
        raise exception 'FAIL: re-resolving refused with %, expected 22023', v_sqlstate;
      end if;
  end;
end $$;

reset role;

rollback;
