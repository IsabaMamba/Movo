-- =====================================================================
-- 07_cancel_edit_test.sql — cancelling and editing a session.
--
-- The invariants here are the ones a person on the roster relies on without
-- ever seeing them: that the session does not move under them, that a freed
-- slot reaches the next person in line, and that being told not to come can
-- never turn into being recorded as absent.
-- =====================================================================

begin;

-- ---------------------------------------------------------------- setup

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'org7@test.cr',  '{"display_name":"Organiza"}'),
  ('a0000000-0000-0000-0000-000000000002', 'ana7@test.cr',  '{"display_name":"Ana"}'),
  ('a0000000-0000-0000-0000-000000000003', 'beto7@test.cr', '{"display_name":"Beto"}'),
  ('a0000000-0000-0000-0000-000000000004', 'caro7@test.cr', '{"display_name":"Caro"}'),
  ('a0000000-0000-0000-0000-000000000005', 'dani7@test.cr', '{"display_name":"Dani"}');

insert into public.locations (id, name, geog, is_public_venue, is_verified, created_by) values
  ('b0000000-0000-0000-0000-000000000001', 'Cancha uno',
   extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
   true, true, 'a0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002', 'Cancha dos',
   extensions.st_setsrid(extensions.st_makepoint(-84.0796, 9.9081), 4326)::extensions.geography,
   true, true, 'a0000000-0000-0000-0000-000000000001');

-- c1: capped at 2, will fill and grow a waitlist.
-- c2: capped at 2, for waitlist renumbering on leave.
-- c3: nobody on it, so time and place stay editable.
insert into public.activities
  (id, organizer_id, category_id, location_id, title, starts_at, ends_at,
   max_participants, status, visibility)
values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'football',
   'b0000000-0000-0000-0000-000000000001', 'Mejenga llena',
   now() + interval '3 days', now() + interval '3 days 1 hour', 2, 'published', 'public'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'football',
   'b0000000-0000-0000-0000-000000000001', 'Mejenga con fila',
   now() + interval '3 days', now() + interval '3 days 1 hour', 2, 'published', 'public'),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'football',
   'b0000000-0000-0000-0000-000000000001', 'Mejenga vacía',
   now() + interval '3 days', now() + interval '3 days 1 hour', null, 'published', 'public');

-- Ana and Beto fill c1; Caro waits.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
select public.join_activity('c0000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', true);
select public.join_activity('c0000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', true);
select public.join_activity('c0000000-0000-0000-0000-000000000001');

-- ------------------------------------------------ direct update is gone

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$ begin
  begin
    update public.activities set joined_count = 500
     where id = 'c0000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: an organizer rewrote joined_count directly';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

reset role;

-- ------------------------------------------------ only the organizer

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);

do $$ begin
  begin
    perform public.update_activity(
      'c0000000-0000-0000-0000-000000000001', 'Secuestrada', null,
      now() + interval '3 days', 60, 'b0000000-0000-0000-0000-000000000001', 2);
    raise exception 'FAIL: a participant edited somebody else''s session';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.cancel_activity('c0000000-0000-0000-0000-000000000001', 'porque sí');
    raise exception 'FAIL: a participant cancelled somebody else''s session';
  exception when insufficient_privilege then
    null;
  end;
end $$;

-- ------------------------------------------------ time and place lock

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_start timestamptz;
begin
  select starts_at into v_start from public.activities
   where id = 'c0000000-0000-0000-0000-000000000001';

  begin
    perform public.update_activity(
      'c0000000-0000-0000-0000-000000000001', 'Mejenga llena', null,
      v_start + interval '2 hours', 60, 'b0000000-0000-0000-0000-000000000001', 2);
    raise exception 'FAIL: a session with people on it moved to another time';
  exception when sqlstate '22023' then
    null;
  end;

  begin
    perform public.update_activity(
      'c0000000-0000-0000-0000-000000000001', 'Mejenga llena', null,
      v_start, 60, 'b0000000-0000-0000-0000-000000000002', 2);
    raise exception 'FAIL: a session with people on it moved to another venue';
  exception when sqlstate '22023' then
    null;
  end;

  -- Two people are going; capacity cannot drop under them.
  begin
    perform public.update_activity(
      'c0000000-0000-0000-0000-000000000001', 'Mejenga llena', null,
      v_start, 60, 'b0000000-0000-0000-0000-000000000001', 1);
    raise exception 'FAIL: capacity dropped below the people already going';
  exception when sqlstate '22023' then
    null;
  end;
end $$;

-- ------------------------------------------------ raising capacity promotes

do $$
declare
  v_start  timestamptz;
  v_row    public.activities%rowtype;
  v_caro   public.participation_status;
begin
  select starts_at into v_start from public.activities
   where id = 'c0000000-0000-0000-0000-000000000001';

  v_row := public.update_activity(
    'c0000000-0000-0000-0000-000000000001', 'Mejenga de tres', 'portón norte',
    v_start, 90, 'b0000000-0000-0000-0000-000000000001', 3);

  select status into v_caro from public.activity_participants
   where activity_id = 'c0000000-0000-0000-0000-000000000001'
     and user_id = 'a0000000-0000-0000-0000-000000000004';

  if v_caro <> 'joined' then
    raise exception 'FAIL: raising capacity left Caro on the waitlist (%)', v_caro;
  end if;

  select * into v_row from public.activities where id = 'c0000000-0000-0000-0000-000000000001';
  if v_row.joined_count <> 3 or v_row.waitlist_count <> 0 then
    raise exception 'FAIL: counters after promotion are % joined, % waiting',
      v_row.joined_count, v_row.waitlist_count;
  end if;
  if v_row.status <> 'full' then
    raise exception 'FAIL: 3 of 3 should be full, got %', v_row.status;
  end if;
  if v_row.title <> 'Mejenga de tres' or v_row.ends_at - v_row.starts_at <> interval '90 minutes' then
    raise exception 'FAIL: title or duration did not update';
  end if;

  if not exists (
    select 1 from public.notifications
     where user_id = 'a0000000-0000-0000-0000-000000000004' and type = 'waitlist_promoted'
  ) then
    raise exception 'FAIL: Caro was promoted without a notification';
  end if;
end $$;

-- Raising capacity with nobody waiting still has to release "full".
do $$
declare
  v_start timestamptz;
  v_row   public.activities%rowtype;
begin
  select starts_at into v_start from public.activities
   where id = 'c0000000-0000-0000-0000-000000000001';
  v_row := public.update_activity(
    'c0000000-0000-0000-0000-000000000001', 'Mejenga de tres', 'portón norte',
    v_start, 90, 'b0000000-0000-0000-0000-000000000001', 10);
  if v_row.status <> 'published' then
    raise exception 'FAIL: 3 of 10 is still marked %', v_row.status;
  end if;
end $$;

-- ------------------------------------------------ empty session moves freely

do $$
declare
  v_row public.activities%rowtype;
begin
  v_row := public.update_activity(
    'c0000000-0000-0000-0000-000000000003', 'Mejenga movida', null,
    now() + interval '5 days', 60, 'b0000000-0000-0000-0000-000000000002', null);
  if v_row.location_id <> 'b0000000-0000-0000-0000-000000000002' then
    raise exception 'FAIL: an empty session could not change venue';
  end if;
end $$;

-- ------------------------------------------------ waitlist renumbers on leave

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
select public.join_activity('c0000000-0000-0000-0000-000000000002');
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', true);
select public.join_activity('c0000000-0000-0000-0000-000000000002');
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', true);
select public.join_activity('c0000000-0000-0000-0000-000000000002');
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000005', true);
select public.join_activity('c0000000-0000-0000-0000-000000000002');

-- Ana leaves: Caro (1) moves up, Dani (2) should now read as 1.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
select public.leave_activity('c0000000-0000-0000-0000-000000000002');

do $$
declare
  v_pos integer;
begin
  select waitlist_pos into v_pos from public.activity_participants
   where activity_id = 'c0000000-0000-0000-0000-000000000002'
     and user_id = 'a0000000-0000-0000-0000-000000000005';
  if v_pos is distinct from 1 then
    raise exception 'FAIL: after the head was promoted, Dani is still puesto %', v_pos;
  end if;
end $$;

-- ------------------------------------------------ cancel

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_notified integer;
  v_row      public.activities%rowtype;
begin
  v_notified := public.cancel_activity('c0000000-0000-0000-0000-000000000001', '  Llueve  ');
  if v_notified <> 3 then
    raise exception 'FAIL: cancel should notify 3 people, notified %', v_notified;
  end if;

  select * into v_row from public.activities where id = 'c0000000-0000-0000-0000-000000000001';
  if v_row.status <> 'cancelled' or v_row.cancelled_at is null or v_row.cancel_reason <> 'Llueve' then
    raise exception 'FAIL: cancellation not recorded (%, %, %)',
      v_row.status, v_row.cancelled_at, v_row.cancel_reason;
  end if;

  -- Rows are kept as they were: nobody on the roster left.
  if exists (
    select 1 from public.activity_participants
     where activity_id = 'c0000000-0000-0000-0000-000000000001' and status = 'cancelled'
  ) then
    raise exception 'FAIL: cancelling the session rewrote participants as having left';
  end if;

  -- Idempotent.
  if public.cancel_activity('c0000000-0000-0000-0000-000000000001', null) <> 0 then
    raise exception 'FAIL: cancelling twice notified people twice';
  end if;
end $$;

-- A cancelled session cannot be joined, edited, checked in, or closed.
do $$ begin
  begin
    perform public.update_activity(
      'c0000000-0000-0000-0000-000000000001', 'Resucitada', null,
      now() + interval '3 days', 60, 'b0000000-0000-0000-0000-000000000001', 10);
    raise exception 'FAIL: a cancelled session was edited';
  exception when sqlstate '22023' then
    null;
  end;

  begin
    perform public.check_in('c0000000-0000-0000-0000-000000000001',
                            'a0000000-0000-0000-0000-000000000002');
    raise exception 'FAIL: somebody was checked in to a cancelled session';
  exception when sqlstate '22023' then
    null;
  end;

  begin
    perform public.close_activity('c0000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: a cancelled session was closed';
  exception when sqlstate '22023' then
    null;
  end;
end $$;

do $$ begin
  if exists (
    select 1 from public.activity_participants
     where activity_id = 'c0000000-0000-0000-0000-000000000001' and status = 'no_show'
  ) then
    raise exception 'FAIL: people told not to come were recorded as absent';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000005', true);
do $$ begin
  begin
    perform public.join_activity('c0000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: joined a cancelled session';
  exception when sqlstate '22023' then
    null;
  end;
end $$;

rollback;
