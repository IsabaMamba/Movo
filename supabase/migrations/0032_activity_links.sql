-- =====================================================================
-- 0032_activity_links.sql — up to two links per session, for every
-- category, checked before anybody can tap them.
--
-- Until now a link was `route_url`, a free string in Running's attribute
-- schema (0004): Running only, never validated, rendered as text. The
-- 16 October handoff (docs/design/handoff-2026-10-16.md, backend item 1)
-- makes it a field of its own: a route on Strava or Wikiloc, a map pin,
-- the club's page. It is temporary — Movo will draw its own routes later —
-- but a link is the one thing in a session that takes a person somewhere
-- Movo does not control, so it gets rules now:
--
--   * https only, on the default port, with no user:password@ part;
--   * a real host name: no IP address, no `localhost`, ASCII only (an
--     internationalised name shows as its xn-- form, which is honest);
--   * no generic link shorteners — the person has to be able to see where
--     they are going before they tap. App links that only open their own
--     app (maps.app.goo.gl, strava.app.link) are not shorteners and pass;
--   * at most two, no duplicates, 500 characters each;
--   * the domain is stored on its own, computed here, so every screen can
--     show it next to the link without parsing anything.
--
-- Written only through set_activity_links(), by the session's organizer,
-- while the session is still ahead (draft, published, full). When the set
-- of links changes and people are already going, each of them gets an
-- `activity_link_changed` notice: a route that moved after you joined is
-- exactly the change you should hear about.
--
-- Read wherever the session itself is readable: the policy asks
-- `activities`, so its RLS — visibility, blocking, suspension — decides.
--
-- Reporting a link uses the existing queue: a report on the session with
-- reason `enlace` (src/lib/activities.ts). No new report subject.
--
-- route_url leaves Running's schema. On 16 October no live session had
-- one, so nothing is moved.
-- =====================================================================

create table public.activity_links (
  activity_id uuid not null references public.activities (id) on delete cascade,
  position    smallint not null check (position in (1, 2)),
  url         text not null check (length(url) between 12 and 500),
  domain      text not null check (length(domain) between 3 and 253),
  created_at  timestamptz not null default now(),
  primary key (activity_id, position)
);

comment on table public.activity_links is
  'Up to two https links per session, with the domain shown beside each. '
  'Written only by set_activity_links(). See 0032.';

revoke all on public.activity_links from anon, authenticated;
grant select on public.activity_links to anon, authenticated;

alter table public.activity_links enable row level security;

-- Readable exactly when the session is: the subquery runs under the
-- reader's own RLS on activities.
create policy activity_links_read on public.activity_links
  for select to anon, authenticated
  using (exists (select 1 from public.activities a where a.id = activity_id));

-- ------------------------------------------------------------ checking

-- Hosts that exist to hide where a link goes. Exact host match on purpose:
-- maps.app.goo.gl is Google Maps' own share link and only opens a map, so
-- goo.gl is refused and its app subdomain is not. Kept short and literal.
create or replace function public.is_link_shortener(p_host text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1
      from unnest(array[
        'bit.ly', 'bitly.com', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd',
        'v.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at', 'rb.gy', 't.ly',
        'tiny.cc', 'lnkd.in', 's.id', 'bl.ink', 'qrco.de', 'shorte.st', 'adf.ly',
        'tiny.one', 'urlz.fr', 'acortar.link'
      ]) as s(domain)
     where p_host = s.domain
  );
$$;

-- The domain to show for a link, or an error saying what is wrong with it,
-- in the words the form shows. src/lib/links.ts applies the same rules
-- before sending, so a person normally never sees these.
create or replace function public.link_domain(p_url text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_url   text := btrim(coalesce(p_url, ''));
  v_match text[];
  v_host  text;
begin
  if v_url = '' then
    raise exception 'El enlace está vacío.' using errcode = '22023';
  end if;
  if length(v_url) > 500 then
    raise exception 'El enlace es demasiado largo.' using errcode = '22023';
  end if;
  if v_url ~ '[[:space:][:cntrl:]]' then
    raise exception 'El enlace no puede tener espacios.' using errcode = '22023';
  end if;
  if lower(left(v_url, 8)) <> 'https://' then
    raise exception 'El enlace tiene que empezar con https://.' using errcode = '22023';
  end if;

  -- Authority: a host, optionally :443. No user@, no other port.
  v_match := regexp_match(v_url, '^[Hh][Tt][Tt][Pp][Ss]://([^/?#]+)([/?#].*)?$');
  if v_match is null then
    raise exception 'Ese enlace no se puede leer.' using errcode = '22023';
  end if;
  v_host := lower(v_match[1]);
  if position('@' in v_host) > 0 then
    raise exception 'El enlace no puede llevar usuario ni contraseña.' using errcode = '22023';
  end if;
  if left(v_host, 1) = '[' then
    raise exception 'Usa la dirección de una página, no un número IP.' using errcode = '22023';
  end if;
  if v_host ~ ':' then
    if v_host !~ ':443$' then
      raise exception 'El enlace no puede usar otro puerto.' using errcode = '22023';
    end if;
    v_host := regexp_replace(v_host, ':443$', '');
  end if;
  v_host := rtrim(v_host, '.');

  -- A name with a dot, ASCII labels, and a top-level domain of letters:
  -- that rules out IPv4 (numeric TLD), IPv6 ([…]) and localhost.
  if v_host !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{1,59})$' then
    raise exception 'Usa la dirección de una página, no un número IP.' using errcode = '22023';
  end if;

  v_host := regexp_replace(v_host, '^www\.', '');
  if public.is_link_shortener(v_host) then
    raise exception 'Los acortadores de enlaces no se aceptan: pega el enlace completo.'
      using errcode = '22023';
  end if;

  return v_host;
end;
$$;

revoke all on function public.is_link_shortener(text) from public, anon, authenticated;
revoke all on function public.link_domain(text) from public, anon, authenticated;

-- ------------------------------------------------------------ writing

create or replace function public.set_activity_links(p_activity_id uuid, p_urls text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_act    public.activities%rowtype;
  v_urls   text[] := array(
    select btrim(u) from unnest(coalesce(p_urls, '{}'::text[])) with ordinality as t(u, n)
     where btrim(coalesce(u, '')) <> ''
     order by n
  );
  v_old    text[];
  v_url    text;
  v_i      integer := 0;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_act from public.activities where id = p_activity_id for update;
  if not found then
    raise exception 'activity not found' using errcode = 'P0002';
  end if;
  if v_act.organizer_id <> v_caller then
    raise exception 'only the organizer can change the links' using errcode = '42501';
  end if;
  if public.is_suspended_id(v_caller) then
    raise exception 'tu cuenta está suspendida' using errcode = '42501';
  end if;
  if v_act.status not in ('draft', 'published', 'full') then
    raise exception 'Esta sesión ya no se puede cambiar.' using errcode = '22023';
  end if;

  if cardinality(v_urls) > 2 then
    raise exception 'Una sesión puede tener hasta dos enlaces.' using errcode = '22023';
  end if;
  if cardinality(v_urls) = 2 and v_urls[1] = v_urls[2] then
    raise exception 'Los dos enlaces son iguales.' using errcode = '22023';
  end if;

  select coalesce(array_agg(url order by position), '{}') into v_old
    from public.activity_links where activity_id = p_activity_id;

  if v_old = v_urls then
    return;
  end if;

  delete from public.activity_links where activity_id = p_activity_id;
  foreach v_url in array v_urls loop
    v_i := v_i + 1;
    insert into public.activity_links (activity_id, position, url, domain)
    values (p_activity_id, v_i, v_url, public.link_domain(v_url));
  end loop;

  -- Everybody already going hears about it; the organizer does not.
  insert into public.notifications (user_id, type, payload)
  select p.user_id, 'activity_link_changed',
         jsonb_build_object('activity_id', p_activity_id, 'title', v_act.title)
    from public.activity_participants p
   where p.activity_id = p_activity_id
     and p.status in ('joined', 'waitlisted')
     and p.user_id <> v_caller;
end;
$$;

revoke all on function public.set_activity_links(uuid, text[]) from public, anon;
grant execute on function public.set_activity_links(uuid, text[]) to authenticated;

comment on function public.set_activity_links(uuid, text[]) is
  'Replaces a session''s links (0 to 2). Organizer only, while the session is '
  'ahead. Validates each with link_domain() and tells the roster when they '
  'change. See 0032.';

-- ------------------------------------------- route_url leaves Running

update public.categories
   set attribute_schema = attribute_schema #- '{properties,route_url}'
 where id = 'running';
