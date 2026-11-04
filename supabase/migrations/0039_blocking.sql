-- =====================================================================
-- 0039_blocking.sql — block and unblock through RPCs, and reports that
-- say where it happened and how urgent they are.
--
-- 3 November handoff, backend items 4 and 5 (boards Cuenta v1, Perfiles v1,
-- Perfil v3 · Bloqueos, Avisos v3). `blocks` and `is_blocked()` have
-- existed since 0001 and every read already honours them; what was missing
-- is a way to write one that the database owns, a list to undo one, and the
-- one moment a block has to be spoken about.
--
--   * block_user() / unblock_user() are the only writes. 0003 granted
--     INSERT and DELETE on `blocks` straight to clients; nothing in the app
--     used them, and a direct insert skips the checks below (blocking
--     yourself is refused by a constraint, blocking a uuid that is nobody
--     was not refused at all). Both grants are revoked.
--   * my_blocked_people() is the Bloqueos list. It has to be a SECURITY
--     DEFINER function: profiles_read hides a blocked profile from the
--     person who blocked it (0003), which is the whole point of blocking,
--     and also why the list cannot be a join through that policy. It
--     returns the public name and avatar only — never profile_private.
--   * blocked_person_going(activity) answers the session detail's notice,
--     «Alguien que bloqueaste va a esta sesión», with a yes or no. It never
--     says who: the caller blocked them, so the caller already knows, and
--     a name in a response is a name somebody can screenshot.
--   * A trigger tells a participant when somebody they blocked joins a
--     session they are going to (notice `blocked_person_going`). Only in
--     that direction: being told you were blocked is not something Movo
--     ever says. join_activity() already refuses a person whom the
--     organizer blocked, or who blocked the organizer (0002), so the
--     organizer never needs this notice.
--
-- Reports (backend item 5):
--
--   * reports.context_activity_id — the session where a report about a
--     person or a message happened, so a reviewer does not reconstruct it
--     from a uuid. Set by the reporter's client; on delete set null, like
--     reporter_id since 0029.
--   * reports.priority — derived from the reason, stored, so the queue is
--     ordered by an index rather than by a CASE in every read. 0 is about
--     somebody's safety right now (comportamiento, lugar_inseguro,
--     not_eligible); 1 is about whether somebody is who they say
--     (suplantacion, informacion_falsa, enlace); 2 is everything else.
--     The two new reasons, suplantacion and not_eligible, are values of
--     the existing free-text column, so they need no change to it.
-- =====================================================================

-- -------------------------------------------------------------- writes

revoke insert, delete on public.blocks from authenticated;

create or replace function public.block_user(p_user_id uuid)
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
  if p_user_id is null or p_user_id = v_user then
    raise exception 'No puedes bloquearte.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Esa persona ya no está en Movo.' using errcode = 'P0002';
  end if;

  -- Blocking twice is not an error: the button is pressed by somebody who is
  -- upset, possibly twice, and the outcome they want already holds.
  insert into public.blocks (blocker_id, blocked_id)
  values (v_user, p_user_id)
  on conflict (blocker_id, blocked_id) do nothing;
end;
$$;

comment on function public.block_user(uuid) is
  'Blocks a person for the caller. Idempotent; refuses yourself and a person who does not exist. See 0039.';

create or replace function public.unblock_user(p_user_id uuid)
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

  delete from public.blocks
   where blocker_id = v_user and blocked_id = p_user_id;
end;
$$;

comment on function public.unblock_user(uuid) is
  'Removes the caller''s block on a person, if there is one. Nobody is told. See 0039.';

revoke all on function public.block_user(uuid)   from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
grant execute on function public.block_user(uuid)   to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;

-- ---------------------------------------------------------------- reads

create or replace function public.my_blocked_people()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',           p.id,
           'display_name', p.display_name,
           'avatar_url',   p.avatar_url,
           'blocked_at',   b.created_at
         ) order by b.created_at desc), '[]'::jsonb)
    from public.blocks b
    join public.profiles p on p.id = b.blocked_id
   where b.blocker_id = auth.uid();
$$;

comment on function public.my_blocked_people() is
  'The caller''s Bloqueos list: public name, avatar and since when, newest first. See 0039.';

create or replace function public.blocked_person_going(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.activity_participants p
      join public.blocks b on b.blocked_id = p.user_id
     where p.activity_id = p_activity_id
       and p.status = 'joined'
       and b.blocker_id = auth.uid()
  );
$$;

comment on function public.blocked_person_going(uuid) is
  'True when somebody the caller blocked is going to the session. Never says who. See 0039.';

revoke all on function public.my_blocked_people()        from public, anon;
revoke all on function public.blocked_person_going(uuid) from public, anon;
grant execute on function public.my_blocked_people()        to authenticated;
grant execute on function public.blocked_person_going(uuid) to authenticated;

-- --------------------------------------------------------------- notice

create or replace function public.notify_blocked_person_going()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act public.activities%rowtype;
begin
  if new.status <> 'joined' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'joined' then
    return new;
  end if;

  select * into v_act from public.activities where id = new.activity_id;
  if not found or v_act.starts_at <= now() then
    return new;
  end if;

  -- One unread notice per session is enough. Somebody who leaves and joins
  -- again should not make the phone of the person who blocked them buzz
  -- every time.
  insert into public.notifications (user_id, type, payload)
  select b.blocker_id,
         'blocked_person_going',
         jsonb_build_object(
           'activity_id', v_act.id,
           'title',       v_act.title,
           'starts_at',   v_act.starts_at
         )
    from public.blocks b
    join public.activity_participants p
      on p.activity_id = new.activity_id
     and p.user_id     = b.blocker_id
     and p.status      = 'joined'
   where b.blocked_id = new.user_id
     and not exists (
       select 1 from public.notifications n
        where n.user_id = b.blocker_id
          and n.type    = 'blocked_person_going'
          and n.read_at is null
          and n.payload ->> 'activity_id' = new.activity_id::text
     );

  return new;
end;
$$;

revoke all on function public.notify_blocked_person_going() from public, anon, authenticated;

create trigger activity_participants_blocked_person_going
  after insert or update of status on public.activity_participants
  for each row execute function public.notify_blocked_person_going();

-- -------------------------------------------------------------- reports

alter table public.reports
  add column context_activity_id uuid references public.activities (id) on delete set null,
  add column priority smallint not null generated always as (
    case reason
      when 'comportamiento'  then 0
      when 'lugar_inseguro'  then 0
      when 'not_eligible'    then 0
      when 'suplantacion'    then 1
      when 'informacion_falsa' then 1
      when 'enlace'          then 1
      else 2
    end
  ) stored;

comment on column public.reports.context_activity_id is
  'The session where a report about a person or a message happened, if any. See 0039.';
comment on column public.reports.priority is
  '0 safety now, 1 identity and truth, 2 the rest. Derived from reason; the queue orders by it. See 0039.';

create index reports_queue_idx on public.reports (status, priority, created_at);
