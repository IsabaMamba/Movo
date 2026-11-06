-- =====================================================================
-- 0049_notification_preferences.sql — what each person lets Movo tell them.
--
-- Avisos v3 · 6 and its note «Para Kris»: «Se apaga» needs one row of
-- preferences per person, checked before the notice is written. Four kinds
-- can be switched off; everything else is «Siempre» — changes and
-- cancellations of a session you are on, places freed from a waitlist, and
-- anything about your account and safety — because with those off you would
-- show up to a session that was called off, or not know you were suspended.
--
--   reminders    session_reminder                                   (on)
--   invitations  invitation, series_invitation, group_session_published (on)
--   chat         chat_reply, chat_organizer, chat_message           (on)
--   joins        participants_daily                                 (off)
--
-- Only the chat types are written today. The others are in the Avisos v3
-- catalogue and are named here so that whoever adds them gets the switch
-- for free; a type not in the list is always delivered.
--
-- The check is a BEFORE INSERT trigger that drops the row, so the inbox,
-- the unread count and the push (0026, an AFTER INSERT trigger) all agree:
-- a notice switched off is never written, rather than written and hidden.
-- No row means the defaults, so nobody has to be backfilled.
-- =====================================================================

create table public.notification_preferences (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  reminders   boolean     not null default true,
  invitations boolean     not null default true,
  chat        boolean     not null default true,
  joins       boolean     not null default false,
  updated_at  timestamptz not null default now()
);

comment on table public.notification_preferences is
  'Which optional notices a person receives (Avisos v3 · 6). No row = defaults. Enforced by notifications_respect_preferences. See 0049.';

alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from public, anon;
grant select, insert, update on public.notification_preferences to authenticated;

create policy notification_preferences_own on public.notification_preferences
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.notification_wanted(p_user uuid, p_type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_type = 'session_reminder' then coalesce(p.reminders, true)
    when p_type in ('invitation', 'series_invitation', 'group_session_published')
      then coalesce(p.invitations, true)
    when p_type in ('chat_reply', 'chat_organizer', 'chat_message') then coalesce(p.chat, true)
    when p_type = 'participants_daily' then coalesce(p.joins, false)
    else true
  end
  from (select 1) as one
  left join public.notification_preferences p on p.user_id = p_user;
$$;

comment on function public.notification_wanted(uuid, text) is
  'False when the person switched this kind of notice off (0049). Types not listed are always wanted.';

revoke all on function public.notification_wanted(uuid, text) from public, anon, authenticated;

create or replace function public.notifications_respect_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.notification_wanted(new.user_id, new.type) then
    return null;
  end if;
  return new;
end;
$$;

create trigger notifications_respect_preferences
  before insert on public.notifications
  for each row execute function public.notifications_respect_preferences();

revoke all on function public.notifications_respect_preferences() from public, anon, authenticated;
