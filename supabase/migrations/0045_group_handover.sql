-- =====================================================================
-- 0045_group_handover.sql — handing a group over, and deleting it.
--
-- Grupos v6 · 5–8 («Si ya no puedes seguir»). Until now a group's owner
-- could only stop by deleting their whole account (0029), which handed
-- the group to the longest-standing organizer without asking anybody.
-- These are the two deliberate ways out:
--
--   * Pasar el grupo. The owner offers it to another member, who accepts
--     or declines within 7 days; nothing changes until they accept. On
--     accept they become the owner and whoever offered it stays in the
--     group as a member. One pending offer per group; a new one replaces
--     it. Each step leaves a notice for the other person.
--   * Eliminar el grupo. The owner only, typing the group's name to
--     confirm. The group's upcoming sessions that were only for the group
--     are cancelled, and everybody going is told; its series stop. Public
--     sessions stay, under whoever organizes them — they never needed the
--     group to be found. Every member is told the group is gone. Then the
--     row goes, and the foreign keys do the rest (members, chat, and the
--     community_id of what stays).
--
-- Everything is an RPC; community_handovers takes no client writes.
-- =====================================================================

create table public.community_handovers (
  community_id uuid primary key references public.communities (id) on delete cascade,
  from_user    uuid not null references public.profiles (id) on delete cascade,
  to_user      uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  check (from_user <> to_user)
);

comment on table public.community_handovers is
  'A pending offer to take over a group, for 7 days. Written by RPCs only. See 0045.';

alter table public.community_handovers enable row level security;
revoke all on public.community_handovers from public, anon, authenticated;

-- ------------------------------------------------------------ helpers

create or replace function public.community_owner(p_community_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select user_id from public.community_members
   where community_id = p_community_id and role = 'owner'
   limit 1;
$$;

revoke all on function public.community_owner(uuid) from public, anon, authenticated;

-- ----------------------------------------------------- offer the group

create or replace function public.hand_over_community(p_community_id uuid, p_to_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_group public.communities;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_group from public.communities where id = p_community_id for update;
  if not found then
    raise exception 'Ese grupo no existe.' using errcode = 'P0002';
  end if;
  if public.community_owner(p_community_id) is distinct from v_user then
    raise exception 'Solo quien creó el grupo puede pasarlo a otra persona.' using errcode = '42501';
  end if;
  if p_to_user is null or p_to_user = v_user then
    raise exception 'Elige a otra persona del grupo.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.community_members
     where community_id = p_community_id and user_id = p_to_user
  ) then
    raise exception 'Solo puedes pasar el grupo a alguien que ya está en él.' using errcode = '22023';
  end if;

  insert into public.community_handovers (community_id, from_user, to_user)
  values (p_community_id, v_user, p_to_user)
  on conflict (community_id) do update
    set from_user  = excluded.from_user,
        to_user    = excluded.to_user,
        created_at = now(),
        expires_at = now() + interval '7 days';

  insert into public.notifications (user_id, type, payload)
  values (p_to_user, 'group_handover_offered',
          jsonb_build_object('community_id', v_group.id, 'name', v_group.name,
                             'slug', v_group.slug, 'expires_at', now() + interval '7 days'));
end;
$$;

-- ------------------------------------------------------ withdraw, answer

create or replace function public.cancel_community_handover(p_community_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if public.community_owner(p_community_id) is distinct from auth.uid() then
    raise exception 'Solo quien creó el grupo puede retirar la oferta.' using errcode = '42501';
  end if;
  delete from public.community_handovers where community_id = p_community_id;
end;
$$;

create or replace function public.answer_community_handover(p_community_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_offer public.community_handovers;
  v_group public.communities;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_offer from public.community_handovers
   where community_id = p_community_id for update;
  if not found or v_offer.to_user <> v_user or v_offer.expires_at <= now() then
    raise exception 'Esa oferta ya no está vigente.' using errcode = '22023';
  end if;

  select * into v_group from public.communities where id = p_community_id for update;

  if p_accept then
    -- The offer is only good while whoever made it still owns the group.
    if public.community_owner(p_community_id) is distinct from v_offer.from_user then
      delete from public.community_handovers where community_id = p_community_id;
      raise exception 'Esa oferta ya no está vigente.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.community_members
                    where community_id = p_community_id and user_id = v_user) then
      delete from public.community_handovers where community_id = p_community_id;
      raise exception 'Ya no estás en el grupo.' using errcode = '22023';
    end if;

    update public.community_members set role = 'member'
     where community_id = p_community_id and user_id = v_offer.from_user;
    update public.community_members set role = 'owner'
     where community_id = p_community_id and user_id = v_user;
  end if;

  delete from public.community_handovers where community_id = p_community_id;

  insert into public.notifications (user_id, type, payload)
  values (v_offer.from_user,
          case when p_accept then 'group_handover_accepted' else 'group_handover_declined' end,
          jsonb_build_object('community_id', v_group.id, 'name', v_group.name, 'slug', v_group.slug));
end;
$$;

-- ---------------------------------------------- what the screen shows

-- For the owner: the pending offer (to whom, until when). For the person
-- offered: the offer itself. For anybody else: null.
create or replace function public.community_handover(p_community_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'to_user',    h.to_user,
           'to_name',    pt.display_name,
           'from_name',  pf.display_name,
           'expires_at', h.expires_at,
           'for_me',     h.to_user = auth.uid()
         )
    from public.community_handovers h
    join public.profiles pt on pt.id = h.to_user
    join public.profiles pf on pf.id = h.from_user
   where h.community_id = p_community_id
     and h.expires_at > now()
     and auth.uid() in (h.from_user, h.to_user);
$$;

-- ------------------------------------------------------ delete a group

create or replace function public.delete_community(p_community_id uuid, p_confirm_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user      uuid := auth.uid();
  v_group     public.communities;
  v_act       public.activities;
  v_cancelled integer := 0;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_group from public.communities where id = p_community_id for update;
  if not found then
    raise exception 'Ese grupo no existe.' using errcode = 'P0002';
  end if;
  if public.community_owner(p_community_id) is distinct from v_user then
    raise exception 'Solo quien creó el grupo puede eliminarlo.' using errcode = '42501';
  end if;
  if lower(btrim(coalesce(p_confirm_name, ''))) <> lower(btrim(v_group.name)) then
    raise exception 'Escribe el nombre del grupo tal como es para confirmar.' using errcode = '22023';
  end if;

  -- 1. The group's own upcoming sessions, and its series.
  update public.activity_series set is_active = false
   where community_id = p_community_id and is_active;

  for v_act in
    select * from public.activities
     where community_id = p_community_id
       and visibility = 'community'
       and status in ('draft', 'published', 'full')
       and starts_at > now()
     for update
  loop
    update public.activities
       set status = 'cancelled', cancelled_at = now(), cancel_reason = null
     where id = v_act.id;

    insert into public.notifications (user_id, type, payload)
    select p.user_id, 'activity_cancelled',
           jsonb_build_object('activity_id', v_act.id, 'title', v_act.title,
                              'starts_at', v_act.starts_at, 'by', 'group_deleted',
                              'group', v_group.name)
      from public.activity_participants p
     where p.activity_id = v_act.id
       and p.status in ('joined', 'waitlisted')
       and p.user_id <> v_user;

    v_cancelled := v_cancelled + 1;
  end loop;

  -- 2. Everybody in it, except whoever deleted it.
  insert into public.notifications (user_id, type, payload)
  select m.user_id, 'group_deleted', jsonb_build_object('name', v_group.name)
    from public.community_members m
   where m.community_id = p_community_id and m.user_id <> v_user;

  -- 3. The group. Members, chat and pending offers go with it; public
  --    sessions and past ones keep existing with community_id null.
  delete from public.communities where id = p_community_id;

  return jsonb_build_object('sessions_cancelled', v_cancelled);
end;
$$;

comment on function public.delete_community(uuid, text) is
  'Owner only, confirmed by the group''s name. Cancels the group-only upcoming sessions '
  'with a notice, stops its series, tells every member, deletes the group. See 0045.';

revoke all on function public.hand_over_community(uuid, uuid)         from public, anon;
revoke all on function public.cancel_community_handover(uuid)         from public, anon;
revoke all on function public.answer_community_handover(uuid, boolean) from public, anon;
revoke all on function public.community_handover(uuid)                from public, anon;
revoke all on function public.delete_community(uuid, text)            from public, anon;
grant execute on function public.hand_over_community(uuid, uuid)         to authenticated;
grant execute on function public.cancel_community_handover(uuid)         to authenticated;
grant execute on function public.answer_community_handover(uuid, boolean) to authenticated;
grant execute on function public.community_handover(uuid)                to authenticated;
grant execute on function public.delete_community(uuid, text)            to authenticated;
