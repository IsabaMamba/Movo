-- =====================================================================
-- 37_sport_levels_test.sql — a level per sport, written only by its owner.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. set_my_sports() writes for somebody else, or anon can call it.
--   2. It stores a level that is not one of the three, or «any».
--   3. It keeps a sport the person removed, or loses the level on save.
--   4. my_profile() does not return the levels.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a3700000-0000-0000-0000-000000000001', 'nivel37@test.cr', '{"display_name":"Nivel"}');

do $$ begin
  if has_function_privilege('anon', 'public.set_my_sports(jsonb)', 'execute') then
    raise exception 'FAIL: anon can set sports';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'a3700000-0000-0000-0000-000000000001', true);
set local role authenticated;

select public.set_my_sports(
  '[{"category": "running", "level": "intermediate"},
    {"category": "yoga"},
    {"category": "running", "level": "advanced"},
    {"category": " "}]'
);

do $$
declare
  v jsonb := public.my_profile() -> 'sports';
begin
  if v <> '[{"category": "running", "level": "intermediate"}, {"category": "yoga", "level": "beginner"}]'::jsonb then
    raise exception 'FAIL: my_profile() sports were %', v;
  end if;
end $$;

-- Changing a level and removing a sport.
select public.set_my_sports('[{"category": "yoga", "level": "advanced"}]');

do $$ begin
  if (select array_agg(category_id || ':' || skill) from public.user_interests
       where user_id = 'a3700000-0000-0000-0000-000000000001') <> array['yoga:advanced'] then
    raise exception 'FAIL: the removed sport stayed or the level did not change';
  end if;
end $$;

-- set_my_interests() keeps the level of a sport that stays.
select public.set_my_interests(array['yoga', 'surf']);

do $$ begin
  if (select skill::text from public.user_interests
       where user_id = 'a3700000-0000-0000-0000-000000000001' and category_id = 'yoga') <> 'advanced' then
    raise exception 'FAIL: set_my_interests() reset a level';
  end if;
end $$;

do $$ begin
  begin
    perform public.set_my_sports('[{"category": "running", "level": "any"}]');
    raise exception 'FAIL: «any» was stored as a person''s level';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.set_my_sports('[{"category": "running", "level": "pro"}]');
    raise exception 'FAIL: an unknown level was stored';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.set_my_sports('[{"category": "ajedrez", "level": "beginner"}]');
    raise exception 'FAIL: an unknown sport was stored';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.set_my_sports('{"category": "running"}');
    raise exception 'FAIL: an object instead of a list was accepted';
  exception when sqlstate '22023' then null;
  end;
end $$;

reset role;

rollback;
