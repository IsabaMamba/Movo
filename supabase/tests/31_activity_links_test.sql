-- =====================================================================
-- 31_activity_links_test.sql — only checked https links reach a session,
-- only its organizer sets them, and the roster hears when they change.
--
-- The ways this can be wrong, roughly in order of harm:
--
--   1. A link that hides where it goes, or is not https, gets stored.
--   2. Somebody other than the organizer changes a session's links.
--   3. A link changes after people joined and nobody is told.
--   4. A session's links are readable where the session is not.
--   5. The database and src/lib/links.ts disagree on a case.
--
-- The cases in the first block are the same as src/lib/links.test.ts.
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

-- ------------------------------------------------- link_domain() cases

do $$
declare
  r          record;
  v_domain   text;
  v_sqlstate text;
  v_message  text;
begin
  for r in select * from (values
    ('https://www.strava.com/routes/123',      'strava.com'),
    ('https://es.wikiloc.com/rutas/abc?x=1',   'es.wikiloc.com'),
    ('https://maps.app.goo.gl/AbC123',         'maps.app.goo.gl'),
    ('HTTPS://Example.CR/ruta',                'example.cr'),
    ('https://example.com:443/a',              'example.com'),
    ('https://xn--caada-rta.cr/',              'xn--caada-rta.cr'),
    ('  https://example.com  ',                'example.com')
  ) as t(url, domain) loop
    v_domain := public.link_domain(r.url);
    if v_domain is distinct from r.domain then
      raise exception 'FAIL: % gave %, expected %', r.url, v_domain, r.domain;
    end if;
  end loop;

  for r in select * from (values
    ('',                                     'vacío'),
    ('http://example.com',                   'https://'),
    ('javascript:alert(1)',                  'https://'),
    ('https://bit.ly/abc',                   'acortadores'),
    ('https://www.tinyurl.com/abc',          'acortadores'),
    ('https://192.168.0.1/ruta',             'número IP'),
    ('https://[::1]/ruta',                   'número IP'),
    ('https://localhost/ruta',               'número IP'),
    ('https://user:pass@example.com',        'usuario'),
    ('https://example.com:8080/a',           'puerto'),
    ('https://exa mple.com',                 'espacios'),
    ('https://ejemplo.cr/' || repeat('a', 500), 'largo')
  ) as t(url, fragment) loop
    begin
      perform public.link_domain(r.url);
      raise exception 'FAIL: accepted %', r.url;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
      if v_sqlstate = 'P0001' then raise; end if;
      if v_sqlstate <> '22023' or position(r.fragment in v_message) = 0 then
        raise exception 'FAIL: % refused with % «%», expected 22023 mentioning «%»',
          left(r.url, 40), v_sqlstate, v_message, r.fragment;
      end if;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------- setup
--
-- Olga organizes «Ruta 31» (Ana joined) and a cancelled one. Beto is not
-- on anything. A private community session nobody else can read.

insert into auth.users (id, email, raw_user_meta_data) values
  ('a3100000-0000-0000-0000-000000000001', 'olga31@test.cr', '{"display_name":"Olga"}'),
  ('a3100000-0000-0000-0000-000000000002', 'ana31@test.cr',  '{"display_name":"Ana"}'),
  ('a3100000-0000-0000-0000-000000000003', 'beto31@test.cr', '{"display_name":"Beto"}');

insert into public.locations (id, name, geog, is_public_venue, is_verified, created_by) values
  ('b3100000-0000-0000-0000-000000000001', 'Cancha 31',
   extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
   true, true, 'a3100000-0000-0000-0000-000000000001');

insert into public.activities
  (id, organizer_id, category_id, location_id, title, starts_at, ends_at, status, visibility)
values
  ('c3100000-0000-0000-0000-000000000001', 'a3100000-0000-0000-0000-000000000001', 'running',
   'b3100000-0000-0000-0000-000000000001', 'Ruta 31',
   now() + interval '2 days', now() + interval '2 days 1 hour', 'published', 'public'),
  ('c3100000-0000-0000-0000-000000000002', 'a3100000-0000-0000-0000-000000000001', 'running',
   'b3100000-0000-0000-0000-000000000001', 'Cancelada 31',
   now() + interval '2 days', now() + interval '2 days 1 hour', 'cancelled', 'public');

select set_config('request.jwt.claim.sub', 'a3100000-0000-0000-0000-000000000002', true);
select public.join_activity('c3100000-0000-0000-0000-000000000001');

-- Only what the links write is counted below.
delete from public.notifications
 where user_id in (select id from auth.users where email like '%31@test.cr');

-- ------------------------------------------------------------- grants

do $$ begin
  if has_function_privilege('anon', 'public.set_activity_links(uuid, text[])', 'execute') then
    raise exception 'FAIL: anon can set links';
  end if;
  if has_function_privilege('authenticated', 'public.link_domain(text)', 'execute') then
    raise exception 'FAIL: link_domain() is exposed to clients';
  end if;
  if has_table_privilege('authenticated', 'public.activity_links', 'insert')
     or has_table_privilege('authenticated', 'public.activity_links', 'update')
     or has_table_privilege('authenticated', 'public.activity_links', 'delete') then
    raise exception 'FAIL: a client can write activity_links directly';
  end if;
  if (select attribute_schema #> '{properties,route_url}' from public.categories where id = 'running')
       is not null then
    raise exception 'FAIL: route_url is still in Running''s schema';
  end if;
end $$;

-- ------------------------------------------------------- not yours, no

select set_config('request.jwt.claim.sub', 'a3100000-0000-0000-0000-000000000003', true);
set local role authenticated;

do $$
declare v_sqlstate text;
begin
  begin
    perform public.set_activity_links('c3100000-0000-0000-0000-000000000001',
                                      array['https://strava.com/routes/1']);
    raise exception 'FAIL: somebody else set the organizer''s links';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate = 'P0001' then raise; end if;
    if v_sqlstate <> '42501' then
      raise exception 'FAIL: a stranger was refused with %, expected 42501', v_sqlstate;
    end if;
  end;
end $$;

reset role;

-- ------------------------------------------------------- organizer

select set_config('request.jwt.claim.sub', 'a3100000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$
declare
  r          record;
  v_sqlstate text;
begin
  for r in select * from (values
    ('c3100000-0000-0000-0000-000000000001'::uuid,
     array['https://a.cr/1', 'https://b.cr/2', 'https://c.cr/3'], 'three links'),
    ('c3100000-0000-0000-0000-000000000001'::uuid,
     array['https://a.cr/1', 'https://a.cr/1'],                   'a duplicate'),
    ('c3100000-0000-0000-0000-000000000001'::uuid,
     array['https://bit.ly/x'],                                   'a shortener'),
    ('c3100000-0000-0000-0000-000000000002'::uuid,
     array['https://strava.com/routes/1'],                        'a cancelled session')
  ) as t(id, urls, why) loop
    begin
      perform public.set_activity_links(r.id, r.urls);
      raise exception 'FAIL: accepted %', r.why;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate = 'P0001' then raise; end if;
      if v_sqlstate <> '22023' then
        raise exception 'FAIL: % refused with %, expected 22023', r.why, v_sqlstate;
      end if;
    end;
  end loop;
end $$;

-- Two good links, blanks ignored.
select public.set_activity_links('c3100000-0000-0000-0000-000000000001',
  array['https://www.strava.com/routes/123', '', 'https://maps.app.goo.gl/AbC123']);
-- The same set again: nothing changes, nobody is told twice.
select public.set_activity_links('c3100000-0000-0000-0000-000000000001',
  array['https://www.strava.com/routes/123', 'https://maps.app.goo.gl/AbC123']);

reset role;

do $$ begin
  if (select string_agg(position || ':' || domain, ',' order by position)
        from public.activity_links
       where activity_id = 'c3100000-0000-0000-0000-000000000001')
     is distinct from '1:strava.com,2:maps.app.goo.gl' then
    raise exception 'FAIL: the links were not stored in order with their domains';
  end if;
  if (select count(*) from public.notifications
       where user_id = 'a3100000-0000-0000-0000-000000000002'
         and type = 'activity_link_changed'
         and payload ->> 'activity_id' = 'c3100000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'FAIL: Ana was not told once that the links changed';
  end if;
  if exists (select 1 from public.notifications
              where user_id = 'a3100000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: the organizer was notified of their own change';
  end if;
end $$;

-- Removing them all is a change too.
select set_config('request.jwt.claim.sub', 'a3100000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.set_activity_links('c3100000-0000-0000-0000-000000000001', array[]::text[]);
reset role;

do $$ begin
  if exists (select 1 from public.activity_links
              where activity_id = 'c3100000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: an empty list left links behind';
  end if;
  if (select count(*) from public.notifications
       where user_id = 'a3100000-0000-0000-0000-000000000002'
         and type = 'activity_link_changed') <> 2 then
    raise exception 'FAIL: removing the links did not tell Ana';
  end if;
end $$;

-- ------------------------------------------------------------ reading

-- Readable wherever the session is: anon reads a public session's links,
-- and a private one's links are as invisible as the session.
select set_config('request.jwt.claim.sub', 'a3100000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.set_activity_links('c3100000-0000-0000-0000-000000000001',
  array['https://www.strava.com/routes/123']);
reset role;

update public.activities set visibility = 'community'
 where id = 'c3100000-0000-0000-0000-000000000002';
insert into public.activity_links (activity_id, position, url, domain)
values ('c3100000-0000-0000-0000-000000000002', 1, 'https://hidden.cr/x', 'hidden.cr');

-- No JWT at all, as 03 does: otherwise auth.uid() is still Olga, who
-- organizes both sessions and may read them.
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$ begin
  if not exists (select 1 from public.activity_links
                  where activity_id = 'c3100000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: anon cannot read a public session''s links';
  end if;
  if exists (select 1 from public.activity_links
              where activity_id = 'c3100000-0000-0000-0000-000000000002') then
    raise exception 'FAIL: anon can read the links of a session it cannot read';
  end if;
end $$;
reset role;

rollback;
