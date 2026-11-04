-- =====================================================================
-- 36_group_sports_test.sql — a group has up to three known sports, and
-- category_id is always the first of them.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. A group stores a sport that does not exist, or more than three.
--   2. category_id disagrees with the list, so the tile shows one sport
--      and the filters another.
--   3. An old client writing only category_id is overruled.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a3600000-0000-0000-0000-000000000001', 'club36@test.cr', '{"display_name":"Club"}');

insert into public.communities (id, slug, name, category_ids, created_by) values
  ('d3600000-0000-0000-0000-000000000001', 'club-36', 'Club 36',
   array['trail_running', 'running', 'trail_running'], 'a3600000-0000-0000-0000-000000000001');

do $$ begin
  if (select category_ids from public.communities where id = 'd3600000-0000-0000-0000-000000000001')
       <> array['trail_running', 'running'] then
    raise exception 'FAIL: repeats were kept or the order changed';
  end if;
  if (select category_id from public.communities where id = 'd3600000-0000-0000-0000-000000000001')
       <> 'trail_running' then
    raise exception 'FAIL: category_id is not the first sport';
  end if;
end $$;

-- An old client sets only category_id.
update public.communities set category_id = 'hiking'
 where id = 'd3600000-0000-0000-0000-000000000001';

do $$ begin
  if (select category_ids from public.communities where id = 'd3600000-0000-0000-0000-000000000001')
       <> array['hiking'] then
    raise exception 'FAIL: writing category_id alone was overruled';
  end if;
end $$;

-- An old client creates a group with category_id only.
insert into public.communities (id, slug, name, category_id, created_by) values
  ('d3600000-0000-0000-0000-000000000002', 'viejo-36', 'Viejo 36', 'football',
   'a3600000-0000-0000-0000-000000000001');

do $$ begin
  if (select category_ids from public.communities where id = 'd3600000-0000-0000-0000-000000000002')
       <> array['football'] then
    raise exception 'FAIL: a group created with category_id has no sports list';
  end if;
end $$;

do $$ begin
  begin
    update public.communities set category_ids = array['running', 'padel']
     where id = 'd3600000-0000-0000-0000-000000000001';
    raise exception 'FAIL: an unknown sport was stored';
  exception when foreign_key_violation then null;
  end;

  begin
    update public.communities set category_ids = array['running', 'hiking', 'yoga', 'surf']
     where id = 'd3600000-0000-0000-0000-000000000001';
    raise exception 'FAIL: four sports were stored';
  exception when check_violation then null;
  end;
end $$;

do $$ begin
  if has_function_privilege('authenticated', 'public.communities_sports()', 'execute')
     or has_function_privilege('anon', 'public.communities_sports()', 'execute') then
    raise exception 'FAIL: a client can call the trigger function';
  end if;
end $$;

rollback;
