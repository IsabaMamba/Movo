-- =====================================================================
-- 48_notification_preferences_test.sql — a notice switched off is never written.
--
--   1. With no row, chat arrives and «quién se une» does not.
--   2. Chat off drops chat notices; «Siempre» types still arrive.
--   3. Each person reads and writes only their own row.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a4900000-0000-0000-0000-000000000001', 'ana@pref.test',  '{"display_name":"Ana"}'),
  ('a4900000-0000-0000-0000-000000000002', 'beto@pref.test', '{"display_name":"Beto"}');

-- ------------------------------------------------- 1. defaults

insert into public.notifications (user_id, type, payload) values
  ('a4900000-0000-0000-0000-000000000001', 'chat_message', '{}'),
  ('a4900000-0000-0000-0000-000000000001', 'participants_daily', '{}');

do $$ begin
  if (select count(*) from public.notifications
       where user_id = 'a4900000-0000-0000-0000-000000000001') <> 1
     or not exists (select 1 from public.notifications
                     where user_id = 'a4900000-0000-0000-0000-000000000001'
                       and type = 'chat_message') then
    raise exception 'FAIL: defaults should deliver chat and drop the daily joins';
  end if;
end $$;

-- ------------------------------------------------- 3. own row only

select set_config('request.jwt.claim.sub', 'a4900000-0000-0000-0000-000000000001', true);
set local role authenticated;
insert into public.notification_preferences (user_id, chat, joins)
values ('a4900000-0000-0000-0000-000000000001', false, true);
do $$ begin
  begin
    insert into public.notification_preferences (user_id, chat)
    values ('a4900000-0000-0000-0000-000000000002', false);
    raise exception 'FAIL: wrote somebody else''s preferences';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'a4900000-0000-0000-0000-000000000002', true);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.notification_preferences) then
    raise exception 'FAIL: read somebody else''s preferences';
  end if;
end $$;
reset role;

-- ------------------------------------------------- 2. chat off

insert into public.notifications (user_id, type, payload) values
  ('a4900000-0000-0000-0000-000000000001', 'chat_reply', '{}'),
  ('a4900000-0000-0000-0000-000000000001', 'participants_daily', '{}'),
  ('a4900000-0000-0000-0000-000000000001', 'activity_cancelled', '{}'),
  ('a4900000-0000-0000-0000-000000000002', 'chat_reply', '{}');

do $$ begin
  if exists (select 1 from public.notifications
              where user_id = 'a4900000-0000-0000-0000-000000000001' and type = 'chat_reply') then
    raise exception 'FAIL: chat arrived with chat off';
  end if;
  if not exists (select 1 from public.notifications
                  where user_id = 'a4900000-0000-0000-0000-000000000001'
                    and type = 'activity_cancelled') then
    raise exception 'FAIL: a cancellation was dropped; it is «Siempre»';
  end if;
  if not exists (select 1 from public.notifications
                  where user_id = 'a4900000-0000-0000-0000-000000000001'
                    and type = 'participants_daily') then
    raise exception 'FAIL: joins switched on did not arrive';
  end if;
  if not exists (select 1 from public.notifications
                  where user_id = 'a4900000-0000-0000-0000-000000000002' and type = 'chat_reply') then
    raise exception 'FAIL: one person''s switch affected another';
  end if;
end $$;

rollback;
