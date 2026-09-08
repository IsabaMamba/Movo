-- =====================================================================
-- 05_report_test.sql — the reporting boundary.
--
-- docs/security.md treats in-app reporting as a blocker for the first public
-- session. A report that silently fails is worse than no button, because the
-- person who sent it stops watching. These assert the two properties the
-- client depends on: a report lands, and it is private to whoever filed it.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('88888888-8888-8888-8888-888888888888', 'rep@test.cr', '{"display_name":"Reporta"}'),
  ('99999999-9999-9999-9999-999999999999', 'otr@test.cr', '{"display_name":"Otra"}');

insert into public.locations (id, name, district, geog, is_public_venue, is_verified)
values (
  'aaaaaaaa-0000-0000-0000-00000000000b',
  'Parque de reporte', 'Mata Redonda',
  extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
  true, true
);

insert into public.activities (
  id, organizer_id, category_id, location_id, title, starts_at, ends_at, status, visibility
) values (
  'bbbbbbbb-0000-0000-0000-00000000000b',
  '99999999-9999-9999-9999-999999999999', 'running',
  'aaaaaaaa-0000-0000-0000-00000000000b', 'Sesión reportable',
  now() + interval '1 day', now() + interval '1 day 1 hour', 'published', 'public'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', true);

-- Written the way createReport() writes it.
insert into public.reports (reporter_id, subject_type, subject_id, reason, details)
values ('88888888-8888-8888-8888-888888888888', 'activity',
        'bbbbbbbb-0000-0000-0000-00000000000b', 'lugar_inseguro', 'El portón estaba cerrado.');

do $$ begin
  if not exists (
    select 1 from public.reports
     where subject_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and status = 'open'
  ) then
    raise exception 'FAIL: a filed report is not readable by the person who filed it';
  end if;
end $$;

-- Reporting in somebody else's name must be refused.
do $$ begin
  begin
    insert into public.reports (reporter_id, subject_type, subject_id, reason)
    values ('99999999-9999-9999-9999-999999999999', 'activity',
            'bbbbbbbb-0000-0000-0000-00000000000b', 'spam');
    raise exception 'FAIL: a report was filed under another user id';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

-- ------------------------------------------------------- another user

select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);

do $$ begin
  if exists (
    select 1 from public.reports
     where subject_id = 'bbbbbbbb-0000-0000-0000-00000000000b'
  ) then
    raise exception 'FAIL: somebody else can read a report they did not file';
  end if;
end $$;

reset role;

rollback;
