-- =====================================================================
-- 0044_legal_versions.sql — which terms and privacy notice are in force,
-- who accepted which, and telling everybody when they change.
--
-- 3 November handoff, backend item 10 (boards Legal v1 · 1 and · 6,
-- Avisos v3 `terms_updated`). The text itself is not written yet; this is
-- the machinery it will need on the day it is, so publishing a version is
-- one call rather than a release.
--
--   * consents gains two purposes, `terms` and `privacy`. record_consent()
--     (0030) already takes any purpose but attendance_history, so the app
--     records acceptance exactly as it records the rules: the version shown,
--     the time stamped by the database.
--   * legal_versions is the list of published versions, by date like
--     RULES_VERSION, with the «Qué cambió» summary. Public: the terms are
--     read before there is an account.
--   * publish_legal_version(document, version, summary) — staff only.
--     Records the version and sends `terms_updated` to every account that
--     is not suspended, once.
--   * my_legal_status() answers Legal v1 · 6: for each document, the version
--     in force, the one the caller accepted, and whether they still have to.
--
-- Until the first version is published, my_legal_status() says there is
-- nothing to accept, and the app asks nobody for anything.
-- =====================================================================

alter type public.consent_purpose add value if not exists 'terms';
alter type public.consent_purpose add value if not exists 'privacy';

create table public.legal_versions (
  document     text not null check (document in ('terms', 'privacy')),
  version      text not null check (length(btrim(version)) between 1 and 40),
  summary      text check (summary is null or length(summary) <= 500),
  published_at timestamptz not null default clock_timestamp(),
  published_by uuid references public.profiles (id) on delete set null,
  primary key (document, version)
);

create index legal_versions_latest_idx on public.legal_versions (document, published_at desc);

comment on table public.legal_versions is
  'Published versions of the terms and the privacy notice, newest by published_at. Public. '
  'Written only by publish_legal_version(). See 0044.';

alter table public.legal_versions enable row level security;
revoke all on public.legal_versions from anon, authenticated;
grant select on public.legal_versions to anon, authenticated;

create policy legal_versions_read on public.legal_versions
  for select to anon, authenticated
  using (true);

-- ---------------------------------------------------------- publishing

create or replace function public.publish_legal_version(
  p_document text,
  p_version  text,
  p_summary  text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version  text := nullif(btrim(coalesce(p_version, '')), '');
  v_summary  text := nullif(btrim(coalesce(p_summary, '')), '');
  v_notified integer;
begin
  if not public.is_staff() then
    raise exception 'solo el equipo de Movo puede publicar una versión' using errcode = '42501';
  end if;
  if p_document is null or p_document not in ('terms', 'privacy') then
    raise exception 'el documento es terms o privacy' using errcode = '22023';
  end if;
  if v_version is null or length(v_version) > 40 then
    raise exception 'la versión es una fecha, como 2026-11-04' using errcode = '22023';
  end if;
  if v_summary is null then
    raise exception 'escribe qué cambió: es lo primero que va a leer cada persona' using errcode = '22023';
  end if;
  if exists (select 1 from public.legal_versions where document = p_document and version = v_version) then
    raise exception 'esa versión ya está publicada' using errcode = '22023';
  end if;

  insert into public.legal_versions (document, version, summary, published_by)
  values (p_document, v_version, v_summary, auth.uid());

  insert into public.notifications (user_id, type, payload)
  select p.id, 'terms_updated',
         jsonb_build_object('document', p_document, 'version', v_version)
    from public.profiles p
   where not public.is_suspended_id(p.id);
  get diagnostics v_notified = row_count;

  return v_notified;
end;
$$;

comment on function public.publish_legal_version(text, text, text) is
  'Staff only. Publishes a version of the terms or the privacy notice and tells every account '
  'that is not suspended (terms_updated). See 0044.';

revoke all on function public.publish_legal_version(text, text, text) from public, anon;
grant execute on function public.publish_legal_version(text, text, text) to authenticated;

-- ------------------------------------------------------------- status

create or replace function public.my_legal_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(d.document, jsonb_build_object(
           'current',  cur.version,
           'summary',  cur.summary,
           'published_at', cur.published_at,
           'accepted', acc.version,
           'needs_acceptance', cur.version is not null
                               and not public.consent_in_force(auth.uid(), d.document::public.consent_purpose, cur.version)
         )), '{}'::jsonb)
    from (values ('terms'), ('privacy')) as d(document)
    left join lateral (
      select v.version, v.summary, v.published_at
        from public.legal_versions v
       where v.document = d.document
       order by v.published_at desc
       limit 1
    ) cur on true
    left join lateral (
      select c.version
        from public.consents c
       where c.user_id = auth.uid()
         and c.purpose = d.document::public.consent_purpose
         and c.granted
       order by c.recorded_at desc, c.id desc
       limit 1
    ) acc on true;
$$;

comment on function public.my_legal_status() is
  'For terms and privacy: the version in force, its summary, the one the caller accepted, and '
  'whether they still have to accept. See 0044.';

revoke all on function public.my_legal_status() from public, anon;
grant execute on function public.my_legal_status() to authenticated;
