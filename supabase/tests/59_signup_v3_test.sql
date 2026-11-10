-- =====================================================================
-- 59_signup_v3_test.sql — the account first, then the four steps.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. Somebody under 18 keeps an account, or any trace of their date of
--      birth.
--   2. A point (where somebody is) is stored anywhere, or a client writes
--      the steps' columns directly.
--   3. The steps are marked done without a date of birth or a gender.
--   4. A date of birth is changed after it was given.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

-- As Apple or Google leave it: no date of birth, no gender, no rules.
insert into auth.users (id, email, raw_user_meta_data) values
  ('a5900000-0000-0000-0000-000000000001', 'ana59@test.cr',  '{}'),
  ('a5900000-0000-0000-0000-000000000002', 'nina59@test.cr', '{}');

insert into public.zones (code, kind, name, parent_code, centroid, area_km2, boundary, source)
values
  ('9', 'provincia', 'Pruebalandia 59', null,
   extensions.st_setsrid(extensions.st_makepoint(-87.05, 10.05), 4326)::extensions.geography, 242.0,
   extensions.st_multi(extensions.st_makeenvelope(-87.10, 10.00, -87.00, 10.10, 4326))::extensions.geography,
   'test'),
  ('901', 'canton', 'Tibás 59', '9',
   extensions.st_setsrid(extensions.st_makepoint(-87.075, 10.05), 4326)::extensions.geography, 121.0,
   extensions.st_multi(extensions.st_makeenvelope(-87.10, 10.00, -87.05, 10.10, 4326))::extensions.geography,
   'test'),
  ('90101', 'distrito', 'San Juan 59', '901',
   extensions.st_setsrid(extensions.st_makepoint(-87.075, 10.05), 4326)::extensions.geography, 121.0,
   extensions.st_multi(extensions.st_makeenvelope(-87.10, 10.00, -87.05, 10.10, 4326))::extensions.geography,
   'test');

do $$ begin
  if has_function_privilege('anon', 'public.set_about_me(text, date)', 'execute')
     or has_function_privilege('anon', 'public.set_my_district_from_point(double precision, double precision)', 'execute')
     or has_function_privilege('anon', 'public.finish_signup()', 'execute')
     or has_function_privilege('anon', 'public.my_signup()', 'execute') then
    raise exception 'FAIL: anon can run a sign-up step';
  end if;
  if has_column_privilege('authenticated', 'public.profile_private', 'signup_completed_at', 'update')
     or has_column_privilege('authenticated', 'public.profile_private', 'search_radius_km', 'update') then
    raise exception 'FAIL: a client writes the steps'' columns directly';
  end if;
  if has_function_privilege('authenticated', 'public.district_json(text)', 'execute') then
    raise exception 'FAIL: a client can call the inner zone reader';
  end if;
end $$;

-- ----------------------------------------------------------------- Ana

select set_config('request.jwt.claim.sub', 'a5900000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$
declare
  v jsonb := public.my_signup();
begin
  if (v ->> 'completed')::boolean or (v ->> 'has_birthdate')::boolean then
    raise exception 'FAIL: a new account starts done: %', v;
  end if;
  begin
    perform public.finish_signup();
    raise exception 'FAIL: the steps were finished with nothing in them';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.set_about_me('A', date '1997-03-14');
    raise exception 'FAIL: a one-letter name was taken';
  exception when sqlstate '22023' then null;
  end;
  if public.set_about_me('Andrea Molina', date '1997-03-14') <> 'ok' then
    raise exception 'FAIL: an adult was not let through';
  end if;
  -- The same date again is fine (going back a step); another is not.
  perform public.set_about_me('Andrea M.', date '1997-03-14');
  begin
    perform public.set_about_me('Andrea M.', date '1990-01-01');
    raise exception 'FAIL: the date of birth changed';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.finish_signup();
    raise exception 'FAIL: the steps were finished without a gender';
  exception when sqlstate '22023' then null;
  end;
end $$;

select public.set_my_gender('mujer');

do $$
declare
  v jsonb;
begin
  -- A point outside the loaded division keeps nothing.
  if public.set_my_district_from_point(48.85, 2.35) is not null then
    raise exception 'FAIL: a point in Paris became a zone';
  end if;
  v := public.set_my_district_from_point(10.0512345, -87.0712345);
  if v ->> 'code' <> '90101' or v ->> 'canton' <> 'Tibás 59' then
    raise exception 'FAIL: the point did not become San Juan, Tibás: %', v;
  end if;
  begin
    perform public.set_my_district('901');
    raise exception 'FAIL: a cantón was taken as a distrito';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.set_my_search_radius(30);
    raise exception 'FAIL: 30 km was taken';
  exception when sqlstate '22023' then null;
  end;
  perform public.set_my_search_radius(25);
  perform public.finish_signup();

  v := public.my_signup();
  if not (v ->> 'completed')::boolean or v ->> 'home_district' <> '90101'
     or (v ->> 'radius_km')::int <> 25 or v ->> 'display_name' <> 'Andrea M.' then
    raise exception 'FAIL: after the steps the status is %', v;
  end if;
end $$;

reset role;

-- No coordinates anywhere in her rows.
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name in ('profiles', 'profile_private')
                and data_type in ('USER-DEFINED', 'double precision', 'numeric')
                and udt_name in ('geography', 'geometry', 'float8')) then
    raise exception 'FAIL: a profile table has a column that could hold a point';
  end if;
end $$;

-- ---------------------------------------------------------------- Nina

select set_config('request.jwt.claim.sub', 'a5900000-0000-0000-0000-000000000002', true);
set local role authenticated;

do $$ begin
  if public.set_about_me('Nina', ((now() at time zone 'America/Costa_Rica')::date - interval '16 years')::date)
     <> 'under_age' then
    raise exception 'FAIL: a 16-year-old was let through';
  end if;
end $$;

reset role;

do $$ begin
  if exists (select 1 from auth.users where id = 'a5900000-0000-0000-0000-000000000002')
     or exists (select 1 from public.profiles where id = 'a5900000-0000-0000-0000-000000000002')
     or exists (select 1 from public.profile_private where id = 'a5900000-0000-0000-0000-000000000002') then
    raise exception 'FAIL: something of the under-18 account stayed';
  end if;
end $$;

rollback;
