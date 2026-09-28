-- =====================================================================
-- 25_web_push_test.sql — a device is registered only for a push service,
-- belongs to whoever registered it last, and a notice is never lost
-- because pushing it could not happen.
--
-- CI has neither pg_net nor Vault, so the trigger takes its "nothing to do"
-- path here. That path is the one worth proving: it is what every
-- cancellation, suspension and reminder runs through on a project where push
-- is not configured, and it must not fail them.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a2500000-0000-0000-0000-000000000001', 'ana25@test.cr',  '{"display_name":"Ana"}'),
  ('a2500000-0000-0000-0000-000000000002', 'beto25@test.cr', '{"display_name":"Beto"}');

-- ------------------------------------------------------------- grants

do $$ begin
  if has_table_privilege('authenticated', 'public.push_subscriptions', 'insert')
     or has_table_privilege('authenticated', 'public.push_subscriptions', 'update')
     or has_table_privilege('authenticated', 'public.push_subscriptions', 'delete') then
    raise exception 'FAIL: a client can write push_subscriptions directly';
  end if;
  if has_column_privilege('authenticated', 'public.push_subscriptions', 'p256dh', 'select')
     or has_column_privilege('authenticated', 'public.push_subscriptions', 'auth', 'select') then
    raise exception 'FAIL: a client can read the encryption keys back';
  end if;
  if has_table_privilege('anon', 'public.push_subscriptions', 'select')
     or has_function_privilege('anon', 'public.register_push_subscription(text, text, text)', 'execute') then
    raise exception 'FAIL: anon can touch push subscriptions';
  end if;
end $$;

-- ------------------------------------------------------- endpoints

do $$
declare r record;
begin
  for r in select * from (values
    ('https://fcm.googleapis.com/fcm/send/abc',                     true),
    ('https://updates.push.services.mozilla.com/wpush/v2/abc',      true),
    ('https://web.push.apple.com/QGx1',                             true),
    ('https://wns2-by3p.notify.windows.com/w/?token=abc',           true),
    ('http://fcm.googleapis.com/fcm/send/abc',                      false),
    ('https://fcm.googleapis.com.evil.example/fcm',                 false),
    ('https://evil.example/?https://fcm.googleapis.com/',           false),
    ('https://169.254.169.254/latest/meta-data/',                   false),
    ('https://localhost:54321/functions/v1/send-push',              false)
  ) as t(endpoint, ok) loop
    if public.is_push_endpoint(r.endpoint) <> r.ok then
      raise exception 'FAIL: is_push_endpoint(%) should be %', r.endpoint, r.ok;
    end if;
  end loop;
  if public.is_push_endpoint(null) then
    raise exception 'FAIL: a null endpoint counts as a push service';
  end if;
end $$;

-- ------------------------------------------------------- registering

select set_config('request.jwt.claim.sub', 'a2500000-0000-0000-0000-000000000001', true);
set local role authenticated;

select public.register_push_subscription(
  'https://fcm.googleapis.com/fcm/send/device-1',
  repeat('p', 87), repeat('a', 22));

do $$
declare v_sqlstate text;
begin
  begin
    perform public.register_push_subscription(
      'https://evil.example/collect', repeat('p', 87), repeat('a', 22));
    raise exception 'FAIL: a non-push endpoint was registered';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate = 'P0001' then raise; end if;
    if v_sqlstate <> '22023' then
      raise exception 'FAIL: bad endpoint refused with %, expected 22023', v_sqlstate;
    end if;
  end;

  if (select count(*) from public.push_subscriptions) <> 1 then
    raise exception 'FAIL: Ana cannot see her one device';
  end if;
end $$;

reset role;

-- The same browser, now signed in as Beto. The device moves to him.
select set_config('request.jwt.claim.sub', 'a2500000-0000-0000-0000-000000000002', true);
set local role authenticated;

select public.register_push_subscription(
  'https://fcm.googleapis.com/fcm/send/device-1',
  repeat('q', 87), repeat('b', 22));

-- Beto cannot remove a device that is not his.
reset role;
select set_config('request.jwt.claim.sub', 'a2500000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.unregister_push_subscription('https://fcm.googleapis.com/fcm/send/device-1');
reset role;

do $$ begin
  if (select count(*) from public.push_subscriptions
       where endpoint = 'https://fcm.googleapis.com/fcm/send/device-1') <> 1 then
    raise exception 'FAIL: the device was duplicated or deleted by the wrong person';
  end if;
  if (select user_id from public.push_subscriptions
       where endpoint = 'https://fcm.googleapis.com/fcm/send/device-1')
     <> 'a2500000-0000-0000-0000-000000000002' then
    raise exception 'FAIL: the device still belongs to Ana after Beto registered it';
  end if;
end $$;

-- --------------------------------------------- a notice is never lost

-- Beto has a device, so the trigger gets past its first check and meets a
-- project with no pg_net or Vault. The insert must succeed regardless.
insert into public.notifications (user_id, type, payload)
values ('a2500000-0000-0000-0000-000000000002', 'waitlist_promoted',
        '{"title": "Prueba", "activity_id": "x"}');

do $$ begin
  if not exists (select 1 from public.notifications
                  where user_id = 'a2500000-0000-0000-0000-000000000002') then
    raise exception 'FAIL: the notice was not written';
  end if;
end $$;

-- Beto removes his own device.
select set_config('request.jwt.claim.sub', 'a2500000-0000-0000-0000-000000000002', true);
set local role authenticated;
select public.unregister_push_subscription('https://fcm.googleapis.com/fcm/send/device-1');
reset role;

do $$ begin
  if exists (select 1 from public.push_subscriptions) then
    raise exception 'FAIL: unregistering left the device behind';
  end if;
end $$;

rollback;
