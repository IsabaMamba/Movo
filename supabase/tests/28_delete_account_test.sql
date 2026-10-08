-- =====================================================================
-- 28_delete_account_test.sql — a person can export their data and delete
-- their account, and what is shared with other people survives it.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. The account is not actually gone: the auth row or the profile stays.
--   2. Deleting takes other people's things with it — a message in their
--      chat, a report about somebody, a venue, a group they belong to.
--   3. Somebody's plans break silently: a session they joined disappears
--      with no notice, a waitlist is not promoted, a group has no owner.
--   4. A suspended person deletes the account to clear the suspension.
--   5. The export leaks somebody else's data, or a client calls these as anon.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

-- ---------------------------------------------------------------- setup
--
-- Dora deletes her account. She organizes «Dora mañana» (Ana joined), is
-- joined to Beto's one-place session with Ana waiting behind her, owns two
-- groups — one with Beto (member) and Caro (organizer), one with nobody else
-- — wrote a message, filed a report about Beto and was reported by him.
-- Eva is suspended. Fede is staff.

insert into auth.users (id, email, raw_user_meta_data) values
  ('a2800000-0000-0000-0000-000000000001', 'dora28@test.cr', '{"display_name":"Dora"}'),
  ('a2800000-0000-0000-0000-000000000002', 'ana28@test.cr',  '{"display_name":"Ana"}'),
  ('a2800000-0000-0000-0000-000000000003', 'beto28@test.cr', '{"display_name":"Beto"}'),
  ('a2800000-0000-0000-0000-000000000004', 'caro28@test.cr', '{"display_name":"Caro"}'),
  ('a2800000-0000-0000-0000-000000000005', 'eva28@test.cr',  '{"display_name":"Eva"}'),
  ('a2800000-0000-0000-0000-000000000006', 'fede28@test.cr', '{"display_name":"Fede"}');

insert into public.locations (id, name, geog, is_public_venue, is_verified, created_by) values
  ('b2800000-0000-0000-0000-000000000001', 'Cancha 28',
   extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
   true, true, 'a2800000-0000-0000-0000-000000000001');

insert into public.activities
  (id, organizer_id, category_id, location_id, title, starts_at, ends_at, status, visibility,
   max_participants)
values
  ('c2800000-0000-0000-0000-000000000001', 'a2800000-0000-0000-0000-000000000001', 'running',
   'b2800000-0000-0000-0000-000000000001', 'Dora mañana',
   now() + interval '2 days', now() + interval '2 days 1 hour', 'published', 'public', null),
  ('c2800000-0000-0000-0000-000000000002', 'a2800000-0000-0000-0000-000000000003', 'running',
   'b2800000-0000-0000-0000-000000000001', 'Un cupo',
   now() + interval '3 days', now() + interval '3 days 1 hour', 'published', 'public', 1);

select set_config('request.jwt.claim.sub', 'a2800000-0000-0000-0000-000000000002', true);
select public.join_activity('c2800000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub', 'a2800000-0000-0000-0000-000000000001', true);
select public.join_activity('c2800000-0000-0000-0000-000000000002');
select set_config('request.jwt.claim.sub', 'a2800000-0000-0000-0000-000000000002', true);
select public.join_activity('c2800000-0000-0000-0000-000000000002');

-- 0007 seeds the creator as owner.
insert into public.communities (id, slug, name, created_by) values
  ('d2800000-0000-0000-0000-000000000001', 'grupo-28',  'Grupo 28',  'a2800000-0000-0000-0000-000000000001'),
  ('d2800000-0000-0000-0000-000000000002', 'solo-28',   'Solo 28',   'a2800000-0000-0000-0000-000000000001');

-- Beto joined first; Caro is an organizer. Caro inherits, not Beto.
insert into public.community_members (community_id, user_id, role, joined_at) values
  ('d2800000-0000-0000-0000-000000000001', 'a2800000-0000-0000-0000-000000000003', 'member',
   now() - interval '10 days'),
  ('d2800000-0000-0000-0000-000000000001', 'a2800000-0000-0000-0000-000000000004', 'organizer',
   now() - interval '1 day');

insert into public.messages (id, community_id, author_id, body) values
  ('e2800000-0000-0000-0000-000000000001', 'd2800000-0000-0000-0000-000000000001',
   'a2800000-0000-0000-0000-000000000001', 'Nos vemos el sábado');

insert into public.reports (id, reporter_id, subject_type, subject_id, reason) values
  ('f2800000-0000-0000-0000-000000000001', 'a2800000-0000-0000-0000-000000000001',
   'user', 'a2800000-0000-0000-0000-000000000003', 'harassment'),
  ('f2800000-0000-0000-0000-000000000002', 'a2800000-0000-0000-0000-000000000003',
   'user', 'a2800000-0000-0000-0000-000000000001', 'harassment');

insert into public.suspensions (user_id, note) values
  ('a2800000-0000-0000-0000-000000000005', 'Test fixture');

insert into public.staff (user_id, note) values
  ('a2800000-0000-0000-0000-000000000006', 'Test fixture');

-- Only what deleting writes is counted below.
delete from public.notifications
 where user_id in (select id from auth.users where email like '%28@test.cr');

-- ------------------------------------------------------------- grants

do $$ begin
  if has_function_privilege('anon', 'public.delete_my_account()', 'execute')
     or has_function_privilege('anon', 'public.export_my_data()', 'execute') then
    raise exception 'FAIL: anon can call delete_my_account() or export_my_data()';
  end if;
  if not has_function_privilege('authenticated', 'public.delete_my_account()', 'execute')
     or not has_function_privilege('authenticated', 'public.export_my_data()', 'execute') then
    raise exception 'FAIL: a signed-in person cannot call delete_my_account() or export_my_data()';
  end if;
end $$;

-- ------------------------------------------------------------- export

select set_config('request.jwt.claim.sub', 'a2800000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$
declare v jsonb := public.export_my_data();
begin
  if v -> 'account' ->> 'email' is distinct from 'dora28@test.cr' then
    raise exception 'FAIL: the export does not carry the email';
  end if;
  if jsonb_array_length(v -> 'sessions_organized') <> 1
     or jsonb_array_length(v -> 'sessions_joined') <> 1
     or jsonb_array_length(v -> 'groups') <> 2
     or jsonb_array_length(v -> 'messages') <> 1
     or jsonb_array_length(v -> 'reports_filed') <> 1
     or jsonb_array_length(v -> 'venues_created') <> 1 then
    raise exception 'FAIL: the export is missing rows: %', v;
  end if;
  -- Beto's report about Dora is not hers to read, and nobody else's name is in it.
  if v::text like '%Beto%' or v::text like '%beto28%' then
    raise exception 'FAIL: the export carries another person''s name or email';
  end if;
end $$;

reset role;

-- ------------------------------------------------------------- refusals

do $$
declare
  r record;
  v_sqlstate text;
begin
  for r in select * from (values
    ('a2800000-0000-0000-0000-000000000005', 'a suspended account'),
    ('a2800000-0000-0000-0000-000000000006', 'a staff account')
  ) as t(id, why) loop
    perform set_config('request.jwt.claim.sub', r.id, true);
    begin
      perform public.delete_my_account();
      raise exception 'FAIL: deleted %', r.why;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate = 'P0001' then raise; end if;
      if v_sqlstate <> '22023' then
        raise exception 'FAIL: % refused with %, expected 22023', r.why, v_sqlstate;
      end if;
    end;
    if not exists (select 1 from auth.users where id = r.id::uuid) then
      raise exception 'FAIL: % is gone after a refusal', r.why;
    end if;
  end loop;
end $$;

-- --------------------------------------------------------------- delete

select set_config('request.jwt.claim.sub', 'a2800000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.delete_my_account();
reset role;

do $$
declare
  dora constant uuid := 'a2800000-0000-0000-0000-000000000001';
  ana  constant uuid := 'a2800000-0000-0000-0000-000000000002';
  caro constant uuid := 'a2800000-0000-0000-0000-000000000004';
begin
  -- 1. Gone.
  if exists (select 1 from auth.users where id = dora)
     or exists (select 1 from public.profiles where id = dora)
     or exists (select 1 from public.profile_private where id = dora) then
    raise exception 'FAIL: the account, profile or private profile is still there';
  end if;
  if exists (select 1 from public.activities where id = 'c2800000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: her own session is still there';
  end if;

  -- 2. Shared things stay, without her.
  if (select author_id from public.messages where id = 'e2800000-0000-0000-0000-000000000001')
       is not null then
    raise exception 'FAIL: her message is gone or still names her';
  end if;
  if not exists (select 1 from public.messages where id = 'e2800000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: her message was removed from the group chat';
  end if;
  if (select reporter_id from public.reports where id = 'f2800000-0000-0000-0000-000000000001')
       is not null
     or not exists (select 1 from public.reports where id = 'f2800000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: her report did not survive de-identified';
  end if;
  if not exists (select 1 from public.reports where id = 'f2800000-0000-0000-0000-000000000002') then
    raise exception 'FAIL: the report about her was deleted';
  end if;
  if (select created_by from public.locations where id = 'b2800000-0000-0000-0000-000000000001')
       is not null then
    raise exception 'FAIL: the venue is gone or still names her';
  end if;

  -- 3. Other people's plans.
  if not exists (
    select 1 from public.notifications
     where user_id = ana and type = 'activity_cancelled'
       and payload ->> 'by' = 'gone' and payload ->> 'title' = 'Dora mañana'
       and not payload ? 'activity_id'
  ) then
    raise exception 'FAIL: Ana was not told her session is off, or the notice points at a deleted session';
  end if;
  if (select status from public.activity_participants
       where activity_id = 'c2800000-0000-0000-0000-000000000002' and user_id = ana)
     is distinct from 'joined' then
    raise exception 'FAIL: Ana was not promoted into the place Dora left';
  end if;
  if not exists (select 1 from public.notifications where user_id = ana and type = 'waitlist_promoted') then
    raise exception 'FAIL: Ana was promoted without being told';
  end if;
  if (select role from public.community_members
       where community_id = 'd2800000-0000-0000-0000-000000000001' and user_id = caro)
     is distinct from 'owner' then
    raise exception 'FAIL: the group did not pass to its organizer';
  end if;
  if not exists (
    select 1 from public.notifications
     where user_id = caro and type = 'group_handed_over' and payload ->> 'name' = 'Grupo 28'
  ) then
    raise exception 'FAIL: Caro was not told she owns the group now';
  end if;
  if (select count(*) from public.community_members
       where community_id = 'd2800000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'FAIL: the group lost a member who was not Dora';
  end if;
  if exists (select 1 from public.communities where id = 'd2800000-0000-0000-0000-000000000002') then
    raise exception 'FAIL: the group with nobody left in it was kept';
  end if;
end $$;

rollback;
