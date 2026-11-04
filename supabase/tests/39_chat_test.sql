-- =====================================================================
-- 39_chat_test.sql — the chat: who writes, who reads, who is told, and
-- what is removed.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. Somebody outside a session or group reads or writes its chat, or a
--      client writes `messages` without the checks.
--   2. A blocked person's messages reach the person who blocked them, in
--      the feed, in «Tus chats» or as a notice.
--   3. The author of a removed message is told who removed it, or a
--      member removes somebody else's message.
--   4. A session chat stays writable after it closes; a member writes in
--      an organizers-only group; a fourth message is pinned.
--   5. Notices go to the wrong people, ignore «Silenciado», or pile up.
--   6. The purge keeps what it should delete, or deletes what it should keep.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

-- ---------------------------------------------------------------- setup
--
-- Luis organizes «Trote 39». Andrea and Sofía go; Mario goes too, and
-- Sofía has blocked him. Pedro goes to nothing: the outsider.
-- Andrea owns the group «Corredores 39»; Sofía and Mario are members.

insert into auth.users (id, email, raw_user_meta_data) values
  ('a3900000-0000-0000-0000-000000000001', 'luis39@test.cr',   '{"display_name":"Luis"}'),
  ('a3900000-0000-0000-0000-000000000002', 'andrea39@test.cr', '{"display_name":"Andrea"}'),
  ('a3900000-0000-0000-0000-000000000003', 'sofia39@test.cr',  '{"display_name":"Sofía"}'),
  ('a3900000-0000-0000-0000-000000000004', 'mario39@test.cr',  '{"display_name":"Mario"}'),
  ('a3900000-0000-0000-0000-000000000005', 'pedro39@test.cr',  '{"display_name":"Pedro"}');

insert into public.locations (id, name, geog, is_public_venue, is_verified, created_by) values
  ('b3900000-0000-0000-0000-000000000001', 'Parque 39',
   extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
   true, true, 'a3900000-0000-0000-0000-000000000001');

insert into public.activities
  (id, organizer_id, category_id, location_id, title, starts_at, ends_at, status, visibility)
values
  ('c3900000-0000-0000-0000-000000000001', 'a3900000-0000-0000-0000-000000000001', 'running',
   'b3900000-0000-0000-0000-000000000001', 'Trote 39',
   now() + interval '1 day', now() + interval '1 day 1 hour', 'published', 'public'),
  -- Ended two days ago: its chat closed a day ago.
  ('c3900000-0000-0000-0000-000000000002', 'a3900000-0000-0000-0000-000000000001', 'running',
   'b3900000-0000-0000-0000-000000000001', 'Trote pasado 39',
   now() - interval '2 days 1 hour', now() - interval '2 days', 'completed', 'public'),
  -- Ended forty days ago: its chat is purged.
  ('c3900000-0000-0000-0000-000000000003', 'a3900000-0000-0000-0000-000000000001', 'running',
   'b3900000-0000-0000-0000-000000000001', 'Trote viejo 39',
   now() - interval '40 days 1 hour', now() - interval '40 days', 'completed', 'public');

insert into public.activity_participants (activity_id, user_id, status) values
  ('c3900000-0000-0000-0000-000000000001', 'a3900000-0000-0000-0000-000000000002', 'joined'),
  ('c3900000-0000-0000-0000-000000000001', 'a3900000-0000-0000-0000-000000000003', 'joined'),
  ('c3900000-0000-0000-0000-000000000001', 'a3900000-0000-0000-0000-000000000004', 'joined'),
  ('c3900000-0000-0000-0000-000000000002', 'a3900000-0000-0000-0000-000000000002', 'attended');

insert into public.blocks (blocker_id, blocked_id)
values ('a3900000-0000-0000-0000-000000000003', 'a3900000-0000-0000-0000-000000000004');

insert into public.communities (id, slug, name, category_id, created_by)
values ('d3900000-0000-0000-0000-000000000001', 'corredores-39', 'Corredores 39', 'running',
        'a3900000-0000-0000-0000-000000000002');
insert into public.community_members (community_id, user_id, role) values
  ('d3900000-0000-0000-0000-000000000001', 'a3900000-0000-0000-0000-000000000003', 'member'),
  ('d3900000-0000-0000-0000-000000000001', 'a3900000-0000-0000-0000-000000000004', 'member')
on conflict do nothing;

-- Old messages for the purge, written as the database would have.
insert into public.messages (id, activity_id, community_id, author_id, body, created_at) values
  ('e3900000-0000-0000-0000-0000000000a1', 'c3900000-0000-0000-0000-000000000003', null,
   'a3900000-0000-0000-0000-000000000001', 'Viejo', now() - interval '41 days'),
  ('e3900000-0000-0000-0000-0000000000a2', null, 'd3900000-0000-0000-0000-000000000001',
   'a3900000-0000-0000-0000-000000000002', 'Hace siete meses', now() - interval '7 months'),
  ('e3900000-0000-0000-0000-0000000000a3', 'c3900000-0000-0000-0000-000000000002', null,
   'a3900000-0000-0000-0000-000000000001', '¡Buen trote!', now() - interval '2 days');

-- ------------------------------------------------------------- grants

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.send_message(uuid, uuid, text, uuid)', 'public.remove_message(uuid, text)',
    'public.pin_message(uuid, boolean)', 'public.set_chat_mode(uuid, text)',
    'public.set_chat_notifications(uuid, uuid, text)', 'public.mark_chat_read(uuid, uuid)',
    'public.chat_messages(uuid, uuid, timestamptz, integer)', 'public.my_chats()'
  ] loop
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'FAIL: anon can execute %', f;
    end if;
  end loop;
  foreach f in array array[
    'public.purge_chats()', 'public.can_read_chat(uuid, uuid, uuid)',
    'public.is_chat_organizer(uuid, uuid, uuid)', 'public.chat_message_json(public.messages, uuid)'
  ] loop
    if has_function_privilege('authenticated', f, 'execute') then
      raise exception 'FAIL: a client can execute %', f;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.messages', 'insert')
     or has_table_privilege('authenticated', 'public.messages', 'update')
     or has_table_privilege('authenticated', 'public.chat_state', 'insert')
     or has_table_privilege('authenticated', 'public.chat_state', 'update') then
    raise exception 'FAIL: a client can write messages or chat_state directly';
  end if;
end $$;

-- ------------------------------------------------- writing in a session

-- Luis, the organizer, opens the chat.
select set_config('request.jwt.claim.sub', 'a3900000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.send_message('c3900000-0000-0000-0000-000000000001', null,
  '  Nos vemos frente al lago, junto a la fuente.  ');

-- Mario writes; Sofía, who blocked him, must not hear about it.
reset role;
select set_config('request.jwt.claim.sub', 'a3900000-0000-0000-0000-000000000004', true);
set local role authenticated;
select public.send_message('c3900000-0000-0000-0000-000000000001', null, 'Hola, soy Mario');

-- Andrea replies to Luis.
reset role;
select set_config('request.jwt.claim.sub', 'a3900000-0000-0000-0000-000000000002', true);
set local role authenticated;
select public.send_message('c3900000-0000-0000-0000-000000000001', null, '¿Hay dónde dejar las llaves?',
  (select id from public.messages where body like 'Nos vemos%'));

do $$ begin
  if (select body from public.messages where body like 'Nos vemos%')
     <> 'Nos vemos frente al lago, junto a la fuente.' then
    raise exception 'FAIL: the body was not trimmed';
  end if;
  begin
    perform public.send_message('c3900000-0000-0000-0000-000000000001', null, '   ');
    raise exception 'FAIL: an empty message was sent';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.send_message('c3900000-0000-0000-0000-000000000001', null, repeat('a', 2001));
    raise exception 'FAIL: a message over 2000 characters was sent';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.send_message('c3900000-0000-0000-0000-000000000001',
                                'd3900000-0000-0000-0000-000000000001', 'Las dos');
    raise exception 'FAIL: a message went to a session and a group at once';
  exception when sqlstate '22023' then null;
  end;
  -- The session that ended two days ago: Andrea went, the chat is closed.
  begin
    perform public.send_message('c3900000-0000-0000-0000-000000000002', null, 'Tarde');
    raise exception 'FAIL: a closed session chat took a message';
  exception when sqlstate '22023' then null;
  end;
  if (public.chat_messages('c3900000-0000-0000-0000-000000000002', null) ->> 'why_not') <> 'closed' then
    raise exception 'FAIL: a closed chat does not say so';
  end if;
end $$;

-- Pedro is outside everything.
reset role;
select set_config('request.jwt.claim.sub', 'a3900000-0000-0000-0000-000000000005', true);
set local role authenticated;

do $$ begin
  begin
    perform public.send_message('c3900000-0000-0000-0000-000000000001', null, 'Hola');
    raise exception 'FAIL: an outsider wrote in a session chat';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.chat_messages('c3900000-0000-0000-0000-000000000001', null);
    raise exception 'FAIL: an outsider read a session chat';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from public.messages
              where activity_id = 'c3900000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: messages_read showed an outsider the chat';
  end if;
  if public.my_chats() <> '[]'::jsonb then
    raise exception 'FAIL: an outsider has chats';
  end if;
  begin
    insert into public.messages (activity_id, author_id, body)
    values ('c3900000-0000-0000-0000-000000000001', 'a3900000-0000-0000-0000-000000000005', 'Directo');
    raise exception 'FAIL: a client inserted into messages directly';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ------------------------------------------------- what Sofía sees

reset role;
select set_config('request.jwt.claim.sub', 'a3900000-0000-0000-0000-000000000003', true);
set local role authenticated;

do $$
declare
  v_feed  jsonb := public.chat_messages('c3900000-0000-0000-0000-000000000001', null);
  v_chats jsonb := public.my_chats();
  v_trote jsonb;
begin
  if v_feed::text like '%Mario%' then
    raise exception 'FAIL: Sofía sees the person she blocked in the feed: %', v_feed;
  end if;
  if jsonb_array_length(v_feed -> 'messages') <> 2 then
    raise exception 'FAIL: Sofía should see 2 messages, saw %', jsonb_array_length(v_feed -> 'messages');
  end if;
  if (v_feed -> 'messages' -> 1 ->> 'is_organizer')::boolean is not true then
    raise exception 'FAIL: the organizer''s message is not marked as the organizer''s';
  end if;
  if (v_feed -> 'messages' -> 0 -> 'reply_to' ->> 'author_name') <> 'Luis' then
    raise exception 'FAIL: the reply does not show what it answers';
  end if;
  if exists (select 1 from public.messages where body = 'Hola, soy Mario') then
    raise exception 'FAIL: messages_read shows Sofía the person she blocked';
  end if;

  select c into v_trote from jsonb_array_elements(v_chats) c
   where c ->> 'activity_id' = 'c3900000-0000-0000-0000-000000000001';
  if (v_trote ->> 'unread')::int <> 2 or v_trote -> 'last' ->> 'author_name' <> 'Andrea' then
    raise exception 'FAIL: «Tus chats» for Sofía was %', v_trote;
  end if;
end $$;

select public.mark_chat_read('c3900000-0000-0000-0000-000000000001', null);

do $$ begin
  if (select (c ->> 'unread')::int from jsonb_array_elements(public.my_chats()) c
       where c ->> 'activity_id' = 'c3900000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'FAIL: reading the chat did not clear its unread count';
  end if;
end $$;

-- ------------------------------------------------------------ notices

reset role;

do $$
declare
  v_rows text[];
begin
  select array_agg(u.raw_user_meta_data ->> 'display_name' || ':' || n.type
                   order by u.raw_user_meta_data ->> 'display_name' collate "C", n.type)
    into v_rows
    from public.notifications n
    join auth.users u on u.id = n.user_id
   where n.type like 'chat_%'
     and u.email like '%39@test.cr';

  -- Luis's opening message reaches everybody going (chat_organizer); Mario's
  -- reaches nobody (default «replies»); Andrea's reply reaches Luis. Sofía
  -- read the chat, which marked her notice read but kept it.
  if v_rows <> array['Andrea:chat_organizer', 'Luis:chat_reply',
                     'Mario:chat_organizer', 'Sofía:chat_organizer'] then
    raise exception 'FAIL: chat notices were %', v_rows;
  end if;
  if exists (select 1 from public.notifications
              where type like 'chat_%' and payload::text like '%Nos vemos%') then
    raise exception 'FAIL: a notice carries the text of a message';
  end if;
  if (select read_at from public.notifications n join auth.users u on u.id = n.user_id
       where u.email = 'sofia39@test.cr' and n.type = 'chat_organizer') is null then
    raise exception 'FAIL: opening the chat did not mark its notice read';
  end if;
end $$;

-- Andrea mutes the session; Luis writes again: she is not told.
select set_config('request.jwt.claim.sub', 'a3900000-0000-0000-0000-000000000002', true);
set local role authenticated;
select public.set_chat_notifications('c3900000-0000-0000-0000-000000000001', null, 'muted');
reset role;
select set_config('request.jwt.claim.sub', 'a3900000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.send_message('c3900000-0000-0000-0000-000000000001', null, 'Llevo chaleco amarillo');
reset role;

do $$ begin
  if (select count(*) from public.notifications n join auth.users u on u.id = n.user_id
       where u.email = 'andrea39@test.cr' and n.type = 'chat_organizer') <> 1 then
    raise exception 'FAIL: a muted chat still sent Andrea a notice';
  end if;
end $$;

-- ------------------------------------------------------- the group chat

-- Mario writes in the group; Sofía asked for everything and gets one notice
-- however many arrive... except she blocked Mario, so none from him.
select set_config('request.jwt.claim.sub', 'a3900000-0000-0000-0000-000000000003', true);
set local role authenticated;
select public.set_chat_notifications(null, 'd3900000-0000-0000-0000-000000000001', 'all');
reset role;
select set_config('request.jwt.claim.sub', 'a3900000-0000-0000-0000-000000000004', true);
set local role authenticated;
select public.send_message(null, 'd3900000-0000-0000-0000-000000000001', 'Vendo suplementos, escríbanme');
reset role;

-- Andrea, the owner, writes twice.
select set_config('request.jwt.claim.sub', 'a3900000-0000-0000-0000-000000000002', true);
set local role authenticated;
select public.send_message(null, 'd3900000-0000-0000-0000-000000000001', 'Salimos jueves 18:30');
select public.send_message(null, 'd3900000-0000-0000-0000-000000000001', 'Y domingo 07:00');
reset role;

do $$ begin
  if exists (select 1 from public.notifications n join auth.users u on u.id = n.user_id
              where u.email = 'sofia39@test.cr'
                and n.payload ->> 'community_id' = 'd3900000-0000-0000-0000-000000000001'
                and n.payload ->> 'name' = 'Mario') then
    raise exception 'FAIL: Sofía was told about a message from the person she blocked';
  end if;
  if (select count(*) from public.notifications n join auth.users u on u.id = n.user_id
       where u.email = 'sofia39@test.cr' and n.type = 'chat_organizer'
         and n.payload ->> 'community_id' = 'd3900000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'FAIL: the owner''s messages did not reach Sofía as organizer notices';
  end if;
end $$;

-- Mario cannot remove Andrea's message, nor pin.
select set_config('request.jwt.claim.sub', 'a3900000-0000-0000-0000-000000000004', true);
set local role authenticated;

do $$ begin
  begin
    perform public.remove_message(
      (select id from public.messages where body = 'Salimos jueves 18:30'), 'Spam');
    raise exception 'FAIL: a member removed somebody else''s message';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.pin_message(
      (select id from public.messages where body = 'Salimos jueves 18:30'), true);
    raise exception 'FAIL: a member pinned a message';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Andrea removes Mario's message with the rule, pins three and is refused a
-- fourth, then closes the chat to organizers.
reset role;
select set_config('request.jwt.claim.sub', 'a3900000-0000-0000-0000-000000000002', true);
set local role authenticated;

do $$
declare
  v_spam uuid;
begin
  -- Messages_read hides nothing from Andrea; the RPC reads the row itself.
  v_spam := (select id from public.messages where body like 'Vendo suplementos%');
  begin
    perform public.remove_message(v_spam, '   ');
    raise exception 'FAIL: a message was removed without a rule';
  exception when sqlstate '22023' then null;
  end;
  perform public.remove_message(v_spam, 'Norma 12 · Nada de spam');

  perform public.pin_message((select id from public.messages where body = 'Salimos jueves 18:30'), true);
  perform public.pin_message((select id from public.messages where body = 'Y domingo 07:00'), true);
  perform public.send_message(null, 'd3900000-0000-0000-0000-000000000001', 'Tercera');
  perform public.send_message(null, 'd3900000-0000-0000-0000-000000000001', 'Cuarta');
  perform public.pin_message((select id from public.messages where body = 'Tercera'), true);
  begin
    perform public.pin_message((select id from public.messages where body = 'Cuarta'), true);
    raise exception 'FAIL: a fourth message was pinned';
  exception when sqlstate '22023' then null;
  end;
  perform public.pin_message((select id from public.messages where body = 'Tercera'), false);
  perform public.pin_message((select id from public.messages where body = 'Cuarta'), true);

  perform public.set_chat_mode('d3900000-0000-0000-0000-000000000001', 'organizers');
end $$;

reset role;

do $$
declare
  v_payload jsonb;
begin
  select payload into v_payload from public.notifications n join auth.users u on u.id = n.user_id
   where u.email = 'mario39@test.cr' and n.type = 'chat_message_removed';
  if v_payload is null or v_payload ->> 'reason' <> 'Norma 12 · Nada de spam' then
    raise exception 'FAIL: Mario was not told the rule: %', v_payload;
  end if;
  if v_payload::text like '%a3900000-0000-0000-0000-000000000002%' or v_payload::text like '%Andrea%' then
    raise exception 'FAIL: the removal notice says who removed it: %', v_payload;
  end if;
end $$;

-- Sofía sees the marker, the three pinned, and cannot write any more.
select set_config('request.jwt.claim.sub', 'a3900000-0000-0000-0000-000000000003', true);
set local role authenticated;

do $$
declare
  v jsonb := public.chat_messages(null, 'd3900000-0000-0000-0000-000000000001');
begin
  if jsonb_array_length(v -> 'pinned') <> 3 then
    raise exception 'FAIL: % pinned, not 3', jsonb_array_length(v -> 'pinned');
  end if;
  if (v ->> 'can_write')::boolean or v ->> 'why_not' <> 'organizers_only' then
    raise exception 'FAIL: a member can still write in an organizers-only group: %', v;
  end if;
  begin
    perform public.send_message(null, 'd3900000-0000-0000-0000-000000000001', 'Hola');
    raise exception 'FAIL: a member wrote in an organizers-only group';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Mario sees the marker in place of his message, and his own taking-back
-- leaves none.
reset role;
select set_config('request.jwt.claim.sub', 'a3900000-0000-0000-0000-000000000004', true);
set local role authenticated;

do $$
declare
  v jsonb := public.chat_messages(null, 'd3900000-0000-0000-0000-000000000001');
begin
  if not exists (select 1 from jsonb_array_elements(v -> 'messages') m
                  where (m ->> 'removed')::boolean and m -> 'body' is null) then
    raise exception 'FAIL: the removed message left no marker: %', v -> 'messages';
  end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', 'a3900000-0000-0000-0000-000000000002', true);
set local role authenticated;
select public.remove_message((select id from public.messages where body = 'Cuarta'));

do $$ begin
  if jsonb_array_length(public.chat_messages(null, 'd3900000-0000-0000-0000-000000000001') -> 'pinned') <> 2 then
    raise exception 'FAIL: a taken-back message stayed pinned';
  end if;
  if exists (select 1 from jsonb_array_elements(
               public.chat_messages(null, 'd3900000-0000-0000-0000-000000000001') -> 'messages') m
              where (m ->> 'removed')::boolean
                and (m ->> 'created_at')::timestamptz >
                    (select created_at from public.messages where body = 'Tercera')) then
    raise exception 'FAIL: a message taken back by its author left a marker';
  end if;
end $$;

-- ----------------------------------------------------------------- purge

reset role;

do $$
declare
  v jsonb := public.purge_chats();
begin
  if exists (select 1 from public.messages where id in ('e3900000-0000-0000-0000-0000000000a1',
                                                       'e3900000-0000-0000-0000-0000000000a2')) then
    raise exception 'FAIL: the purge kept what it should delete: %', v;
  end if;
  if not exists (select 1 from public.messages where id = 'e3900000-0000-0000-0000-0000000000a3') then
    raise exception 'FAIL: the purge deleted a chat that closed only a day ago';
  end if;
end $$;

rollback;
