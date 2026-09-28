-- =====================================================================
-- 21_solo_session_warning_test.sql — a session about to be two people
-- alone warns both of them, once, in time; nothing else is warned.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. A session with one person joined inside the 24-hour window is not
--      warned, or only one of the two people is.
--   2. The count is read once and never again: a session that drops to one
--      person later is not warned.
--   3. Somebody is warned who should not be: two or more joined, nobody
--      joined, outside the window, already started, cancelled.
--   4. The same session is warned twice.
--   5. A client runs the job or sets the stamp.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

-- ---------------------------------------------------------------- setup
--
-- Olga organizes everything. Ana, Beto and Caro join.

insert into auth.users (id, email, raw_user_meta_data) values
  ('a2100000-0000-0000-0000-000000000001', 'olga21@test.cr', '{"display_name":"Olga"}'),
  ('a2100000-0000-0000-0000-000000000002', 'ana21@test.cr',  '{"display_name":"Ana"}'),
  ('a2100000-0000-0000-0000-000000000003', 'beto21@test.cr', '{"display_name":"Beto"}'),
  ('a2100000-0000-0000-0000-000000000004', 'caro21@test.cr', '{"display_name":"Caro"}');

insert into public.locations (id, name, geog, is_public_venue, is_verified, created_by) values
  ('b2100000-0000-0000-0000-000000000001', 'Cancha 21',
   extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
   true, true, 'a2100000-0000-0000-0000-000000000001');

-- S1 one joined, in 10 h          -> warned
-- S2 two joined, in 10 h          -> not, until one leaves
-- S3 one joined, in 30 h          -> not (outside the window)
-- S4 nobody joined, in 10 h       -> not
-- S5 one joined, then cancelled   -> not
-- S6 one joined, started 1 h ago  -> not
insert into public.activities
  (id, organizer_id, category_id, location_id, title, starts_at, ends_at, status, visibility)
select v.id::uuid, 'a2100000-0000-0000-0000-000000000001', 'running',
       'b2100000-0000-0000-0000-000000000001', v.title,
       now() + v.offset_, now() + v.offset_ + interval '1 hour', 'published', 'public'
  from (values
    ('c2100000-0000-0000-0000-000000000001', 'Sola 1',       interval '10 hours'),
    ('c2100000-0000-0000-0000-000000000002', 'Dos',          interval '10 hours'),
    ('c2100000-0000-0000-0000-000000000003', 'Lejana',       interval '30 hours'),
    ('c2100000-0000-0000-0000-000000000004', 'Vacía',        interval '10 hours'),
    ('c2100000-0000-0000-0000-000000000005', 'Cancelada',    interval '10 hours'),
    ('c2100000-0000-0000-0000-000000000006', 'Empezada',     interval '-1 hour')
  ) as v(id, title, offset_);

select set_config('request.jwt.claim.sub', 'a2100000-0000-0000-0000-000000000002', true);
select public.join_activity('c2100000-0000-0000-0000-000000000001');
select public.join_activity('c2100000-0000-0000-0000-000000000002');
select public.join_activity('c2100000-0000-0000-0000-000000000003');
select public.join_activity('c2100000-0000-0000-0000-000000000005');
select set_config('request.jwt.claim.sub', 'a2100000-0000-0000-0000-000000000003', true);
select public.join_activity('c2100000-0000-0000-0000-000000000002');

-- join_activity() refuses a started session, so this one is placed directly.
insert into public.activity_participants (activity_id, user_id, status)
values ('c2100000-0000-0000-0000-000000000006', 'a2100000-0000-0000-0000-000000000004', 'joined');

select set_config('request.jwt.claim.sub', 'a2100000-0000-0000-0000-000000000001', true);
select public.cancel_activity('c2100000-0000-0000-0000-000000000005', 'Llueve');

-- The cancellation wrote its own notices; only the warnings are counted below.
delete from public.notifications
 where user_id in (select id from auth.users where email like '%21@test.cr');

-- ------------------------------------------------------------- grants

do $$ begin
  if has_function_privilege('authenticated', 'public.warn_solo_sessions()', 'execute')
     or has_function_privilege('anon', 'public.warn_solo_sessions()', 'execute') then
    raise exception 'FAIL: a client can run warn_solo_sessions()';
  end if;
  if has_column_privilege('authenticated', 'public.activities', 'solo_warned_at', 'update') then
    raise exception 'FAIL: a client can set solo_warned_at';
  end if;
end $$;

-- ------------------------------------------------------------ first run

do $$
declare
  v_warned integer;
  r        record;
begin
  v_warned := public.warn_solo_sessions();
  if v_warned <> 1 then
    raise exception 'FAIL: warned % sessions, expected 1 (Sola 1)', v_warned;
  end if;

  if (select solo_warned_at from public.activities
       where id = 'c2100000-0000-0000-0000-000000000001') is null then
    raise exception 'FAIL: Sola 1 was not stamped';
  end if;

  if exists (select 1 from public.activities
              where id <> 'c2100000-0000-0000-0000-000000000001'
                and id::text like 'c2100000-%'
                and solo_warned_at is not null) then
    raise exception 'FAIL: a session other than Sola 1 was stamped';
  end if;

  if (select count(*) from public.notifications
       where user_id = 'a2100000-0000-0000-0000-000000000001'
         and type = 'solo_session_organizer'
         and payload ->> 'activity_id' = 'c2100000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'FAIL: the organizer of Sola 1 was not told exactly once';
  end if;

  if (select count(*) from public.notifications
       where user_id = 'a2100000-0000-0000-0000-000000000002'
         and type = 'solo_session_participant'
         and payload ->> 'activity_id' = 'c2100000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'FAIL: Ana, alone on Sola 1, was not told exactly once';
  end if;

  if (select count(*) from public.notifications
       where type like 'solo_session_%'
         and user_id in (select id from auth.users where email like '%21@test.cr')) <> 2 then
    raise exception 'FAIL: the first run wrote warnings beyond the two for Sola 1';
  end if;

  -- Neither notice names a person: the keys are the session and nothing else.
  for r in select payload from public.notifications where type like 'solo_session_%' loop
    if exists (select 1 from jsonb_object_keys(r.payload) k
                where k not in ('activity_id', 'title', 'starts_at')) then
      raise exception 'FAIL: a warning payload carries more than the session: %', r.payload;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------ not twice

do $$ begin
  if public.warn_solo_sessions() <> 0 then
    raise exception 'FAIL: a second run warned again';
  end if;
end $$;

-- ------------------------------------------- the count is read every run
-- Beto leaves Dos, which leaves Ana alone on it.

select set_config('request.jwt.claim.sub', 'a2100000-0000-0000-0000-000000000003', true);
select public.leave_activity('c2100000-0000-0000-0000-000000000002');

do $$ begin
  if public.warn_solo_sessions() <> 1 then
    raise exception 'FAIL: Dos, down to one person, was not warned';
  end if;
  if not exists (select 1 from public.notifications
                  where user_id = 'a2100000-0000-0000-0000-000000000002'
                    and type = 'solo_session_participant'
                    and payload ->> 'activity_id' = 'c2100000-0000-0000-0000-000000000002') then
    raise exception 'FAIL: Ana was not told she is alone on Dos';
  end if;
  if exists (select 1 from public.notifications
              where user_id = 'a2100000-0000-0000-0000-000000000003'
                and type like 'solo_session_%') then
    raise exception 'FAIL: Beto, who left, was warned';
  end if;
end $$;

rollback;
