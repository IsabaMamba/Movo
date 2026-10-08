-- =====================================================================
-- 0030_consents.sql — what each person agreed to, which text, and when.
--
-- Until now only the attendance history recorded its consent (0021: a
-- timestamp and the notice version). Accepting the community rules at
-- sign-up, switching push on, and letting «Cerca de mí» read the device's
-- location recorded nothing. "They agreed" could not be turned into "they
-- agreed to this text, on this date". Audit of 7 October, item 10.
--
-- `consents` is a log, not a state: one row each time somebody grants or
-- withdraws, never updated, never deleted except with the account. What is
-- in force now is the latest row per purpose. A log is what answers the
-- question a regulator or a person actually asks — what had I agreed to on
-- the day this happened? — and a state table would have overwritten it.
--
-- Four purposes, written four ways:
--
--   * rules              — at sign-up, by handle_new_user(), from the
--                          `rules_version` the form sends in the user
--                          metadata. The client says which text it showed;
--                          the database stamps the time. Accounts created
--                          before this migration have no row: their version
--                          is unknown, and inventing one is the thing this
--                          table exists not to do.
--   * location, push     — by the app through record_consent(), when the
--                          person grants it on the device (and, for push,
--                          when they switch it off).
--   * attendance_history — by a trigger on 0021's consent table, so the log
--                          cannot disagree with the gate that actually
--                          decides whether history is written. The client
--                          cannot write this purpose directly.
--
-- record_consent() is idempotent: granting the same version that is already
-- in force writes nothing, so tapping «Cerca de mí» every day is one row,
-- not one a day.
--
-- export_my_data() is replaced to include the log.
-- =====================================================================

create type public.consent_purpose as enum ('rules', 'location', 'push', 'attendance_history');

create table public.consents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  purpose     public.consent_purpose not null,
  -- Which text the person was shown. Null only for a withdrawal, which is
  -- of whatever was in force.
  version     text check (version is null or length(btrim(version)) between 1 and 40),
  granted     boolean not null,
  -- clock_timestamp(), not now(): two rows in one transaction must still
  -- have an order, or "the latest row" is a coin toss.
  recorded_at timestamptz not null default clock_timestamp(),
  constraint consents_grant_has_version check (not granted or version is not null)
);

create index consents_user_idx on public.consents (user_id, purpose, recorded_at desc);

comment on table public.consents is
  'Append-only log of consents granted and withdrawn, with the text version. '
  'The latest row per (user, purpose) is what is in force. See 0030.';

-- Supabase grants every privilege on a new table to anon and authenticated.
revoke all on public.consents from anon, authenticated;
grant select on public.consents to authenticated;

alter table public.consents enable row level security;

create policy consents_read_own on public.consents
  for select to authenticated
  using (user_id = auth.uid());

-- ------------------------------------------------------------ in force

-- Whether the latest row for this person and purpose is a grant of this version.
create or replace function public.consent_in_force(
  p_user_id uuid,
  p_purpose public.consent_purpose,
  p_version text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select c.granted and c.version = p_version
      from public.consents c
     where c.user_id = p_user_id and c.purpose = p_purpose
     order by c.recorded_at desc, c.id desc
     limit 1
  ), false);
$$;

revoke all on function public.consent_in_force(uuid, public.consent_purpose, text)
  from public, anon, authenticated;

-- ------------------------------------------------------------ writing

create or replace function public.record_consent(
  p_purpose public.consent_purpose,
  p_version text,
  p_granted boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_version text := nullif(btrim(p_version), '');
  v_last    boolean;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_purpose = 'attendance_history' then
    raise exception 'attendance history consent goes through set_attendance_history()'
      using errcode = '42501';
  end if;

  if p_granted and v_version is null then
    raise exception 'a consent needs the version of the text that was shown'
      using errcode = '22023';
  end if;

  if p_granted then
    if public.consent_in_force(v_user, p_purpose, v_version) then
      return;
    end if;
  else
    -- Withdrawing what was never granted, or already withdrawn, is nothing.
    select c.granted into v_last
      from public.consents c
     where c.user_id = v_user and c.purpose = p_purpose
     order by c.recorded_at desc, c.id desc
     limit 1;
    if v_last is distinct from true then
      return;
    end if;
    v_version := null;
  end if;

  insert into public.consents (user_id, purpose, version, granted)
  values (v_user, p_purpose, v_version, p_granted);
end;
$$;

revoke all on function public.record_consent(public.consent_purpose, text, boolean) from public, anon;
grant execute on function public.record_consent(public.consent_purpose, text, boolean) to authenticated;

-- --------------------------------------------------- attendance history

create or replace function public.log_attendance_history_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- Not when the whole account is going (0029): the profile is already
    -- gone in that cascade, the log goes with it, and a row pointing at a
    -- deleted profile would fail the foreign key and abort the deletion.
    if exists (select 1 from public.profiles where id = old.user_id) then
      insert into public.consents (user_id, purpose, version, granted)
      values (old.user_id, 'attendance_history', null, false);
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and new.notice_version = old.notice_version then
    return new;
  end if;

  insert into public.consents (user_id, purpose, version, granted)
  values (new.user_id, 'attendance_history', new.notice_version, true);
  return new;
end;
$$;

revoke all on function public.log_attendance_history_consent() from public, anon, authenticated;

create trigger attendance_history_consent_log
  after insert or update or delete on public.attendance_history_consent
  for each row execute function public.log_attendance_history_consent();

-- What 0021 already holds is real consent with a real version and date.
-- Carried over as it is, so the log starts complete for this purpose.
insert into public.consents (user_id, purpose, version, granted, recorded_at)
select user_id, 'attendance_history', notice_version, true, consented_at
  from public.attendance_history_consent;

-- ------------------------------------------------------------ sign-up

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name  text := trim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  v_rules text := btrim(coalesce(new.raw_user_meta_data ->> 'rules_version', ''));
begin
  -- Sanitize rather than trust: a name that fails the profiles check
  -- constraint would raise here and abort the entire signup transaction.
  if length(v_name) < 2 or length(v_name) > 60 then
    v_name := 'Nuevo usuario';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, v_name)
  on conflict (id) do nothing;

  insert into public.profile_private (id)
  values (new.id)
  on conflict (id) do nothing;

  -- 0030. The sign-up form says which version of /normas it showed. A
  -- missing or malformed one records nothing rather than failing the
  -- sign-up: an account with no rules row is visibly one that never agreed.
  if length(v_rules) between 1 and 40 then
    insert into public.consents (user_id, purpose, version, granted)
    values (new.id, 'rules', v_rules, true);
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------ export

create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'exported_at', now(),
    'account', (
      select jsonb_build_object('email', u.email, 'created_at', u.created_at)
        from auth.users u where u.id = v_user
    ),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_user),
    'private_profile', (select to_jsonb(p) from public.profile_private p where p.id = v_user),
    'interests', coalesce((
      select jsonb_agg(i.category_id order by i.category_id)
        from public.user_interests i where i.user_id = v_user
    ), '[]'::jsonb),
    'sessions_organized', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.starts_at)
        from public.activities a where a.organizer_id = v_user
    ), '[]'::jsonb),
    'series_organized', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at)
        from public.activity_series s where s.organizer_id = v_user
    ), '[]'::jsonb),
    'sessions_joined', coalesce((
      select jsonb_agg(jsonb_build_object(
               'activity_id',   p.activity_id,
               'title',         a.title,
               'starts_at',     a.starts_at,
               'status',        p.status,
               'joined_at',     p.joined_at,
               'cancelled_at',  p.cancelled_at,
               'checked_in_at', p.checked_in_at
             ) order by a.starts_at)
        from public.activity_participants p
        join public.activities a on a.id = p.activity_id
       where p.user_id = v_user
    ), '[]'::jsonb),
    'saved_sessions', coalesce((
      select jsonb_agg(to_jsonb(s)) from public.saved_activities s where s.user_id = v_user
    ), '[]'::jsonb),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
               'community_id', m.community_id,
               'name',         c.name,
               'role',         m.role,
               'joined_at',    m.joined_at
             ) order by m.joined_at)
        from public.community_members m
        join public.communities c on c.id = m.community_id
       where m.user_id = v_user
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.created_at)
        from public.messages m where m.author_id = v_user
    ), '[]'::jsonb),
    'venues_created', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'name', l.name, 'address', l.address,
               'district', l.district, 'created_at', l.created_at
             ) order by l.created_at)
        from public.locations l where l.created_by = v_user
    ), '[]'::jsonb),
    -- Who they blocked, as ids: the other person's name is theirs.
    'blocked', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', b.blocked_id, 'since', b.created_at))
        from public.blocks b where b.blocker_id = v_user
    ), '[]'::jsonb),
    -- What they reported and where it stands. Not what the team did about
    -- another person, and not who reviewed it.
    'reports_filed', coalesce((
      select jsonb_agg(jsonb_build_object(
               'subject_type', r.subject_type, 'subject_id', r.subject_id,
               'reason', r.reason, 'details', r.details,
               'status', r.status, 'created_at', r.created_at
             ) order by r.created_at)
        from public.reports r where r.reporter_id = v_user
    ), '[]'::jsonb),
    -- Dates only. The team's notes name the report, and through it a reporter.
    'suspensions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'starts_at', s.starts_at, 'ends_at', s.ends_at, 'lifted_at', s.lifted_at
             ) order by s.starts_at)
        from public.suspensions s where s.user_id = v_user
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.created_at)
        from public.notifications n where n.user_id = v_user
    ), '[]'::jsonb),
    'attendance_history_consent', (
      select to_jsonb(c) from public.attendance_history_consent c where c.user_id = v_user
    ),
    'attendance_history', coalesce((
      select jsonb_agg(to_jsonb(h) order by h.week_of)
        from public.attendance_history h where h.user_id = v_user
    ), '[]'::jsonb),
    -- 0030. Every grant and withdrawal, with the version of the text.
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object(
               'purpose', c.purpose, 'version', c.version,
               'granted', c.granted, 'recorded_at', c.recorded_at
             ) order by c.recorded_at)
        from public.consents c where c.user_id = v_user
    ), '[]'::jsonb),
    -- Which devices get notices. The keys are a device's secret, not data
    -- about the person, and are left out.
    'push_devices', coalesce((
      select jsonb_agg(jsonb_build_object(
               'service', split_part(split_part(s.endpoint, '://', 2), '/', 1),
               'created_at', s.created_at, 'last_sent_at', s.last_sent_at
             ) order by s.created_at)
        from public.push_subscriptions s where s.user_id = v_user
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

comment on function public.export_my_data() is
  'Everything about the caller as one JSON value. Other people appear only as '
  'ids. See 0029; consents added in 0030.';
