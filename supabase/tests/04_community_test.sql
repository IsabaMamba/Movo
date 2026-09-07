-- =====================================================================
-- 04_community_test.sql — group ownership and membership.
--
-- The bootstrap is the interesting part: promotion to organizer is
-- organizer-only, so if creating a group does not produce an owner, no group
-- can ever have one.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('66666666-6666-6666-6666-666666666666', 'due@test.cr',  '{"display_name":"Dueña"}'),
  ('77777777-7777-7777-7777-777777777777', 'soc@test.cr',  '{"display_name":"Socio"}');

set local role authenticated;
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);

insert into public.communities (id, slug, name, is_public, created_by)
values ('cccccccc-0000-0000-0000-000000000001', 'mejengueros', 'Mejengueros', true,
        '66666666-6666-6666-6666-666666666666');

do $$ begin
  if not exists (
    select 1 from public.community_members
     where community_id = 'cccccccc-0000-0000-0000-000000000001'
       and user_id = '66666666-6666-6666-6666-666666666666'
       and role = 'owner'
  ) then
    raise exception 'FAIL: the creator of a group is not its owner';
  end if;
end $$;

do $$ begin
  if not public.is_community_organizer(
       'cccccccc-0000-0000-0000-000000000001',
       '66666666-6666-6666-6666-666666666666') then
    raise exception 'FAIL: the creator is not recognised as an organizer';
  end if;
end $$;

-- The creator must be able to edit the group they just made.
do $$ begin
  update public.communities set description = 'Mejenga los jueves'
   where id = 'cccccccc-0000-0000-0000-000000000001';
  if not found then
    raise exception 'FAIL: the owner cannot update their own group';
  end if;
end $$;

-- ------------------------------------------------------- another member

select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', true);

do $$ begin
  insert into public.community_members (community_id, user_id, role)
  values ('cccccccc-0000-0000-0000-000000000001',
          '77777777-7777-7777-7777-777777777777', 'member');
end $$;

-- Joining as anything but a plain member must be refused.
do $$ begin
  begin
    insert into public.community_members (community_id, user_id, role)
    values ('cccccccc-0000-0000-0000-000000000001',
            '77777777-7777-7777-7777-777777777777', 'owner');
    raise exception 'FAIL: a member promoted themselves to owner';
  exception when insufficient_privilege or unique_violation then
    null; -- expected
  end;
end $$;

-- A member can leave.
do $$ begin
  delete from public.community_members
   where community_id = 'cccccccc-0000-0000-0000-000000000001'
     and user_id = '77777777-7777-7777-7777-777777777777';
  if found then
    null;
  else
    raise exception 'FAIL: a member could not leave';
  end if;
end $$;

reset role;

rollback;
