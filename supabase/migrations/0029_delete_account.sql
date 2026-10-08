-- =====================================================================
-- 0029_delete_account.sql — a person can take their data and leave.
--
-- Until now an account could be created and not deleted: no screen, no
-- function, and — it turned out — no working path even for the team, because
-- of the first defect below. Audit of 7 October, item 1; raised by five of
-- its thirteen reviews.
--
-- Two product decisions, taken on 7 October:
--
--   * Messages a person wrote stay, with no author («usuario eliminado»).
--     Removing them would rewrite what everybody else in the chat replied to.
--     The body stays as written; a person who wants a message gone deletes
--     it before deleting the account.
--   * Reports survive, de-identified. A report the person filed loses its
--     reporter; a report about them keeps a subject id that no longer
--     resolves to anybody. Safety keeps the record that something happened
--     and what the team did; nobody can read who it was about.
--
-- Two defects this fixes on the way:
--
--   * reports.reporter_id was `not null` with `on delete set null` since 0001.
--     The two contradict: deleting anybody who had ever filed a report failed
--     with 23502. Nobody had tried.
--   * messages.author_id was `on delete cascade`, which would have taken a
--     person's messages out of other people's conversations — the opposite of
--     the decision above.
--
-- delete_my_account() refuses in two cases, both with a sentence the screen
-- shows as is:
--
--   * while a suspension is in force. Deleting would erase the suspension and
--     the same email could sign up again the next minute. The person writes
--     to the team instead. (The legal side of this is in Alejandro's notes.)
--   * while the account is on `staff`. The rota is small enough that removing
--     somebody from it should be a decision, not a side effect.
--
-- Everything else is done for the person, in one transaction, so nobody is
-- left holding a half-deleted account:
--
--   1. Their series stop, and their future sessions are cancelled. Everybody
--      on those rosters gets one notice — `by: 'gone'`, and no activity id,
--      because the session itself is about to be deleted.
--   2. Their place in other people's future sessions is given up exactly as
--      leave_activity() gives it up: the next person waiting is promoted.
--   3. A group they own passes to an organizer of it, or failing one to its
--      longest-standing member, who is told. A group with nobody else in it
--      is deleted.
--   4. The auth.users row is deleted. Everything else follows from the
--      foreign keys: what is theirs cascades (profile, private profile,
--      sessions, series, memberships, notifications, history, push devices),
--      and what is shared keeps its row and loses the name (venues,
--      reports, messages, verifications).
--
-- export_my_data() returns everything about the caller as one JSON value,
-- for the «Descargar mis datos» button. Their own rows, in full; other
-- people's only as ids, never names.
-- =====================================================================

-- ------------------------------------------------------- the two defects

alter table public.reports alter column reporter_id drop not null;

alter table public.messages alter column author_id drop not null;
alter table public.messages drop constraint messages_author_id_fkey;
alter table public.messages
  add constraint messages_author_id_fkey
  foreign key (author_id) references public.profiles (id) on delete set null;

-- --------------------------------------------------------- deleting

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_act     public.activities%rowtype;
  v_group   record;
  v_heir    uuid;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Serialise against suspend_account(), which locks the same row: a
  -- suspension cannot land between the check below and the delete.
  perform 1 from public.profiles where id = v_user for update;

  if public.is_suspended_id(v_user) then
    raise exception 'Mientras tu cuenta está suspendida no puedes borrarla. Escríbele al equipo de Movo.'
      using errcode = '22023';
  end if;

  if exists (select 1 from public.staff where user_id = v_user) then
    raise exception 'Tu cuenta es del equipo de Movo. Pide que te saquen del equipo antes de borrarla.'
      using errcode = '22023';
  end if;

  -- 1. Their own sessions.
  update public.activity_series set is_active = false
   where organizer_id = v_user and is_active;

  for v_act in
    select * from public.activities
     where organizer_id = v_user
       and status in ('draft', 'published', 'full')
       and starts_at > now()
     for update
  loop
    insert into public.notifications (user_id, type, payload)
    select p.user_id, 'activity_cancelled',
           jsonb_build_object(
             'title',     v_act.title,
             'starts_at', v_act.starts_at,
             'by',        'gone'
           )
      from public.activity_participants p
     where p.activity_id = v_act.id
       and p.status in ('joined', 'waitlisted')
       and p.user_id <> v_user;
  end loop;

  -- 2. Their place in other people's sessions.
  for v_act in
    select a.* from public.activities a
      join public.activity_participants p on p.activity_id = a.id
     where p.user_id = v_user
       and p.status in ('joined', 'waitlisted')
       and a.organizer_id <> v_user
       and a.starts_at > now()
       and a.status in ('published', 'full')
  loop
    perform public.leave_activity(v_act.id);
  end loop;

  -- 3. Groups they own.
  for v_group in
    select c.id, c.name from public.communities c
      join public.community_members m on m.community_id = c.id
     where m.user_id = v_user and m.role = 'owner'
     for update of c
  loop
    -- Somebody else already owns it too: nothing to hand over.
    continue when exists (
      select 1 from public.community_members
       where community_id = v_group.id and role = 'owner' and user_id <> v_user
    );

    select user_id into v_heir
      from public.community_members
     where community_id = v_group.id and user_id <> v_user
     order by (role = 'organizer') desc, joined_at, user_id
     limit 1;

    if v_heir is null then
      delete from public.communities where id = v_group.id;
    else
      update public.community_members set role = 'owner'
       where community_id = v_group.id and user_id = v_heir;

      insert into public.notifications (user_id, type, payload)
      values (v_heir, 'group_handed_over',
              jsonb_build_object('community_id', v_group.id, 'name', v_group.name));
    end if;
  end loop;

  -- 4. The account. Everything else follows from the foreign keys.
  delete from auth.users where id = v_user;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'Deletes the caller''s account. Refuses while suspended or on staff. Cancels '
  'their future sessions, gives up their places, hands their groups over. '
  'Messages stay without an author; reports stay without the person. See 0029.';

-- --------------------------------------------------------- exporting

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
  'ids. See 0029.';
