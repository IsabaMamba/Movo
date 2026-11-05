-- =====================================================================
-- 0046_group_invites.sql — the invitation link of a private group.
--
-- Grupos v1 · 6–7 and v6 · 5. A group «Con invitación» is not listed and
-- could not be joined at all: the join policy (0003) only lets somebody
-- add themselves to a public group. This is the way in:
--
--   * One active link per group, made by whoever organizes it. It lapses
--     after 7 days or after its uses run out (10 by default, at most 100),
--     and can be switched off at any time; making a new one switches off
--     the old one («Desactivar este enlace y crear otro»).
--   * The code is 8 characters from an alphabet without look-alikes, about
--     a trillion combinations: guessing one is not a way in.
--   * invite_preview(code) shows what the invitation screen needs — the
--     group's name, description, sports and rules, and who invites — to
--     anybody holding a valid code, signed in or not, so the person can
--     read the rules before joining. Nothing else, and nothing for an
--     invalid code.
--   * join_group_with_code(code) adds the caller as a member and counts the
--     use. Somebody blocked by, or blocking, whoever organizes the group is
--     told the link no longer works, the same sentence as a lapsed one, so
--     the block is not revealed. A suspended account is refused by the 0020
--     trigger on community_members.
--
-- Everything is an RPC; community_invites takes no client access.
-- =====================================================================

-- Present on Supabase already; stated so a fresh database has it too.
create extension if not exists pgcrypto with schema extensions;

create table public.community_invites (
  community_id uuid primary key references public.communities (id) on delete cascade,
  code         text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  max_uses     integer not null default 10 check (max_uses between 1 and 100),
  uses         integer not null default 0 check (uses >= 0)
);

comment on table public.community_invites is
  'The active invitation link of a group: one per group, 7 days, limited uses. RPC only. See 0046.';

alter table public.community_invites enable row level security;
revoke all on public.community_invites from public, anon, authenticated;

-- ------------------------------------------------------------ helpers

create or replace function public.new_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code     text;
begin
  loop
    select string_agg(substr(v_alphabet, 1 + (get_byte(b, i) % 32), 1), '' order by i)
      into v_code
      from (select extensions.gen_random_bytes(8) as b) r,
           generate_series(0, 7) as i;
    exit when not exists (select 1 from public.community_invites where code = v_code);
  end loop;
  return v_code;
end;
$$;

revoke all on function public.new_invite_code() from public, anon, authenticated;

create or replace function public.invite_json(i public.community_invites)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'code', i.code, 'expires_at', i.expires_at,
    'max_uses', i.max_uses, 'uses', i.uses
  );
$$;

revoke all on function public.invite_json(public.community_invites) from public, anon, authenticated;

-- ------------------------------------------------- the organizer's side

create or replace function public.create_group_invite(p_community_id uuid, p_max_uses integer default 10)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.community_invites;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not public.is_community_organizer(p_community_id, auth.uid()) then
    raise exception 'Solo quien organiza el grupo puede crear el enlace.' using errcode = '42501';
  end if;
  if p_max_uses is null or p_max_uses not between 1 and 100 then
    raise exception 'El enlace sirve para entre 1 y 100 personas.' using errcode = '22023';
  end if;

  insert into public.community_invites (community_id, code, created_by, max_uses)
  values (p_community_id, public.new_invite_code(), auth.uid(), p_max_uses)
  on conflict (community_id) do update
    set code       = excluded.code,
        created_by = excluded.created_by,
        created_at = now(),
        expires_at = now() + interval '7 days',
        max_uses   = excluded.max_uses,
        uses       = 0
  returning * into v_invite;

  return public.invite_json(v_invite);
end;
$$;

create or replace function public.revoke_group_invite(p_community_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not public.is_community_organizer(p_community_id, auth.uid()) then
    raise exception 'Solo quien organiza el grupo puede desactivar el enlace.' using errcode = '42501';
  end if;
  delete from public.community_invites where community_id = p_community_id;
end;
$$;

-- The current link, for whoever organizes; null when there is none or it lapsed.
create or replace function public.group_invite(p_community_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.invite_json(i)
    from public.community_invites i
   where i.community_id = p_community_id
     and public.is_community_organizer(p_community_id, auth.uid())
     and i.expires_at > now()
     and i.uses < i.max_uses;
$$;

-- --------------------------------------------------- the invitee's side

create or replace function public.invite_preview(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'community_id', c.id,
           'slug',         c.slug,
           'name',         c.name,
           'description',  c.description,
           'rules',        c.rules,
           'category_ids', to_jsonb(c.category_ids),
           'is_public',    c.is_public,
           'invited_by',   p.display_name,
           'members',      (select count(*) from public.community_members m where m.community_id = c.id),
           'already',      exists (select 1 from public.community_members m
                                    where m.community_id = c.id and m.user_id = auth.uid())
         )
    from public.community_invites i
    join public.communities c on c.id = i.community_id
    left join public.profiles p on p.id = i.created_by
   where i.code = upper(btrim(coalesce(p_code, '')))
     and i.expires_at > now()
     and i.uses < i.max_uses;
$$;

create or replace function public.join_group_with_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_invite public.community_invites;
  v_group  public.communities;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_invite from public.community_invites
   where code = upper(btrim(coalesce(p_code, '')))
   for update;
  if not found or v_invite.expires_at <= now() or v_invite.uses >= v_invite.max_uses then
    raise exception 'Este enlace ya no sirve. Pídele uno nuevo a quien te lo mandó.' using errcode = '22023';
  end if;

  select * into v_group from public.communities where id = v_invite.community_id;

  if exists (select 1 from public.community_members
              where community_id = v_group.id and user_id = v_user) then
    return jsonb_build_object('slug', v_group.slug, 'already', true);
  end if;

  -- The same sentence as a lapsed link: a block is never revealed.
  if exists (
    select 1 from public.community_members m
     where m.community_id = v_group.id
       and m.role in ('owner', 'organizer')
       and public.is_blocked(v_user, m.user_id)
  ) then
    raise exception 'Este enlace ya no sirve. Pídele uno nuevo a quien te lo mandó.' using errcode = '22023';
  end if;

  insert into public.community_members (community_id, user_id, role)
  values (v_group.id, v_user, 'member');

  update public.community_invites set uses = uses + 1 where community_id = v_group.id;

  return jsonb_build_object('slug', v_group.slug, 'already', false);
end;
$$;

comment on function public.join_group_with_code(text) is
  'Joins the caller to the group of a valid invitation code, as a member, and counts the use. '
  'Refuses lapsed or used-up codes and, with the same sentence, a block with an organizer. See 0046.';

revoke all on function public.create_group_invite(uuid, integer) from public, anon;
revoke all on function public.revoke_group_invite(uuid)          from public, anon;
revoke all on function public.group_invite(uuid)                 from public, anon;
revoke all on function public.join_group_with_code(text)         from public, anon;
revoke all on function public.invite_preview(text)               from public;
grant execute on function public.create_group_invite(uuid, integer) to authenticated;
grant execute on function public.revoke_group_invite(uuid)          to authenticated;
grant execute on function public.group_invite(uuid)                 to authenticated;
grant execute on function public.join_group_with_code(text)         to authenticated;
-- Signed out too: the invitation screen shows the group before sign-in.
grant execute on function public.invite_preview(text)               to anon, authenticated;
