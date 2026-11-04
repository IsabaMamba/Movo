-- =====================================================================
-- 0040_chat.sql — the chat inside Movo: one per session, one per group.
--
-- 3 November handoff, backend item 3 (boards Chat v1 and v2, Avisos v3,
-- Normas v4 · 29). Alex decided the chat lives inside Movo so nobody has
-- to hand out a phone number, above all in women-only spaces. `messages`
-- has existed since 0001 (one session or one group, 1–2000 characters, a
-- soft delete), with RLS since 0003 and the suspension guard since 0020.
-- No screen used it. This is everything a screen needs.
--
--   * Writes go through RPCs only. send_message() checks what the
--     policies could not: a session chat closes 24 hours after the session
--     ends (read-only, then deleted at 30 days), and a group can be set so
--     only its organizers write. The INSERT and UPDATE grants from 0003
--     are revoked, with their policies.
--   * remove_message(): an author takes back their own message, and the
--     organizer of the session or group, or the team, removes somebody
--     else's with the rule it breaks. The author is told which rule
--     (chat_message_removed) and never who. A removed message leaves a
--     marker in the feed, «Mensaje quitado por quien organiza», so nobody
--     thinks it vanished quietly; one taken back by its author leaves none.
--   * pin_message(): organizers pin up to three.
--   * set_chat_mode(): «Todo el grupo» or «Solo quienes organizan».
--   * chat_state: per person and chat, when they last read it and which
--     notices they want — replies and organizers (the default), all, or
--     none. Owner-readable; written by set_chat_notifications() and
--     mark_chat_read().
--   * chat_messages() and my_chats() are the two reads the screens make:
--     a page of one chat with its pinned messages and whether the caller
--     can write, and «Tus chats» with the last line and unread count.
--     Both drop people blocked in either direction and suspended authors,
--     as messages_read does.
--   * Notices: chat_reply to the author of the message replied to;
--     chat_organizer when an organizer writes; chat_message, one per chat
--     until read, for people who asked for everything. Never the text of a
--     message: the push is the fixed sentence (ADR 0007) and the inbox
--     says who wrote, and where.
--   * purge_chats(), nightly where pg_cron exists: session chats 30 days
--     after the session ends, group messages after six months.
--   * messages joins the supabase_realtime publication where it exists, so
--     a client can listen for inserts; what it is sent is still filtered by
--     messages_read.
--
-- No private messages, by decision: a chat exists only because people
-- share a session or a group.
-- =====================================================================

-- ------------------------------------------------------------- columns

alter table public.messages
  add column reply_to       uuid references public.messages (id) on delete set null,
  add column removed_by     uuid references public.profiles (id) on delete set null,
  add column removed_reason text check (length(removed_reason) <= 120),
  add column pinned_at      timestamptz,
  add column pinned_by      uuid references public.profiles (id) on delete set null;

comment on column public.messages.removed_by is
  'Who soft-deleted it: the author, the chat''s organizer or the team. Read by staff only. See 0040.';
comment on column public.messages.removed_reason is
  'The rule a removed message broke, as shown to its author. See 0040.';

create index messages_pinned_idx on public.messages (activity_id, community_id)
  where pinned_at is not null and deleted_at is null;

alter table public.communities
  add column chat_mode text not null default 'everyone'
    check (chat_mode in ('everyone', 'organizers'));

comment on column public.communities.chat_mode is
  'everyone | organizers: who may write in the group chat. Set by set_chat_mode(). See 0040.';

create table public.chat_state (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  activity_id  uuid references public.activities (id) on delete cascade,
  community_id uuid references public.communities (id) on delete cascade,
  notify       text not null default 'replies' check (notify in ('all', 'replies', 'muted')),
  last_read_at timestamptz,
  constraint chat_state_one_scope check (
    (activity_id is not null and community_id is null) or
    (activity_id is null and community_id is not null)
  )
);

create unique index chat_state_activity_idx  on public.chat_state (user_id, activity_id)  where activity_id is not null;
create unique index chat_state_community_idx on public.chat_state (user_id, community_id) where community_id is not null;

comment on table public.chat_state is
  'Per person and chat: last read, and which notices (all | replies | muted). Owner-readable; written by RPC. See 0040.';

alter table public.chat_state enable row level security;
revoke all on public.chat_state from anon, authenticated;
grant select on public.chat_state to authenticated;

create policy chat_state_own on public.chat_state
  for select to authenticated
  using (user_id = auth.uid());

-- -------------------------------------------------------- client writes

revoke insert, update on public.messages from authenticated;
drop policy messages_insert on public.messages;
drop policy messages_update_own on public.messages;

-- -------------------------------------------------------------- helpers

-- Who may read a chat. The same answer messages_read gives, as a function
-- the RPCs can ask.
create or replace function public.can_read_chat(p_activity_id uuid, p_community_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_activity_id is not null and p_community_id is null then
      public.is_activity_participant(p_activity_id, p_user_id)
      or public.is_activity_organizer(p_activity_id, p_user_id)
    when p_community_id is not null and p_activity_id is null then
      public.is_community_member(p_community_id, p_user_id)
    else false
  end;
$$;

-- Who organizes a chat: the session's organizer, or a group's organizers
-- and owner.
create or replace function public.is_chat_organizer(p_activity_id uuid, p_community_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_activity_id is not null then public.is_activity_organizer(p_activity_id, p_user_id)
    when p_community_id is not null then public.is_community_organizer(p_community_id, p_user_id)
    else false
  end;
$$;

-- When a session chat stops taking messages. Null for a group: it does not
-- close. A cancelled session closes at once: there is nothing left to
-- arrange, and the cancellation notice already said why.
create or replace function public.chat_closes_at(p_activity_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when a.status = 'cancelled' then coalesce(a.cancelled_at, now())
    else a.ends_at + interval '24 hours'
  end
    from public.activities a
   where a.id = p_activity_id;
$$;

-- What a chat is called in a notice and in «Tus chats».
create or replace function public.chat_title(p_activity_id uuid, p_community_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select a.title from public.activities a where a.id = p_activity_id),
    (select c.name from public.communities c where c.id = p_community_id)
  );
$$;

revoke all on function public.can_read_chat(uuid, uuid, uuid)     from public, anon, authenticated;
revoke all on function public.is_chat_organizer(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.chat_closes_at(uuid)                from public, anon, authenticated;
revoke all on function public.chat_title(uuid, uuid)              from public, anon, authenticated;

-- ---------------------------------------------------------- send_message

create or replace function public.send_message(
  p_activity_id  uuid,
  p_community_id uuid,
  p_body         text,
  p_reply_to     uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user      uuid := auth.uid();
  v_body      text := btrim(coalesce(p_body, ''));
  v_org       boolean;
  v_reply     public.messages%rowtype;
  v_id        uuid;
  v_at        timestamptz;
  v_title     text;
  v_name      text;
  v_scope     jsonb;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  -- The insert trigger from 0020 would refuse too, but only after the checks
  -- below had answered «you are not in this chat» to somebody who is.
  if public.is_suspended_id(v_user) then
    raise exception 'tu cuenta está suspendida' using errcode = '42501';
  end if;
  if (p_activity_id is null) = (p_community_id is null) then
    raise exception 'Un mensaje va a una sesión o a un grupo.' using errcode = '22023';
  end if;
  if v_body = '' then
    raise exception 'Escribe algo antes de enviar.' using errcode = '22023';
  end if;
  if length(v_body) > 2000 then
    raise exception 'Un mensaje puede tener hasta 2000 caracteres.' using errcode = '22023';
  end if;

  if not public.can_read_chat(p_activity_id, p_community_id, v_user) then
    raise exception 'Solo quienes van o son del grupo pueden escribir aquí.' using errcode = '42501';
  end if;

  v_org := public.is_chat_organizer(p_activity_id, p_community_id, v_user);

  if p_activity_id is not null then
    if public.chat_closes_at(p_activity_id) <= now() then
      raise exception 'Este chat ya se cerró.' using errcode = '22023';
    end if;
  elsif not v_org and exists (
    select 1 from public.communities c
     where c.id = p_community_id and c.chat_mode = 'organizers'
  ) then
    raise exception 'En este grupo solo escriben quienes organizan.' using errcode = '42501';
  end if;

  -- A flood guard, not a policy: thirty messages in a minute is a script or
  -- a stuck button, and either way the other people's phones pay for it.
  if (select count(*) from public.messages m
       where m.author_id = v_user and m.created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Vas muy rápido. Espera un momento.' using errcode = '54000';
  end if;

  if p_reply_to is not null then
    select * into v_reply from public.messages where id = p_reply_to;
    if not found
       or v_reply.deleted_at is not null
       or v_reply.activity_id  is distinct from p_activity_id
       or v_reply.community_id is distinct from p_community_id then
      raise exception 'Ese mensaje ya no está en este chat.' using errcode = '22023';
    end if;
  end if;

  -- clock_timestamp(), not now(): the feed is ordered by this column, and
  -- now() is the same for every statement in a transaction.
  insert into public.messages (activity_id, community_id, author_id, body, reply_to, created_at)
  values (p_activity_id, p_community_id, v_user, v_body, p_reply_to, clock_timestamp())
  returning id, created_at into v_id, v_at;

  -- Writing counts as reading: your own message is never unread for you.
  insert into public.chat_state (user_id, activity_id, community_id, last_read_at)
  values (v_user, p_activity_id, p_community_id, v_at)
  on conflict do nothing;
  update public.chat_state
     set last_read_at = v_at
   where user_id = v_user
     and activity_id  is not distinct from p_activity_id
     and community_id is not distinct from p_community_id;

  -- --------------------------------------------------------- notices
  v_title := public.chat_title(p_activity_id, p_community_id);
  select display_name into v_name from public.profiles where id = v_user;
  v_scope := case when p_activity_id is not null
                  then jsonb_build_object('activity_id', p_activity_id)
                  else jsonb_build_object('community_id', p_community_id) end;

  -- Readers other than the author, minus blocks either way, with what they
  -- asked for. One notice per person: a reply to you beats an organizer's
  -- message, which beats «there is something new».
  with readers as (
    select p.user_id
      from public.activity_participants p
     where p_activity_id is not null
       and p.activity_id = p_activity_id
       and p.status in ('joined', 'waitlisted', 'attended')
    union
    select a.organizer_id from public.activities a
     where p_activity_id is not null and a.id = p_activity_id
    union
    select m.user_id from public.community_members m
     where p_community_id is not null and m.community_id = p_community_id
  ),
  wanted as (
    select r.user_id,
           coalesce(s.notify, 'replies') as notify,
           case
             when v_reply.author_id = r.user_id then 'chat_reply'
             when v_org then 'chat_organizer'
             else 'chat_message'
           end as kind
      from readers r
      left join public.chat_state s
        on s.user_id = r.user_id
       and s.activity_id  is not distinct from p_activity_id
       and s.community_id is not distinct from p_community_id
     where r.user_id <> v_user
       and not public.is_blocked(r.user_id, v_user)
  )
  insert into public.notifications (user_id, type, payload)
  select w.user_id, w.kind,
         v_scope || jsonb_build_object('title', v_title, 'name', v_name, 'message_id', v_id)
    from wanted w
   where w.notify <> 'muted'
     and (w.kind <> 'chat_message' or w.notify = 'all')
     -- «chat_message» is one unread notice per chat, however many arrive.
     and not (w.kind = 'chat_message' and exists (
       select 1 from public.notifications n
        where n.user_id = w.user_id
          and n.type    = 'chat_message'
          and n.read_at is null
          and n.payload @> v_scope
     ));

  return jsonb_build_object('id', v_id, 'created_at', v_at);
end;
$$;

comment on function public.send_message(uuid, uuid, text, uuid) is
  'Writes a message to a session or group chat the caller belongs to, and its notices. '
  'Refuses a closed session chat and, in an organizers-only group, members. See 0040.';

-- -------------------------------------------------------- remove_message

create or replace function public.remove_message(p_message_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_msg    public.messages%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_msg from public.messages where id = p_message_id for update;
  if not found then
    raise exception 'Ese mensaje no existe.' using errcode = 'P0002';
  end if;
  if v_msg.deleted_at is not null then
    return;
  end if;

  -- Taking back your own message: no reason, no notice, no marker.
  if v_msg.author_id = v_user then
    update public.messages
       set deleted_at = now(), removed_by = v_user, pinned_at = null, pinned_by = null
     where id = p_message_id;
    return;
  end if;

  if not (public.is_chat_organizer(v_msg.activity_id, v_msg.community_id, v_user)
          or public.is_staff()) then
    raise exception 'Solo quien organiza puede quitar mensajes de otras personas.' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'Elige la regla que no cumple: es lo que le decimos a quien lo escribió.'
      using errcode = '22023';
  end if;
  if length(v_reason) > 120 then
    raise exception 'La regla tiene que caber en 120 caracteres.' using errcode = '22023';
  end if;

  update public.messages
     set deleted_at     = now(),
         removed_by     = v_user,
         removed_reason = v_reason,
         pinned_at      = null,
         pinned_by      = null
   where id = p_message_id;

  -- The rule, never who: in a group of eight, «quien organiza» is enough.
  if v_msg.author_id is not null then
    insert into public.notifications (user_id, type, payload)
    values (v_msg.author_id, 'chat_message_removed',
            case when v_msg.activity_id is not null
                 then jsonb_build_object('activity_id', v_msg.activity_id)
                 else jsonb_build_object('community_id', v_msg.community_id) end
            || jsonb_build_object(
                 'title',  public.chat_title(v_msg.activity_id, v_msg.community_id),
                 'reason', v_reason));
  end if;
end;
$$;

comment on function public.remove_message(uuid, text) is
  'The author takes back a message, or the chat''s organizer or staff removes one with the rule it breaks; '
  'the author is told the rule and not who. See 0040.';

-- ----------------------------------------------------------- pin_message

create or replace function public.pin_message(p_message_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_msg  public.messages%rowtype;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_msg from public.messages where id = p_message_id for update;
  if not found or v_msg.deleted_at is not null then
    raise exception 'Ese mensaje ya no está.' using errcode = 'P0002';
  end if;
  if not public.is_chat_organizer(v_msg.activity_id, v_msg.community_id, v_user) then
    raise exception 'Solo quien organiza puede fijar mensajes.' using errcode = '42501';
  end if;

  if not coalesce(p_pinned, false) then
    update public.messages set pinned_at = null, pinned_by = null where id = p_message_id;
    return;
  end if;
  if v_msg.pinned_at is not null then
    return;
  end if;

  -- Serialise pins in one chat so two organizers cannot both pin the third.
  if v_msg.activity_id is not null then
    perform 1 from public.activities where id = v_msg.activity_id for update;
  else
    perform 1 from public.communities where id = v_msg.community_id for update;
  end if;

  if (select count(*) from public.messages m
       where m.activity_id  is not distinct from v_msg.activity_id
         and m.community_id is not distinct from v_msg.community_id
         and m.pinned_at is not null
         and m.deleted_at is null) >= 3 then
    raise exception 'Ya hay 3 mensajes fijados. Quita uno primero.' using errcode = '22023';
  end if;

  update public.messages set pinned_at = now(), pinned_by = v_user where id = p_message_id;
end;
$$;

comment on function public.pin_message(uuid, boolean) is
  'Pins or unpins a message; the chat''s organizers only; at most three pinned per chat. See 0040.';

-- --------------------------------------------------------- set_chat_mode

create or replace function public.set_chat_mode(p_community_id uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('everyone', 'organizers') then
    raise exception 'Elige quién puede escribir.' using errcode = '22023';
  end if;
  if not public.is_community_organizer(p_community_id, auth.uid()) then
    raise exception 'Solo quien organiza el grupo puede cambiar esto.' using errcode = '42501';
  end if;

  update public.communities set chat_mode = p_mode where id = p_community_id;
end;
$$;

comment on function public.set_chat_mode(uuid, text) is
  'everyone | organizers: who writes in a group chat. Group organizers and owner only. See 0040.';

-- ------------------------------------------------ notices and read state

create or replace function public.set_chat_notifications(p_activity_id uuid, p_community_id uuid, p_level text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_level is null or p_level not in ('all', 'replies', 'muted') then
    raise exception 'Esa opción de avisos no existe.' using errcode = '22023';
  end if;
  if not public.can_read_chat(p_activity_id, p_community_id, v_user) then
    raise exception 'Ese chat no es tuyo.' using errcode = '42501';
  end if;

  insert into public.chat_state (user_id, activity_id, community_id, notify)
  values (v_user, p_activity_id, p_community_id, p_level)
  on conflict do nothing;
  update public.chat_state
     set notify = p_level
   where user_id = v_user
     and activity_id  is not distinct from p_activity_id
     and community_id is not distinct from p_community_id;
end;
$$;

create or replace function public.mark_chat_read(p_activity_id uuid, p_community_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_scope jsonb;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not public.can_read_chat(p_activity_id, p_community_id, v_user) then
    raise exception 'Ese chat no es tuyo.' using errcode = '42501';
  end if;

  -- clock_timestamp() for the same reason send_message() stamps with it.
  insert into public.chat_state (user_id, activity_id, community_id, last_read_at)
  values (v_user, p_activity_id, p_community_id, clock_timestamp())
  on conflict do nothing;
  update public.chat_state
     set last_read_at = clock_timestamp()
   where user_id = v_user
     and activity_id  is not distinct from p_activity_id
     and community_id is not distinct from p_community_id;

  -- Opening the chat answers its notices; leaving them unread would keep the
  -- bell lit for something already seen.
  v_scope := case when p_activity_id is not null
                  then jsonb_build_object('activity_id', p_activity_id)
                  else jsonb_build_object('community_id', p_community_id) end;
  update public.notifications
     set read_at = now()
   where user_id = v_user
     and read_at is null
     and type in ('chat_reply', 'chat_organizer', 'chat_message')
     and payload @> v_scope;
end;
$$;

-- ----------------------------------------------------------------- reads

-- One message as the feed shows it. Null for a message the caller must not
-- see at all: blocked either way, a suspended author, or taken back by its
-- own author.
create or replace function public.chat_message_json(p_msg public.messages, p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_msg.deleted_at is not null and p_msg.removed_by is not distinct from p_msg.author_id then null
    when p_msg.deleted_at is not null then jsonb_build_object(
      'id', p_msg.id, 'created_at', p_msg.created_at, 'removed', true)
    when p_msg.author_id is not null
         and (public.is_blocked(p_user, p_msg.author_id) or public.profile_hidden(p_msg.author_id)) then null
    else jsonb_build_object(
      'id',           p_msg.id,
      'created_at',   p_msg.created_at,
      'removed',      false,
      'body',         p_msg.body,
      'is_me',        p_msg.author_id = p_user,
      'is_organizer', p_msg.author_id is not null
                      and public.is_chat_organizer(p_msg.activity_id, p_msg.community_id, p_msg.author_id),
      'pinned_at',    p_msg.pinned_at,
      'author', (select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar_url', p.avatar_url)
                   from public.profiles p where p.id = p_msg.author_id),
      'reply_to', (select jsonb_build_object(
                           'id', r.id,
                           'excerpt', left(r.body, 80),
                           'author_name', rp.display_name)
                     from public.messages r
                     left join public.profiles rp on rp.id = r.author_id
                    where r.id = p_msg.reply_to
                      and r.deleted_at is null
                      and (r.author_id is null or not public.is_blocked(p_user, r.author_id)))
    )
  end;
$$;

revoke all on function public.chat_message_json(public.messages, uuid) from public, anon, authenticated;

create or replace function public.chat_messages(
  p_activity_id  uuid,
  p_community_id uuid,
  p_before       timestamptz default null,
  p_limit        integer     default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_limit  integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_closes timestamptz;
  v_org    boolean;
  v_why    text := null;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not public.can_read_chat(p_activity_id, p_community_id, v_user) then
    raise exception 'Ese chat no es tuyo.' using errcode = '42501';
  end if;

  v_org := public.is_chat_organizer(p_activity_id, p_community_id, v_user);
  if p_activity_id is not null then
    v_closes := public.chat_closes_at(p_activity_id);
    if v_closes <= now() then
      v_why := 'closed';
    end if;
  elsif not v_org and exists (select 1 from public.communities c
                               where c.id = p_community_id and c.chat_mode = 'organizers') then
    v_why := 'organizers_only';
  end if;

  return jsonb_build_object(
    'title',        public.chat_title(p_activity_id, p_community_id),
    'closes_at',    v_closes,
    'can_write',    v_why is null and not public.is_suspended_id(v_user),
    'why_not',      case when public.is_suspended_id(v_user) then 'suspended' else v_why end,
    'is_organizer', v_org,
    'notify', coalesce((select s.notify from public.chat_state s
                         where s.user_id = v_user
                           and s.activity_id  is not distinct from p_activity_id
                           and s.community_id is not distinct from p_community_id), 'replies'),
    -- Newest first; the screen reverses them. A page ends where p_before says.
    'messages', coalesce((
      select jsonb_agg(j order by created_at desc)
        from (
          select public.chat_message_json(m, v_user) as j, m.created_at
            from public.messages m
           where m.activity_id  is not distinct from p_activity_id
             and m.community_id is not distinct from p_community_id
             and (p_before is null or m.created_at < p_before)
             and public.chat_message_json(m, v_user) is not null
           order by m.created_at desc
           limit v_limit
        ) page
    ), '[]'::jsonb),
    'pinned', coalesce((
      select jsonb_agg(public.chat_message_json(m, v_user) order by m.pinned_at)
        from public.messages m
       where m.activity_id  is not distinct from p_activity_id
         and m.community_id is not distinct from p_community_id
         and m.pinned_at is not null
         and m.deleted_at is null
         and public.chat_message_json(m, v_user) is not null
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.chat_messages(uuid, uuid, timestamptz, integer) is
  'One page of a chat, newest first, with pinned messages, whether the caller can write and why not. See 0040.';

create or replace function public.my_chats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with chats as (
    -- Sessions the caller goes to or organizes, until their chat is purged.
    select a.id as activity_id, null::uuid as community_id, a.title, a.category_id,
           a.starts_at, public.chat_closes_at(a.id) as closes_at,
           coalesce(p.joined_at, a.created_at) as since
      from public.activities a
      left join public.activity_participants p
        on p.activity_id = a.id and p.user_id = auth.uid()
       and p.status in ('joined', 'waitlisted', 'attended')
     where a.status <> 'draft'
       and a.ends_at > now() - interval '30 days'
       and (p.user_id is not null or a.organizer_id = auth.uid())
    union all
    select null, c.id, c.name, c.category_id, null, null, m.joined_at
      from public.community_members m
      join public.communities c on c.id = m.community_id
     where m.user_id = auth.uid()
  ),
  shaped as (
    select ch.*,
           coalesce(s.notify, 'replies') as notify,
           coalesce(s.last_read_at, ch.since) as read_mark,
           last.msg as last_msg
      from chats ch
      left join public.chat_state s
        on s.user_id = auth.uid()
       and s.activity_id  is not distinct from ch.activity_id
       and s.community_id is not distinct from ch.community_id
      left join lateral (
        select m as msg
          from public.messages m
         where m.activity_id  is not distinct from ch.activity_id
           and m.community_id is not distinct from ch.community_id
           and m.deleted_at is null
           and (m.author_id is null
                or (not public.is_blocked(auth.uid(), m.author_id)
                    and not public.profile_hidden(m.author_id)))
         order by m.created_at desc
         limit 1
      ) last on true
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind',         case when activity_id is not null then 'session' else 'group' end,
           'activity_id',  activity_id,
           'community_id', community_id,
           'title',        title,
           'category_id',  category_id,
           'starts_at',    starts_at,
           'closed',       closes_at is not null and closes_at <= now(),
           'notify',       notify,
           'last', case when (last_msg).id is null then null else jsonb_build_object(
                     'excerpt',     left((last_msg).body, 90),
                     'author_name', (select display_name from public.profiles where id = (last_msg).author_id),
                     'is_me',       (last_msg).author_id = auth.uid(),
                     'created_at',  (last_msg).created_at) end,
           'unread', (select count(*) from public.messages m
                       where m.activity_id  is not distinct from shaped.activity_id
                         and m.community_id is not distinct from shaped.community_id
                         and m.deleted_at is null
                         and m.created_at > read_mark
                         and m.author_id is distinct from auth.uid()
                         and (m.author_id is null
                              or (not public.is_blocked(auth.uid(), m.author_id)
                                  and not public.profile_hidden(m.author_id))))
         ) order by coalesce((last_msg).created_at, starts_at, since) desc), '[]'::jsonb)
    from shaped;
$$;

comment on function public.my_chats() is
  '«Tus chats»: every session and group chat the caller belongs to, with the last line and unread count. See 0040.';

revoke all on function public.send_message(uuid, uuid, text, uuid)               from public, anon;
revoke all on function public.remove_message(uuid, text)                         from public, anon;
revoke all on function public.pin_message(uuid, boolean)                         from public, anon;
revoke all on function public.set_chat_mode(uuid, text)                          from public, anon;
revoke all on function public.set_chat_notifications(uuid, uuid, text)           from public, anon;
revoke all on function public.mark_chat_read(uuid, uuid)                         from public, anon;
revoke all on function public.chat_messages(uuid, uuid, timestamptz, integer)    from public, anon;
revoke all on function public.my_chats()                                         from public, anon;
grant execute on function public.send_message(uuid, uuid, text, uuid)            to authenticated;
grant execute on function public.remove_message(uuid, text)                      to authenticated;
grant execute on function public.pin_message(uuid, boolean)                      to authenticated;
grant execute on function public.set_chat_mode(uuid, text)                       to authenticated;
grant execute on function public.set_chat_notifications(uuid, uuid, text)        to authenticated;
grant execute on function public.mark_chat_read(uuid, uuid)                      to authenticated;
grant execute on function public.chat_messages(uuid, uuid, timestamptz, integer) to authenticated;
grant execute on function public.my_chats()                                      to authenticated;

-- ----------------------------------------------------------------- purge

create or replace function public.purge_chats()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sessions integer;
  v_groups   integer;
begin
  delete from public.messages m
   using public.activities a
   where m.activity_id = a.id
     and a.ends_at < now() - interval '30 days';
  get diagnostics v_sessions = row_count;

  delete from public.messages m
   where m.community_id is not null
     and m.created_at < now() - interval '6 months';
  get diagnostics v_groups = row_count;

  delete from public.chat_state s
   using public.activities a
   where s.activity_id = a.id
     and a.ends_at < now() - interval '30 days';

  return jsonb_build_object('session_messages', v_sessions, 'group_messages', v_groups);
end;
$$;

comment on function public.purge_chats() is
  'Deletes session chats 30 days after the session ends and group messages after six months. Nightly. See 0040.';

revoke all on function public.purge_chats() from public, anon, authenticated;

-- 09:37 UTC is 03:37 in Costa Rica, twenty minutes after the attendance purge.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
    execute $cmd$
      select cron.schedule('purge-chats', '37 9 * * *', 'select public.purge_chats()')
    $cmd$;
  else
    raise notice 'pg_cron is not available here; purge_chats() is not scheduled';
  end if;
end
$$;

-- -------------------------------------------------------------- realtime

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime'
                        and schemaname = 'public' and tablename = 'messages') then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end
$$;
