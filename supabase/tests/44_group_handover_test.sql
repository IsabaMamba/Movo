-- =====================================================================
-- 44_group_handover_test.sql — handing a group over and deleting it.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. Somebody other than the owner hands the group over or deletes it.
--   2. Deleting cancels public sessions, or leaves group-only ones on
--      without a notice to whoever was going.
--   3. An offer changes anything before it is accepted, or after it lapsed.
--   4. Clients can read or write community_handovers directly.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a4400000-0000-0000-0000-000000000001', 'ana44@test.cr',  '{"display_name":"Ana"}'),
  ('a4400000-0000-0000-0000-000000000002', 'luis44@test.cr', '{"display_name":"Luis"}'),
  ('a4400000-0000-0000-0000-000000000003', 'caro44@test.cr', '{"display_name":"Caro"}');

insert into public.communities (id, slug, name, created_by) values
  ('d4400000-0000-0000-0000-000000000001', 'club-44', 'Club 44', 'a4400000-0000-0000-0000-000000000001');
-- handle_new_community (0007) made Ana the owner.
insert into public.community_members (community_id, user_id, role) values
  ('d4400000-0000-0000-0000-000000000001', 'a4400000-0000-0000-0000-000000000002', 'organizer'),
  ('d4400000-0000-0000-0000-000000000001', 'a4400000-0000-0000-0000-000000000003', 'member');

do $$ begin
  if has_table_privilege('authenticated', 'public.community_handovers', 'select')
     or has_table_privilege('authenticated', 'public.community_handovers', 'insert')
     or has_function_privilege('anon', 'public.delete_community(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.hand_over_community(uuid, uuid)', 'execute') then
    raise exception 'FAIL: clients reach the hand-over table, or anon the functions';
  end if;
end $$;

-- --------------------------------------------------------- hand over

-- Luis organizes but does not own: he cannot offer the group.
select set_config('request.jwt.claim.sub', 'a4400000-0000-0000-0000-000000000002', true);
set local role authenticated;
do $$ begin
  begin
    perform public.hand_over_community('d4400000-0000-0000-0000-000000000001',
                                       'a4400000-0000-0000-0000-000000000003');
    raise exception 'FAIL: an organizer who is not the owner offered the group';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Ana offers it to Luis. Nothing changes yet.
select set_config('request.jwt.claim.sub', 'a4400000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.hand_over_community('d4400000-0000-0000-0000-000000000001',
                                  'a4400000-0000-0000-0000-000000000002');
do $$ begin
  if (public.community_handover('d4400000-0000-0000-0000-000000000001') ->> 'to_name') <> 'Luis' then
    raise exception 'FAIL: the owner does not see the pending offer';
  end if;
end $$;
reset role;

do $$ begin
  if public.community_owner('d4400000-0000-0000-0000-000000000001')
       <> 'a4400000-0000-0000-0000-000000000001' then
    raise exception 'FAIL: the owner changed before the offer was accepted';
  end if;
  if not exists (select 1 from public.notifications
                  where user_id = 'a4400000-0000-0000-0000-000000000002'
                    and type = 'group_handover_offered') then
    raise exception 'FAIL: the person offered the group was not told';
  end if;
end $$;

-- Caro cannot answer an offer that is not hers.
select set_config('request.jwt.claim.sub', 'a4400000-0000-0000-0000-000000000003', true);
set local role authenticated;
do $$ begin
  begin
    perform public.answer_community_handover('d4400000-0000-0000-0000-000000000001', true);
    raise exception 'FAIL: somebody else accepted the offer';
  exception when sqlstate '22023' then null;
  end;
  if public.community_handover('d4400000-0000-0000-0000-000000000001') is not null then
    raise exception 'FAIL: a third member can see the offer';
  end if;
end $$;
reset role;

-- Luis accepts: he owns it, Ana stays as a member, Ana is told.
select set_config('request.jwt.claim.sub', 'a4400000-0000-0000-0000-000000000002', true);
set local role authenticated;
select public.answer_community_handover('d4400000-0000-0000-0000-000000000001', true);
reset role;

do $$ begin
  if public.community_owner('d4400000-0000-0000-0000-000000000001')
       <> 'a4400000-0000-0000-0000-000000000002' then
    raise exception 'FAIL: accepting did not make Luis the owner';
  end if;
  if (select role::text from public.community_members
       where community_id = 'd4400000-0000-0000-0000-000000000001'
         and user_id = 'a4400000-0000-0000-0000-000000000001') <> 'member' then
    raise exception 'FAIL: whoever handed the group over did not stay as a member';
  end if;
  if exists (select 1 from public.community_handovers
              where community_id = 'd4400000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: the offer outlived its answer';
  end if;
  if not exists (select 1 from public.notifications
                  where user_id = 'a4400000-0000-0000-0000-000000000001'
                    and type = 'group_handover_accepted') then
    raise exception 'FAIL: Ana was not told her offer was accepted';
  end if;
end $$;

-- A lapsed offer cannot be accepted.
insert into public.community_handovers (community_id, from_user, to_user, expires_at)
values ('d4400000-0000-0000-0000-000000000001', 'a4400000-0000-0000-0000-000000000002',
        'a4400000-0000-0000-0000-000000000003', now() - interval '1 minute');
select set_config('request.jwt.claim.sub', 'a4400000-0000-0000-0000-000000000003', true);
set local role authenticated;
do $$ begin
  begin
    perform public.answer_community_handover('d4400000-0000-0000-0000-000000000001', true);
    raise exception 'FAIL: a lapsed offer was accepted';
  exception when sqlstate '22023' then null;
  end;
end $$;
reset role;
delete from public.community_handovers where community_id = 'd4400000-0000-0000-0000-000000000001';

-- ------------------------------------------------------------ delete

insert into public.locations (id, name, geog, is_public_venue, is_verified, created_by) values
  ('b4400000-0000-0000-0000-000000000001', 'Parque 44',
   extensions.st_setsrid(extensions.st_makepoint(-84.07, 9.95), 4326)::extensions.geography,
   true, true, 'a4400000-0000-0000-0000-000000000002');

insert into public.activities
  (id, organizer_id, category_id, location_id, community_id, title, starts_at, ends_at, status, visibility)
values
  ('c4400000-0000-0000-0000-000000000001', 'a4400000-0000-0000-0000-000000000002', 'running',
   'b4400000-0000-0000-0000-000000000001', 'd4400000-0000-0000-0000-000000000001', 'Solo grupo 44',
   now() + interval '2 days', now() + interval '2 days 1 hour', 'published', 'community'),
  ('c4400000-0000-0000-0000-000000000002', 'a4400000-0000-0000-0000-000000000002', 'running',
   'b4400000-0000-0000-0000-000000000001', 'd4400000-0000-0000-0000-000000000001', 'Pública 44',
   now() + interval '3 days', now() + interval '3 days 1 hour', 'published', 'public');

insert into public.activity_participants (activity_id, user_id, status) values
  ('c4400000-0000-0000-0000-000000000001', 'a4400000-0000-0000-0000-000000000003', 'joined');

-- Ana is no longer the owner: she cannot delete it.
select set_config('request.jwt.claim.sub', 'a4400000-0000-0000-0000-000000000001', true);
set local role authenticated;
do $$ begin
  begin
    perform public.delete_community('d4400000-0000-0000-0000-000000000001', 'Club 44');
    raise exception 'FAIL: a member deleted the group';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'a4400000-0000-0000-0000-000000000002', true);
set local role authenticated;
do $$ begin
  begin
    perform public.delete_community('d4400000-0000-0000-0000-000000000001', 'Club');
    raise exception 'FAIL: the group was deleted without its exact name';
  exception when sqlstate '22023' then null;
  end;
end $$;
select public.delete_community('d4400000-0000-0000-0000-000000000001', ' club 44 ');
reset role;

do $$ begin
  if exists (select 1 from public.communities where id = 'd4400000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: the group is still there';
  end if;
  if (select status::text from public.activities where id = 'c4400000-0000-0000-0000-000000000001')
       <> 'cancelled' then
    raise exception 'FAIL: the group-only session was not cancelled';
  end if;
  if (select status::text from public.activities where id = 'c4400000-0000-0000-0000-000000000002')
       <> 'published' then
    raise exception 'FAIL: a public session was cancelled with the group';
  end if;
  if not exists (select 1 from public.notifications
                  where user_id = 'a4400000-0000-0000-0000-000000000003'
                    and type = 'activity_cancelled' and payload ->> 'by' = 'group_deleted') then
    raise exception 'FAIL: whoever was going was not told the session was cancelled';
  end if;
  if not exists (select 1 from public.notifications
                  where user_id = 'a4400000-0000-0000-0000-000000000001' and type = 'group_deleted') then
    raise exception 'FAIL: a member was not told the group is gone';
  end if;
end $$;

rollback;
