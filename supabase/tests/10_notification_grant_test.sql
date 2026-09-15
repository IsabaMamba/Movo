-- =====================================================================
-- 10_notification_grant_test.sql — a person marks their notification read,
-- and cannot rewrite what it says.
--
-- 0003 granted `update` on the whole row so the inbox could set `read_at`.
-- The policy restricts which row, never which column, so the same grant let
-- somebody edit the `type` and `payload` of their own notifications. 0011
-- narrows it to `read_at`.
--
-- This matters because of what comes next rather than what exists now: the
-- delivery function will read `type` and `payload` to decide what to send,
-- and a payload the recipient can edit is a payload they can aim at whatever
-- renders it.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

-- ---------------------------------------------------------------- setup

insert into auth.users (id, email, raw_user_meta_data) values
  ('aa000000-0000-0000-0000-0000000000a1', 'dest@test.cr', '{"display_name":"Destinataria"}'),
  ('aa000000-0000-0000-0000-0000000000a2', 'otra@test.cr', '{"display_name":"Otra"}');

insert into public.notifications (id, user_id, type, payload) values
  ('cc000000-0000-0000-0000-0000000000c1',
   'aa000000-0000-0000-0000-0000000000a1',
   'activity_cancelled',
   '{"activity_id": "11111111-1111-1111-1111-111111111111", "title": "Corrida"}'::jsonb),
  ('cc000000-0000-0000-0000-0000000000c2',
   'aa000000-0000-0000-0000-0000000000a2',
   'waitlist_promoted',
   '{"activity_id": "11111111-1111-1111-1111-111111111111", "title": "Corrida"}'::jsonb);

-- ------------------------------------------------- as the recipient

select set_config('request.jwt.claim.sub', 'aa000000-0000-0000-0000-0000000000a1', true);
set local role authenticated;

-- 1. She reads her own and only her own.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.notifications;
  if v_count <> 1 then
    raise exception 'FAIL: recipient sees % notifications, expected exactly her own', v_count;
  end if;
end $$;

-- 2. Marking read still works. This is the whole reason the grant exists, so
--    a migration that tightened it into uselessness would pass every other
--    check in this file.
update public.notifications
   set read_at = now()
 where id = 'cc000000-0000-0000-0000-0000000000c1';

do $$ begin
  if not exists (
    select 1 from public.notifications
     where id = 'cc000000-0000-0000-0000-0000000000c1' and read_at is not null
  ) then
    raise exception 'FAIL: the owner cannot set read_at — the inbox is broken';
  end if;
end $$;

-- 3. She cannot rewrite the payload. The grant is per-column now, so this is
--    refused at the grant level (42501) before any policy is consulted.
do $$
declare
  v_sqlstate text;
begin
  begin
    update public.notifications
       set payload = '{"activity_id": "11111111-1111-1111-1111-111111111111", "title": "<script>"}'::jsonb
     where id = 'cc000000-0000-0000-0000-0000000000c1';
    raise exception 'FAIL: the recipient rewrote her own notification payload';
  exception
    when insufficient_privilege then
      null; -- expected
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate = 'P0001' then raise; end if;
      raise exception 'FAIL: payload update refused with %, expected 42501', v_sqlstate;
  end;
end $$;

-- 4. Nor the type, which is what delivery will branch on.
do $$
declare
  v_sqlstate text;
begin
  begin
    update public.notifications
       set type = 'report_resolved'
     where id = 'cc000000-0000-0000-0000-0000000000c1';
    raise exception 'FAIL: the recipient rewrote her own notification type';
  exception
    when insufficient_privilege then
      null; -- expected
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate = 'P0001' then raise; end if;
      raise exception 'FAIL: type update refused with %, expected 42501', v_sqlstate;
  end;
end $$;

-- 5. And she cannot mark somebody else's read. The policy still does its job;
--    narrowing the grant must not have replaced the row rule with nothing.
do $$
declare
  v_rows integer;
begin
  update public.notifications
     set read_at = now()
   where id = 'cc000000-0000-0000-0000-0000000000c2';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FAIL: marked % of somebody else''s notifications read', v_rows;
  end if;
end $$;

reset role;

rollback;
