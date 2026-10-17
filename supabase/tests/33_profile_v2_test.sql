-- =====================================================================
-- 33_profile_v2_test.sql — your zone is readable by nobody but you, and
-- your sports by whoever can already see your profile.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. A client can still read somebody's home_district — the promise on
--      the public profile («No aparece: tu zona») would be false.
--   2. A zone that is not a distrito, or not a zone at all, is stored.
--   3. Sports are readable by people who cannot see the profile.
--   4. set_my_interests() accepts junk, or writes for somebody else.
--   5. my_profile() leaks to anon or answers about another person.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

-- Ana and Beto share a group; Caro shares nothing with either.
insert into auth.users (id, email, raw_user_meta_data) values
  ('a3300000-0000-0000-0000-000000000001', 'ana33@test.cr',  '{"display_name":"Ana"}'),
  ('a3300000-0000-0000-0000-000000000002', 'beto33@test.cr', '{"display_name":"Beto"}'),
  ('a3300000-0000-0000-0000-000000000003', 'caro33@test.cr', '{"display_name":"Caro"}');

insert into public.communities (id, slug, name, created_by) values
  ('d3300000-0000-0000-0000-000000000001', 'grupo-33', 'Grupo 33', 'a3300000-0000-0000-0000-000000000002');
insert into public.community_members (community_id, user_id) values
  ('d3300000-0000-0000-0000-000000000001', 'a3300000-0000-0000-0000-000000000001');

-- A real distrito from the seeded zones, whatever its code is.
select set_config('test.distrito',
  (select code from public.zones where kind = 'distrito' order by code limit 1), true);

-- ------------------------------------------------------------- grants

do $$ begin
  if has_column_privilege('authenticated', 'public.profiles', 'home_district', 'select')
     or has_column_privilege('anon', 'public.profiles', 'home_district', 'select') then
    raise exception 'FAIL: a client can still select home_district';
  end if;
  if not has_column_privilege('anon', 'public.profiles', 'display_name', 'select') then
    raise exception 'FAIL: closing home_district closed the rest of the profile too';
  end if;
  if has_function_privilege('anon', 'public.my_profile()', 'execute')
     or has_function_privilege('anon', 'public.set_my_interests(text[])', 'execute') then
    raise exception 'FAIL: anon can call the profile functions';
  end if;
end $$;

-- ---------------------------------------------------- Ana sets her zone

select set_config('request.jwt.claim.sub', 'a3300000-0000-0000-0000-000000000001', true);
set local role authenticated;

update public.profiles
   set home_district = current_setting('test.distrito'), bio = 'Corro de madrugada.'
 where id = 'a3300000-0000-0000-0000-000000000001';

select public.set_my_interests(array['running', 'hiking', 'running', ' ']);

do $$
declare
  v jsonb := public.my_profile();
  v_state text;
begin
  if v ->> 'home_district' is distinct from current_setting('test.distrito')
     or v ->> 'district_name' is null or v ->> 'canton_name' is null then
    raise exception 'FAIL: my_profile() does not return the zone with its names: %', v;
  end if;
  if v -> 'interests' <> '["hiking", "running"]'::jsonb then
    raise exception 'FAIL: interests are not the deduplicated set: %', v -> 'interests';
  end if;
  if v ->> 'bio' <> 'Corro de madrugada.' then
    raise exception 'FAIL: my_profile() does not return the bio';
  end if;

  -- Not a distrito code, and a code that is not a zone.
  begin
    update public.profiles set home_district = 'San José'
     where id = 'a3300000-0000-0000-0000-000000000001';
    raise exception 'FAIL: a typed place name was stored as the zone';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state = 'P0001' then raise; end if;
    if v_state <> '23514' then raise exception 'FAIL: a typed name refused with %', v_state; end if;
  end;
  begin
    update public.profiles set home_district = '99999'
     where id = 'a3300000-0000-0000-0000-000000000001';
    raise exception 'FAIL: a code that is no zone was stored';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state = 'P0001' then raise; end if;
    if v_state <> '23503' then raise exception 'FAIL: an unknown code refused with %', v_state; end if;
  end;

  -- Reading the column directly is refused, even your own.
  begin
    perform home_district from public.profiles where id = 'a3300000-0000-0000-0000-000000000001';
    raise exception 'FAIL: home_district can be selected by its owner through the API';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state = 'P0001' then raise; end if;
    if v_state <> '42501' then raise exception 'FAIL: selecting the zone refused with %', v_state; end if;
  end;

  -- set_my_interests() refusals.
  begin
    perform public.set_my_interests(array['running', 'ajedrez-acuatico']);
    raise exception 'FAIL: an unknown sport was accepted';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state = 'P0001' then raise; end if;
    if v_state <> '22023' then raise exception 'FAIL: an unknown sport refused with %', v_state; end if;
  end;
end $$;

-- Replacing the set removes what is no longer chosen.
select public.set_my_interests(array['running']);

reset role;

do $$ begin
  if (select array_agg(category_id) from public.user_interests
       where user_id = 'a3300000-0000-0000-0000-000000000001') <> array['running'] then
    raise exception 'FAIL: set_my_interests() did not replace the set';
  end if;
end $$;

-- ------------------------------------------------------- who reads it

select set_config('request.jwt.claim.sub', 'a3300000-0000-0000-0000-000000000002', true);
set local role authenticated;
do $$ begin
  if not exists (select 1 from public.user_interests
                  where user_id = 'a3300000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: Beto shares a group with Ana and cannot see her sports';
  end if;
  if (public.my_profile() ->> 'id') <> 'a3300000-0000-0000-0000-000000000002' then
    raise exception 'FAIL: my_profile() answered about somebody else';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'a3300000-0000-0000-0000-000000000003', true);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.user_interests
              where user_id = 'a3300000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: Caro shares nothing with Ana and can see her sports';
  end if;
end $$;
reset role;

rollback;
