-- =====================================================================
-- 42_return_venue_test.sql — the team hands a venue back, its creator is
-- told and corrects it, and nobody plans a new session there meanwhile.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. Somebody who is not staff returns a venue, or a client writes the
--      returned_* columns.
--   2. A new session or series is created at a returned venue, or an
--      existing one moved there.
--   3. The creator is not told what to correct, or their correction does
--      not clear the mark.
--   4. Sessions already planned there are disturbed.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a4200000-0000-0000-0000-000000000001', 'olga42@test.cr',   '{"display_name":"Olga"}'),
  ('a4200000-0000-0000-0000-000000000002', 'equipo42@test.cr', '{"display_name":"Equipo"}');

insert into public.staff (user_id, note) values ('a4200000-0000-0000-0000-000000000002', 'test 42');

insert into public.locations (id, name, geog, is_public_venue, is_verified, created_by) values
  ('b4200000-0000-0000-0000-000000000001', 'Cancha 42',
   extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
   true, true, 'a4200000-0000-0000-0000-000000000001'),
  ('b4200000-0000-0000-0000-000000000002', 'Otra cancha 42',
   extensions.st_setsrid(extensions.st_makepoint(-84.1000, 9.9300), 4326)::extensions.geography,
   true, true, 'a4200000-0000-0000-0000-000000000001');

insert into public.activities
  (id, organizer_id, category_id, location_id, title, starts_at, ends_at, status, visibility)
values
  ('c4200000-0000-0000-0000-000000000001', 'a4200000-0000-0000-0000-000000000001', 'football',
   'b4200000-0000-0000-0000-000000000001', 'Ya planeada 42',
   now() + interval '2 days', now() + interval '2 days 1 hour', 'published', 'public'),
  ('c4200000-0000-0000-0000-000000000002', 'a4200000-0000-0000-0000-000000000001', 'football',
   'b4200000-0000-0000-0000-000000000002', 'En la otra 42',
   now() + interval '3 days', now() + interval '3 days 1 hour', 'published', 'public');

-- ---------------------------------------------------------------- refusals

select set_config('request.jwt.claim.sub', 'a4200000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$ begin
  if has_function_privilege('anon', 'public.return_location(uuid, text)', 'execute') then
    raise exception 'FAIL: anon can return a venue';
  end if;
  begin
    perform public.return_location('b4200000-0000-0000-0000-000000000001', 'Muévelo');
    raise exception 'FAIL: a non-staff account returned a venue';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.locations set returned_at = null where id = 'b4200000-0000-0000-0000-000000000001';
    raise exception 'FAIL: a client wrote returned_at';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ------------------------------------------------------ the team returns it

reset role;
select set_config('request.jwt.claim.sub', 'a4200000-0000-0000-0000-000000000002', true);
set local role authenticated;

do $$ begin
  begin
    perform public.return_location('b4200000-0000-0000-0000-000000000001', '  ');
    raise exception 'FAIL: a venue was returned without a note';
  exception when sqlstate '22023' then null;
  end;
end $$;

select public.return_location('b4200000-0000-0000-0000-000000000001',
                              'El punto está al otro lado del parque. Muévelo a la entrada norte.');

reset role;

do $$ begin
  if (select is_verified from public.locations where id = 'b4200000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: a returned venue stayed verified';
  end if;
  if (select payload ->> 'note' from public.notifications
       where user_id = 'a4200000-0000-0000-0000-000000000001' and type = 'venue_returned')
     <> 'El punto está al otro lado del parque. Muévelo a la entrada norte.' then
    raise exception 'FAIL: the creator was not told what to correct';
  end if;
  if (select status from public.activities where id = 'c4200000-0000-0000-0000-000000000001') <> 'published' then
    raise exception 'FAIL: a session already planned there was disturbed';
  end if;
end $$;

-- --------------------------------------------- nothing new there meanwhile

select set_config('request.jwt.claim.sub', 'a4200000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$ begin
  begin
    insert into public.activities
      (organizer_id, category_id, location_id, title, starts_at, ends_at, status, visibility)
    values ('a4200000-0000-0000-0000-000000000001', 'football', 'b4200000-0000-0000-0000-000000000001',
            'Nueva 42', now() + interval '4 days', now() + interval '4 days 1 hour', 'published', 'public');
    raise exception 'FAIL: a new session was created at a returned venue';
  exception when sqlstate '22023' then null;
  end;
  begin
    insert into public.activity_series
      (organizer_id, category_id, location_id, title, weekday, local_start_time, duration_minutes)
    values ('a4200000-0000-0000-0000-000000000001', 'football', 'b4200000-0000-0000-0000-000000000001',
            'Serie 42', 3, '18:00', 60);
    raise exception 'FAIL: a series was created at a returned venue';
  exception when sqlstate '22023' then null;
  end;
end $$;

reset role;

do $$ begin
  begin
    update public.activities set location_id = 'b4200000-0000-0000-0000-000000000001'
     where id = 'c4200000-0000-0000-0000-000000000002';
    raise exception 'FAIL: a session was moved to a returned venue';
  exception when sqlstate '22023' then null;
  end;
end $$;

-- --------------------------------------------- the creator corrects it

select set_config('request.jwt.claim.sub', 'a4200000-0000-0000-0000-000000000001', true);
set local role authenticated;

update public.locations
   set geog = extensions.st_setsrid(extensions.st_makepoint(-84.1040, 9.9360), 4326)::extensions.geography
 where id = 'b4200000-0000-0000-0000-000000000001';

reset role;

do $$ begin
  if (select returned_at from public.locations where id = 'b4200000-0000-0000-0000-000000000001') is not null then
    raise exception 'FAIL: correcting the venue did not clear the mark';
  end if;
  insert into public.activities
    (organizer_id, category_id, location_id, title, starts_at, ends_at, status, visibility)
  values ('a4200000-0000-0000-0000-000000000001', 'football', 'b4200000-0000-0000-0000-000000000001',
          'Después 42', now() + interval '5 days', now() + interval '5 days 1 hour', 'published', 'public');
end $$;

-- Verifying clears it too.
select set_config('request.jwt.claim.sub', 'a4200000-0000-0000-0000-000000000002', true);
set local role authenticated;
select public.return_location('b4200000-0000-0000-0000-000000000002', 'Falta el nombre completo.');
select public.verify_location('b4200000-0000-0000-0000-000000000002', 'Revisado de nuevo, está bien.');
reset role;

do $$ begin
  if (select returned_at from public.locations where id = 'b4200000-0000-0000-0000-000000000002') is not null then
    raise exception 'FAIL: verifying the venue did not clear the mark';
  end if;
end $$;

rollback;
