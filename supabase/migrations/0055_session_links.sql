-- =====================================================================
-- 0055_session_links.sql — movo.app/s/7Q2K9M: a session's invitation link.
--
-- Enlace v1 (2 November board). Until now «Invitar a alguien» sent a
-- sentence that ended «Búscala en Movo», and the friend had to find it. A
-- link opens the session itself, signed out, in the browser:
--
--   * One code per person and session, made on request by somebody who can
--     see the session. Six characters from the alphabet 0046 uses, about a
--     billion codes: guessing is not a way in, and lookups that miss are
--     counted per IP so walking the space is not either.
--   * session_link_preview(code) is open to anon and says which of the
--     board's states the session is in: open, full, cancelled, past (with
--     the next date of its series, if any), group-only, or missing.
--   * It never names who is going — only how many — and a group session
--     shows nothing but that it is one. A code that never existed, a draft,
--     a suspended organizer, and a block either way all read as «missing»,
--     the same as a deleted one.
--   * Joining is join_activity(), as in the app; nothing here joins anybody.
-- =====================================================================

create table public.session_links (
  code        text primary key check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  activity_id uuid not null references public.activities (id) on delete cascade,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (activity_id, created_by)
);

comment on table public.session_links is
  'Invitation links to one session, one per person and session. RPC only. See 0055.';

alter table public.session_links enable row level security;
revoke all on public.session_links from public, anon, authenticated;

-- Lookups that found nothing, per client IP, for ten minutes.
create table public.session_link_misses (
  ip text        not null,
  at timestamptz not null default now()
);

create index session_link_misses_ip_at_idx on public.session_link_misses (ip, at);

alter table public.session_link_misses enable row level security;
revoke all on public.session_link_misses from public, anon, authenticated;

-- ------------------------------------------------------------ make a link

create or replace function public.new_session_link_code()
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
      from (select extensions.gen_random_bytes(6) as b) r,
           generate_series(0, 5) as i;
    exit when not exists (select 1 from public.session_links where code = v_code);
  end loop;
  return v_code;
end;
$$;

revoke all on function public.new_session_link_code() from public, anon, authenticated;

create or replace function public.session_link(p_activity_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_act  public.activities;
  v_code text;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_act from public.activities where id = p_activity_id;
  if not found
     or v_act.status = 'draft'
     or not (
       v_act.organizer_id = v_user
       or v_act.visibility in ('public', 'unlisted')
       or (v_act.community_id is not null and public.is_community_member(v_act.community_id, v_user))
       or exists (select 1 from public.activity_participants p
                   where p.activity_id = p_activity_id and p.user_id = v_user)
     ) then
    raise exception 'activity not found' using errcode = 'P0002';
  end if;

  select code into v_code from public.session_links
   where activity_id = p_activity_id and created_by = v_user;
  if found then
    return v_code;
  end if;

  insert into public.session_links (code, activity_id, created_by)
  values (public.new_session_link_code(), p_activity_id, v_user)
  returning code into v_code;
  return v_code;
end;
$$;

comment on function public.session_link(uuid) is
  'The caller''s invitation code for a session they can see, made on first request. See 0055.';

-- --------------------------------------------------------- read a link

create or replace function public.session_link_preview(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code    text := upper(btrim(coalesce(p_code, '')));
  v_user    uuid := auth.uid();
  v_headers text := nullif(current_setting('request.headers', true), '');
  v_ip      text := '';
  v_link    public.session_links;
  v_act     public.activities;
  v_state   text;
  v_next    jsonb;
  v_missing constant jsonb := jsonb_build_object('state', 'missing');
begin
  -- The edge's own headers first: the first x-forwarded-for entry is
  -- whatever the client chose to send, so it is only the last resort.
  if v_headers is not null then
    v_ip := coalesce(
      nullif(btrim(v_headers::json ->> 'cf-connecting-ip'), ''),
      nullif(btrim(v_headers::json ->> 'x-real-ip'), ''),
      btrim(split_part(coalesce(v_headers::json ->> 'x-forwarded-for', ''), ',', 1))
    );
  end if;

  if v_ip <> '' and (
    select count(*) from public.session_link_misses
     where ip = v_ip and at > now() - interval '10 minutes'
  ) >= 30 then
    return v_missing;
  end if;

  select * into v_link from public.session_links where code = v_code;
  if found then
    select * into v_act from public.activities where id = v_link.activity_id;
  end if;

  if v_link.code is null
     or v_act.id is null
     or v_act.status = 'draft'
     or public.is_suspended_id(v_act.organizer_id)
     or (v_user is not null and public.is_blocked(v_user, v_act.organizer_id)) then
    if v_ip <> '' then
      delete from public.session_link_misses where at < now() - interval '1 day';
      insert into public.session_link_misses (ip) values (v_ip);
    end if;
    return v_missing;
  end if;

  -- A group's session says only that it is one. The id lets a member who
  -- signs in open it; on its own it reads nothing (activities_read, 0003).
  if v_act.visibility = 'community'
     and (v_user is null or not public.is_community_member(v_act.community_id, v_user)) then
    return jsonb_build_object('state', 'group', 'activity_id', v_act.id);
  end if;

  v_state := case
    when v_act.status = 'cancelled' then 'cancelled'
    when v_act.status = 'completed' or v_act.starts_at <= now() then 'past'
    when v_act.max_participants is not null and v_act.joined_count >= v_act.max_participants then 'full'
    else 'open'
  end;

  if v_state = 'past' and v_act.series_id is not null then
    select jsonb_build_object('activity_id', n.id, 'starts_at', n.starts_at)
      into v_next
      from public.activities n
     where n.series_id = v_act.series_id
       and n.status in ('published', 'full')
       and n.starts_at > now()
     order by n.starts_at
     limit 1;
  end if;

  return jsonb_build_object(
    'state',            v_state,
    'activity_id',      v_act.id,
    'series_id',        v_act.series_id,
    'title',            v_act.title,
    'category_id',      v_act.category_id,
    'skill',            v_act.skill,
    'starts_at',        v_act.starts_at,
    'ends_at',          v_act.ends_at,
    'description',      v_act.description,
    'joined_count',     v_act.joined_count,
    'waitlist_count',   v_act.waitlist_count,
    'max_participants', v_act.max_participants,
    'price_minor',      v_act.price_minor,
    'currency',         v_act.currency,
    'venue',            (select l.name from public.locations l where l.id = v_act.location_id),
    'district',         (select l.district from public.locations l where l.id = v_act.location_id),
    'organizer',        (select p.display_name from public.profiles p where p.id = v_act.organizer_id),
    -- First name only: the board's «Andrea te invita».
    'invited_by',       (select split_part(btrim(p.display_name), ' ', 1)
                           from public.profiles p where p.id = v_link.created_by),
    'mine',             (select p.status from public.activity_participants p
                          where p.activity_id = v_act.id and p.user_id = v_user),
    'next',             v_next
  );
end;
$$;

comment on function public.session_link_preview(text) is
  'What movo.app/s/<code> shows, signed out too: the state and the session''s public facts, never who is going. Misses are counted per IP. See 0055.';

revoke all on function public.session_link(uuid)         from public, anon;
revoke all on function public.session_link_preview(text) from public;
grant execute on function public.session_link(uuid)         to authenticated;
-- Signed out too: the link is for somebody who has no account yet.
grant execute on function public.session_link_preview(text) to anon, authenticated;
