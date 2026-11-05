-- =====================================================================
-- 45_group_invites_test.sql — the invitation link of a private group.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. A lapsed, used-up or switched-off code still lets somebody in.
--   2. A member who does not organize can make or see the link.
--   3. Somebody blocked by an organizer gets in, or learns they are blocked.
--   4. The preview shows anything for an invalid code.
--   5. Clients reach community_invites directly.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a4500000-0000-0000-0000-000000000001', 'org45@test.cr',  '{"display_name":"Org"}'),
  ('a4500000-0000-0000-0000-000000000002', 'mem45@test.cr',  '{"display_name":"Mem"}'),
  ('a4500000-0000-0000-0000-000000000003', 'new45@test.cr',  '{"display_name":"Nueva"}'),
  ('a4500000-0000-0000-0000-000000000004', 'blk45@test.cr',  '{"display_name":"Bloq"}');

insert into public.communities (id, slug, name, is_public, created_by) values
  ('d4500000-0000-0000-0000-000000000001', 'privado-45', 'Privado 45', false,
   'a4500000-0000-0000-0000-000000000001');
insert into public.community_members (community_id, user_id, role) values
  ('d4500000-0000-0000-0000-000000000001', 'a4500000-0000-0000-0000-000000000002', 'member');
insert into public.blocks (blocker_id, blocked_id) values
  ('a4500000-0000-0000-0000-000000000001', 'a4500000-0000-0000-0000-000000000004');

do $$ begin
  if has_table_privilege('authenticated', 'public.community_invites', 'select')
     or has_table_privilege('anon', 'public.community_invites', 'select')
     or has_function_privilege('anon', 'public.join_group_with_code(text)', 'execute')
     or not has_function_privilege('anon', 'public.invite_preview(text)', 'execute') then
    raise exception 'FAIL: wrong access to invites';
  end if;
end $$;

-- A member who does not organize cannot make a link.
select set_config('request.jwt.claim.sub', 'a4500000-0000-0000-0000-000000000002', true);
set local role authenticated;
do $$ begin
  begin
    perform public.create_group_invite('d4500000-0000-0000-0000-000000000001');
    raise exception 'FAIL: a plain member made an invite link';
  exception when insufficient_privilege then null;
  end;
  if public.group_invite('d4500000-0000-0000-0000-000000000001') is not null then
    raise exception 'FAIL: a plain member sees the link';
  end if;
end $$;
reset role;

-- The organizer makes one, good for 2 people.
select set_config('request.jwt.claim.sub', 'a4500000-0000-0000-0000-000000000001', true);
set local role authenticated;
select set_config('test.code',
  public.create_group_invite('d4500000-0000-0000-0000-000000000001', 2) ->> 'code', true);
reset role;

do $$ begin
  if current_setting('test.code') !~ '^[A-HJ-NP-Z2-9]{8}$' then
    raise exception 'FAIL: the code has the wrong shape: %', current_setting('test.code');
  end if;
end $$;

-- Signed out: the preview works for the code, and for nothing else.
set local role anon;
do $$ begin
  if (public.invite_preview(lower(current_setting('test.code'))) ->> 'name') <> 'Privado 45' then
    raise exception 'FAIL: the preview does not show the group for a valid code';
  end if;
  if public.invite_preview('ZZZZZZZZ') is not null then
    raise exception 'FAIL: the preview shows something for an invalid code';
  end if;
end $$;
reset role;

-- Somebody blocked by the organizer is told the link does not work.
select set_config('request.jwt.claim.sub', 'a4500000-0000-0000-0000-000000000004', true);
set local role authenticated;
do $$ begin
  begin
    perform public.join_group_with_code(current_setting('test.code'));
    raise exception 'FAIL: somebody blocked by the organizer joined';
  exception when sqlstate '22023' then
    if sqlerrm not like 'Este enlace ya no sirve%' then
      raise exception 'FAIL: the refusal reveals the block: %', sqlerrm;
    end if;
  end;
end $$;
reset role;

-- A new person joins; the use is counted.
select set_config('request.jwt.claim.sub', 'a4500000-0000-0000-0000-000000000003', true);
set local role authenticated;
select public.join_group_with_code(current_setting('test.code'));
do $$ begin
  if (public.join_group_with_code(current_setting('test.code')) ->> 'already')::boolean is not true then
    raise exception 'FAIL: joining twice was not recognised';
  end if;
end $$;
reset role;

do $$ begin
  if not exists (select 1 from public.community_members
                  where community_id = 'd4500000-0000-0000-0000-000000000001'
                    and user_id = 'a4500000-0000-0000-0000-000000000003' and role = 'member') then
    raise exception 'FAIL: the invitee is not a member';
  end if;
  if (select uses from public.community_invites
       where community_id = 'd4500000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'FAIL: the use was not counted once';
  end if;
end $$;

-- Used up: with every use spent, nobody else gets in.
update public.community_invites set uses = 2
 where community_id = 'd4500000-0000-0000-0000-000000000001';
insert into auth.users (id, email, raw_user_meta_data) values
  ('a4500000-0000-0000-0000-000000000005', 'late45@test.cr', '{"display_name":"Tarde"}');
select set_config('request.jwt.claim.sub', 'a4500000-0000-0000-0000-000000000005', true);
set local role authenticated;
do $$ begin
  begin
    perform public.join_group_with_code(current_setting('test.code'));
    raise exception 'FAIL: a used-up link let somebody in';
  exception when sqlstate '22023' then null;
  end;
end $$;
reset role;

-- A new link switches off the old one; switching off leaves none.
select set_config('request.jwt.claim.sub', 'a4500000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.create_group_invite('d4500000-0000-0000-0000-000000000001');
do $$ begin
  if public.invite_preview(current_setting('test.code')) is not null then
    raise exception 'FAIL: the old code still works after a new one was made';
  end if;
end $$;
select public.revoke_group_invite('d4500000-0000-0000-0000-000000000001');
do $$ begin
  if public.group_invite('d4500000-0000-0000-0000-000000000001') is not null then
    raise exception 'FAIL: the link survived being switched off';
  end if;
end $$;
reset role;

rollback;
