-- =====================================================================
-- 0020_suspensions.sql — the team can suspend an account.
--
-- The second power over a report, after 0019's cancelling one session, and
-- the widest: it acts on a person rather than a thing. While a suspension
-- is in force the account
--
--   * cannot create a session or a series, join a session, write in a chat,
--     open a group, join one, or add or edit a venue;
--   * is invisible to everybody but itself and staff: its profile, and every
--     message it wrote;
--   * can still sign in, read its own notices, leave sessions, block people
--     and REPORT. A suspended person can still be the one in danger.
--
-- Suspending also clears the person's calendar, so nobody is left planning
-- around somebody who cannot come: their future sessions are cancelled the
-- way 0019 cancels one (the roster hears "the Movo team cancelled it"),
-- their series stop generating, and their place in other people's future
-- sessions is given up, promoting the waitlist exactly as leave_activity()
-- does. Lifting a suspension restores the account, not the calendar.
--
-- A suspension may have an end (`ends_at`), after which it simply stops
-- applying, or none, in which case it lasts until staff lift it.
--
-- How it is enforced
-- ------------------
-- Writes are refused by a BEFORE trigger on each table a person can create
-- rows in, not by editing each policy and RPC. Triggers fire inside
-- SECURITY DEFINER functions too — join_activity(), the series generator —
-- which bypass RLS as their owner, so a policy alone would have missed them.
-- One trigger function, one list of tables, and 19_suspension_test.sql walks
-- every entry against a control user.
--
-- Reads are hidden by RESTRICTIVE policies on profiles and messages, which
-- AND with the existing permissive ones instead of rewriting them.
--
-- What nobody learns
-- ------------------
-- As in 0019: nothing the suspended person, their rosters or anybody else
-- receives names the report, its reason or the team's note. The note lives
-- in `suspensions.note` and `reports.action_taken`, both staff-only. The
-- suspended person is told that the account is suspended and until when.
--
-- Hiding a profile does tell other users *something*: a person they could
-- see is gone. That is inherent in hiding. What stays closed is asking
-- about an arbitrary id — `is_suspended_id()` is not executable by any
-- client role, and `profile_hidden()` answers only in the negative sense a
-- policy needs, identically for a suspended profile and a blocked one.
-- =====================================================================

-- ---------------------------------------------------------- suspensions

create table public.suspensions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  report_id  uuid references public.reports (id) on delete set null,
  note       text not null check (length(trim(note)) between 1 and 2000),
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  lifted_at  timestamptz,
  lifted_by  uuid references public.profiles (id) on delete set null,
  lift_note  text check (lift_note is null or length(trim(lift_note)) between 1 and 2000),
  constraint suspensions_ends_after_start check (ends_at is null or ends_at > starts_at),
  constraint suspensions_lift_complete check (
    (lifted_at is null and lifted_by is null and lift_note is null)
    or (lifted_at is not null and lift_note is not null)
  )
);

create index suspensions_user_idx on public.suspensions (user_id) where lifted_at is null;

comment on table public.suspensions is
  'Accounts the Movo team has suspended. Readable by staff only; written only '
  'by suspend_account() and lift_suspension(). `note` is the team''s reason '
  'and is never shown to the suspended person or anybody else.';

alter table public.suspensions enable row level security;

-- Every table created after 0003 is granted everything to anon and
-- authenticated by Supabase's default privileges — see the long note in
-- 0012. Revoke first, then hand back only the read staff needs.
revoke all on public.suspensions from anon, authenticated;
grant select on public.suspensions to authenticated;

create policy suspensions_read_staff on public.suspensions
  for select to authenticated
  using (public.is_staff());

-- --------------------------------------------------------- predicates

-- The raw question, about any id. Internal: only SECURITY DEFINER code —
-- the triggers and policy helper below — may ask it. Exposed, it would list
-- every suspended account.
create or replace function public.is_suspended_id(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.suspensions s
     where s.user_id = p_user_id
       and s.lifted_at is null
       and s.starts_at <= now()
       and (s.ends_at is null or s.ends_at > now())
  );
$$;

revoke all on function public.is_suspended_id(uuid) from public, anon, authenticated;

-- What a read policy needs: should the caller be shown this person? Never
-- hides you from yourself, and never hides anybody from staff, who have to
-- be able to name who they suspended.
create or replace function public.profile_hidden(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is distinct from auth.uid()
     and not public.is_staff()
     and public.is_suspended_id(p_user_id);
$$;

revoke all on function public.profile_hidden(uuid) from public;
grant execute on function public.profile_hidden(uuid) to anon, authenticated;

-- ------------------------------------------------------------ writes

-- One function for every table; the argument names the column that holds
-- the person responsible for the row. SECURITY DEFINER so it can ask
-- is_suspended_id(), which no client role may call.
create or replace function public.refuse_if_suspended()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if tg_argv[0] = 'auth.uid()' then
    v_user := auth.uid();
  else
    v_user := (to_jsonb(new) ->> tg_argv[0])::uuid;
  end if;

  if v_user is null or not public.is_suspended_id(v_user) then
    return new;
  end if;

  -- Participation: only becoming part of a session is refused. Leaving,
  -- being cancelled, and a waitlisted place turning into a joined one all
  -- pass — suspend_account() itself writes the first of those.
  if tg_table_name = 'activity_participants' then
    if new.status not in ('interested', 'joined', 'waitlisted')
       or (tg_op = 'UPDATE' and old.status in ('joined', 'waitlisted')) then
      return new;
    end if;
  end if;

  -- Series: switching one off is allowed (suspend_account() does it); any
  -- other change, including switching it back on, is not.
  if tg_table_name = 'activity_series' and tg_op = 'UPDATE' and not new.is_active then
    return new;
  end if;

  raise exception 'tu cuenta está suspendida' using errcode = '42501';
end;
$$;

revoke all on function public.refuse_if_suspended() from public, anon, authenticated;

create trigger activities_refuse_suspended
  before insert on public.activities
  for each row execute function public.refuse_if_suspended('organizer_id');

create trigger activity_series_refuse_suspended
  before insert or update on public.activity_series
  for each row execute function public.refuse_if_suspended('organizer_id');

create trigger activity_participants_refuse_suspended
  before insert or update on public.activity_participants
  for each row execute function public.refuse_if_suspended('user_id');

create trigger messages_refuse_suspended
  before insert on public.messages
  for each row execute function public.refuse_if_suspended('author_id');

create trigger communities_refuse_suspended
  before insert on public.communities
  for each row execute function public.refuse_if_suspended('created_by');

create trigger community_members_refuse_suspended
  before insert on public.community_members
  for each row execute function public.refuse_if_suspended('user_id');

-- Venues: creating one, and editing one you created (locations_update_own).
-- On update the responsible person is whoever is editing, not the creator.
create trigger locations_refuse_suspended_insert
  before insert on public.locations
  for each row execute function public.refuse_if_suspended('created_by');

create trigger locations_refuse_suspended_update
  before update on public.locations
  for each row execute function public.refuse_if_suspended('auth.uid()');

-- ------------------------------------------------------------- reads

create policy profiles_hide_suspended on public.profiles
  as restrictive
  for select to anon, authenticated
  using (not public.profile_hidden(id));

create policy messages_hide_suspended on public.messages
  as restrictive
  for select to authenticated
  using (not public.profile_hidden(author_id));

-- ----------------------------------------------------- suspend_account

create or replace function public.suspend_account(
  p_report_id uuid,
  p_note      text,
  p_ends_at   timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note      text := nullif(trim(coalesce(p_note, '')), '');
  v_report    public.reports%rowtype;
  v_target    uuid;
  v_act       public.activities%rowtype;
  v_promote   uuid;
  v_cancelled integer := 0;
  v_left      integer := 0;
  v_was       public.participation_status;
begin
  if not public.is_staff() then
    raise exception 'solo el equipo de Movo puede suspender una cuenta'
      using errcode = '42501';
  end if;

  if v_note is null then
    raise exception 'escribe por qué se suspende: es lo único que lo va a explicar después'
      using errcode = '22023';
  end if;

  if p_ends_at is not null and p_ends_at <= now() then
    raise exception 'la fecha de fin tiene que ser en el futuro' using errcode = '22023';
  end if;

  select * into v_report from public.reports where id = p_report_id for update;
  if not found then
    raise exception 'reporte no encontrado' using errcode = 'P0002';
  end if;

  if v_report.status in ('actioned', 'dismissed') then
    raise exception 'este reporte ya fue resuelto' using errcode = '22023';
  end if;

  -- Who the report is about.
  case v_report.subject_type
    when 'user' then
      v_target := v_report.subject_id;
    when 'activity' then
      select organizer_id into v_target from public.activities where id = v_report.subject_id;
    when 'message' then
      select author_id into v_target from public.messages where id = v_report.subject_id;
    else
      raise exception 'un reporte sobre un grupo no apunta a una persona' using errcode = '22023';
  end case;

  if v_target is null or not exists (select 1 from public.profiles where id = v_target) then
    raise exception 'la persona reportada ya no existe' using errcode = 'P0002';
  end if;

  if v_target = auth.uid() then
    raise exception 'no puedes suspender tu propia cuenta' using errcode = '22023';
  end if;

  -- Moderating and being moderated are separate. Take somebody out of
  -- `staff` from the panel first, deliberately.
  if exists (select 1 from public.staff where user_id = v_target) then
    raise exception 'esa cuenta es del equipo; sácala de staff antes de suspenderla'
      using errcode = '22023';
  end if;

  -- Serialise suspensions of the same person, so two reviewers acting on two
  -- reports about them cannot both succeed.
  perform 1 from public.profiles where id = v_target for update;

  if public.is_suspended_id(v_target) then
    raise exception 'esa cuenta ya está suspendida' using errcode = '22023';
  end if;

  insert into public.suspensions (user_id, report_id, note, ends_at, created_by)
  values (v_target, v_report.id, v_note, p_ends_at, auth.uid());

  -- Their series stop generating.
  update public.activity_series set is_active = false
   where organizer_id = v_target and is_active;

  -- Their future sessions are cancelled, as 0019 cancels one. They get one
  -- notice about the account below rather than one per session.
  for v_act in
    select * from public.activities
     where organizer_id = v_target
       and status in ('draft', 'published', 'full')
       and starts_at > now()
     for update
  loop
    update public.activities
       set status             = 'cancelled',
           cancelled_at       = now(),
           cancel_reason      = null,
           cancelled_by_staff = true
     where id = v_act.id;

    insert into public.notifications (user_id, type, payload)
    select p.user_id, 'activity_cancelled',
           jsonb_build_object(
             'activity_id', v_act.id,
             'title',       v_act.title,
             'starts_at',   v_act.starts_at,
             'by',          'movo'
           )
      from public.activity_participants p
     where p.activity_id = v_act.id
       and p.status in ('joined', 'waitlisted')
       and p.user_id <> v_target;

    v_cancelled := v_cancelled + 1;
  end loop;

  -- Their place in other people's future sessions is given up, exactly as
  -- leave_activity() gives it up: the next person waiting is promoted and
  -- told. The organizer is not told why; a roster changes all the time.
  for v_act in
    select a.* from public.activities a
      join public.activity_participants p on p.activity_id = a.id
     where p.user_id = v_target
       and p.status in ('joined', 'waitlisted')
       and a.starts_at > now()
       and a.status in ('published', 'full')
     for update of a
  loop
    select status into v_was from public.activity_participants
     where activity_id = v_act.id and user_id = v_target;

    update public.activity_participants
       set status = 'cancelled', cancelled_at = now(), waitlist_pos = null
     where activity_id = v_act.id and user_id = v_target;

    if v_was = 'joined' then
      select user_id into v_promote
        from public.activity_participants
       where activity_id = v_act.id and status = 'waitlisted'
       order by waitlist_pos
       limit 1;

      if v_promote is not null then
        update public.activity_participants
           set status = 'joined', waitlist_pos = null
         where activity_id = v_act.id and user_id = v_promote;

        insert into public.notifications (user_id, type, payload)
        values (v_promote, 'waitlist_promoted',
                jsonb_build_object('activity_id', v_act.id, 'title', v_act.title));
      end if;
    end if;

    perform public.renumber_waitlist(v_act.id);
    v_left := v_left + 1;
  end loop;

  update public.reports
     set status       = 'actioned',
         reviewed_by  = auth.uid(),
         reviewed_at  = now(),
         action_taken = case
                          when p_ends_at is null then 'Cuenta suspendida sin fecha de fin. '
                          else 'Cuenta suspendida hasta el '
                               || to_char(p_ends_at at time zone 'America/Costa_Rica', 'DD/MM/YYYY HH24:MI')
                               || '. '
                        end || v_note
   where id = v_report.id;

  -- To the person: that it is suspended, and until when. Not why, and not
  -- that there was a report.
  insert into public.notifications (user_id, type, payload)
  values (v_target, 'account_suspended', jsonb_build_object('ends_at', p_ends_at));

  insert into public.notifications (user_id, type, payload)
  values (v_report.reporter_id, 'report_resolved',
          jsonb_build_object('report_id', v_report.id));

  return jsonb_build_object('sessions_cancelled', v_cancelled, 'sessions_left', v_left);
end;
$$;

comment on function public.suspend_account(uuid, text, timestamptz) is
  'Staff only. Suspends the person a report is about (the user, the '
  'session''s organizer, or the message''s author) until p_ends_at, or until '
  'lifted when null. Cancels their future sessions, stops their series, '
  'gives up their place in others'' sessions, and marks the report actioned. '
  'Returns {sessions_cancelled, sessions_left}.';

revoke all on function public.suspend_account(uuid, text, timestamptz) from public, anon;
grant execute on function public.suspend_account(uuid, text, timestamptz) to authenticated;

-- ----------------------------------------------------- lift_suspension

create or replace function public.lift_suspension(p_suspension_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_s    public.suspensions%rowtype;
begin
  if not public.is_staff() then
    raise exception 'solo el equipo de Movo puede levantar una suspensión'
      using errcode = '42501';
  end if;

  if v_note is null then
    raise exception 'escribe por qué se levanta' using errcode = '22023';
  end if;

  select * into v_s from public.suspensions where id = p_suspension_id for update;
  if not found then
    raise exception 'suspensión no encontrada' using errcode = 'P0002';
  end if;

  if v_s.lifted_at is not null or (v_s.ends_at is not null and v_s.ends_at <= now()) then
    raise exception 'esa suspensión ya terminó' using errcode = '22023';
  end if;

  update public.suspensions
     set lifted_at = now(), lifted_by = auth.uid(), lift_note = v_note
   where id = v_s.id;

  insert into public.notifications (user_id, type, payload)
  values (v_s.user_id, 'account_restored', '{}'::jsonb);
end;
$$;

comment on function public.lift_suspension(uuid, text) is
  'Staff only. Ends a suspension that is still in force, with a note. '
  'Restores the account, not the sessions the suspension cancelled.';

revoke all on function public.lift_suspension(uuid, text) from public, anon;
grant execute on function public.lift_suspension(uuid, text) to authenticated;

-- -------------------------------------------------------- my_suspension

-- For the suspension screen: whether the caller is suspended, and until
-- when. Nothing else — not the note, not the report.
create or replace function public.my_suspension()
returns table (ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.ends_at
    from public.suspensions s
   where s.user_id = auth.uid()
     and s.lifted_at is null
     and s.starts_at <= now()
     and (s.ends_at is null or s.ends_at > now())
   order by s.ends_at desc nulls first
   limit 1;
$$;

revoke all on function public.my_suspension() from public, anon;
grant execute on function public.my_suspension() to authenticated;
