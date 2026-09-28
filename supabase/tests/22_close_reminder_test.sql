-- =====================================================================
-- 22_close_reminder_test.sql — an organizer is reminded, once, to close a
-- session that ended; nothing else is reminded and nothing is closed.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. The job closes something, or marks somebody absent. It must only
--      write a notice.
--   2. A session that ended an hour ago and is still open is not reminded.
--   3. Something is reminded that should not be: not ended, ended minutes
--      ago, already closed, cancelled, a draft, older than 30 days.
--   4. The same session is reminded twice.
--   5. Somebody other than the organizer is told, or a client runs the job.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a2200000-0000-0000-0000-000000000001', 'olga22@test.cr', '{"display_name":"Olga"}'),
  ('a2200000-0000-0000-0000-000000000002', 'ana22@test.cr',  '{"display_name":"Ana"}');

insert into public.locations (id, name, geog, is_public_venue, is_verified, created_by) values
  ('b2200000-0000-0000-0000-000000000001', 'Cancha 22',
   extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
   true, true, 'a2200000-0000-0000-0000-000000000001');

-- R1 ended 3 h ago, published   -> reminded
-- R2 ended 3 h ago, full        -> reminded
-- N1 ends in 2 h                -> not (not over)
-- N2 ended 20 minutes ago       -> not (inside the hour)
-- N3 ended 3 h ago, completed   -> not (closed)
-- N4 ended 3 h ago, cancelled   -> not
-- N5 ended 3 h ago, draft       -> not
-- N6 ended 40 days ago          -> not (too old)
insert into public.activities
  (id, organizer_id, category_id, location_id, title, starts_at, ends_at, status, visibility)
select v.id::uuid, 'a2200000-0000-0000-0000-000000000001', 'running',
       'b2200000-0000-0000-0000-000000000001', v.title,
       now() + v.ends_in - interval '1 hour', now() + v.ends_in, v.status::public.activity_status, 'public'
  from (values
    ('c2200000-0000-0000-0000-000000000001', 'Sesión R1', interval '-3 hours',   'published'),
    ('c2200000-0000-0000-0000-000000000002', 'Sesión R2', interval '-3 hours',   'full'),
    ('c2200000-0000-0000-0000-000000000011', 'Sesión N1', interval '2 hours',    'published'),
    ('c2200000-0000-0000-0000-000000000012', 'Sesión N2', interval '-20 minutes','published'),
    ('c2200000-0000-0000-0000-000000000013', 'Sesión N3', interval '-3 hours',   'completed'),
    ('c2200000-0000-0000-0000-000000000014', 'Sesión N4', interval '-3 hours',   'cancelled'),
    ('c2200000-0000-0000-0000-000000000015', 'Sesión N5', interval '-3 hours',   'draft'),
    ('c2200000-0000-0000-0000-000000000016', 'Sesión N6', interval '-40 days',   'published')
  ) as v(id, title, ends_in, status);

-- Ana is on R1, not checked in. The job must leave her exactly as she is.
insert into public.activity_participants (activity_id, user_id, status)
values ('c2200000-0000-0000-0000-000000000001', 'a2200000-0000-0000-0000-000000000002', 'joined');

-- ------------------------------------------------------------- grants

do $$ begin
  if has_function_privilege('authenticated', 'public.remind_unclosed_sessions()', 'execute')
     or has_function_privilege('anon', 'public.remind_unclosed_sessions()', 'execute') then
    raise exception 'FAIL: a client can run remind_unclosed_sessions()';
  end if;
  if has_column_privilege('authenticated', 'public.activities', 'close_reminded_at', 'update') then
    raise exception 'FAIL: a client can set close_reminded_at';
  end if;
end $$;

-- ------------------------------------------------------------ first run

do $$
declare v_n integer;
begin
  v_n := public.remind_unclosed_sessions();
  if v_n <> 2 then
    raise exception 'FAIL: reminded % sessions, expected 2 (R1, R2)', v_n;
  end if;

  if (select count(*) from public.notifications
       where user_id = 'a2200000-0000-0000-0000-000000000001'
         and type = 'close_reminder') <> 2 then
    raise exception 'FAIL: the organizer did not get exactly two reminders';
  end if;

  if exists (select 1 from public.notifications
              where type = 'close_reminder'
                and payload ->> 'activity_id' not in
                    ('c2200000-0000-0000-0000-000000000001', 'c2200000-0000-0000-0000-000000000002')) then
    raise exception 'FAIL: a session other than R1 and R2 was reminded';
  end if;

  if exists (select 1 from public.notifications
              where user_id = 'a2200000-0000-0000-0000-000000000002') then
    raise exception 'FAIL: a participant was told about the organizer''s reminder';
  end if;

  -- Reminding is all it does.
  if (select status from public.activities where id = 'c2200000-0000-0000-0000-000000000001') <> 'published' then
    raise exception 'FAIL: the job changed the status of R1';
  end if;
  if (select status from public.activity_participants
       where activity_id = 'c2200000-0000-0000-0000-000000000001'
         and user_id = 'a2200000-0000-0000-0000-000000000002') <> 'joined' then
    raise exception 'FAIL: the job marked Ana — only the organizer decides who came';
  end if;
end $$;

-- ------------------------------------------------------------ not twice

do $$ begin
  if public.remind_unclosed_sessions() <> 0 then
    raise exception 'FAIL: a second run reminded again';
  end if;
end $$;

-- ------------------------------------------ the hour passes for N2

update public.activities
   set starts_at = starts_at - interval '1 hour', ends_at = ends_at - interval '1 hour'
 where id = 'c2200000-0000-0000-0000-000000000012';

do $$ begin
  if public.remind_unclosed_sessions() <> 1 then
    raise exception 'FAIL: N2 was not reminded once its hour had passed';
  end if;
end $$;

rollback;
