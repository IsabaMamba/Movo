-- =====================================================================
-- 0012_staff_reports.sql — somebody can read the reports, and resolve them
--
-- `reports` has had its triage index, its resolution columns and its insert
-- policy since 0001, and since #29 the button actually writes rows. What it
-- has never had is a reader. `reports_read_own` lets a person see their own
-- report; no role could see anybody else's, so the queue was reachable only
-- with the service key, which means only from the Supabase panel.
--
-- docs/security.md states the consequence plainly: a report nobody reads is
-- theatre. A person who feels unsafe presses the button, sees an id, and has
-- every reason to believe somebody is looking at it.
--
-- Three pieces here:
--
--   1. `staff` — who is allowed to look. Deliberately a table rather than a
--      column on `profiles`: profiles is world-readable (0003), and who
--      moderates is not something every user should be able to enumerate.
--      No grants at all for anon or authenticated, so membership is assigned
--      from the panel and cannot be read, let alone written, from the app.
--
--   2. `is_staff()` — SECURITY DEFINER, like every other predicate a policy
--      calls. A policy that queried `staff` directly would recurse through
--      that table's own RLS; 0003 hit this and the answer is the same here.
--
--   3. `resolve_report()` — the only way to change a report's state. There
--      is no UPDATE grant, for the same reason participation has none: the
--      invariants are not expressible as a row filter. It stamps who and
--      when, refuses to reopen a resolved report, and writes the reporter a
--      `report_resolved` notification in the same transaction.
--
-- What it deliberately does NOT do: act on the report. Cancelling somebody
-- else's session, hiding a profile and blocking an account are three
-- different powers with three different blast radii, and each needs its own
-- function, its own test and its own decision about who holds it. Recording
-- the judgement and acting on it are separate, and this migration is the
-- first one only.
-- =====================================================================

-- ---------------------------------------------------------------- staff

create table public.staff (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles (id) on delete set null,
  note       text
);

comment on table public.staff is
  'Movo team members who may read and resolve reports. Assigned from the '
  'Supabase panel, never from the app: there are no client grants on this '
  'table at all, so it cannot be read or written with an anon or user key. '
  'docs/product.md defines admin as the Movo team, outside the product.';

alter table public.staff enable row level security;

-- ---------------------------------------------------------------------
-- This revoke is NOT redundant, and the reason is a trap for every future
-- migration.
--
-- 0003 opens with `revoke all on all tables in schema public` — but that
-- applies to the tables that existed when it ran. Supabase also ships
--
--     alter default privileges in schema public
--       grant all on tables to anon, authenticated, service_role;
--
-- which is still in force, so **every table created after 0003 is granted
-- all privileges to anon and authenticated the moment it is created.**
-- `staff` is the first new table since 0003, so it is the first to hit this.
--
-- The first version of this migration relied on the 0003 revoke and said so
-- in a comment. 11_staff_reports_test.sql failed on the line asserting that
-- a user cannot read the staff table — which is exactly the check that was
-- written because the answer mattered, and it turned out the answer was no.
--
-- Any migration that adds a table must revoke explicitly. Deny-by-default
-- is a property of 0003's tables, not of the schema.
-- ---------------------------------------------------------------------

revoke all on public.staff from anon, authenticated;

-- No policy either: with no grant there is nothing for a policy to refine.
-- RLS is enabled anyway so that a grant added by accident later still lands
-- on a table that denies by default rather than one that allows.

-- ------------------------------------------------------------ is_staff

-- No argument, on purpose. A first version took `p_user_id uuid`. A SECURITY
-- DEFINER function that answers "is this id staff?" for any id is an oracle:
-- profiles are world-readable (0003), so walking every profile id through it
-- lists the whole team, which is exactly what keeping `staff` in its own table
-- is meant to prevent. Asking only about the caller answers the one question a
-- policy needs, and nothing else.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and exists (select 1 from public.staff s where s.user_id = auth.uid());
$$;

comment on function public.is_staff() is
  'Whether the caller is Movo staff. SECURITY DEFINER so a policy can call it '
  'without recursing through staff''s own RLS. Takes no argument, so it cannot '
  'be asked about anybody else. False for anon, where auth.uid() is null.';

-- New functions are executable by PUBLIC unless revoked: the same trap as the
-- default table privileges above, one object type over. 0002 revokes from
-- public for every RPC, and the functions in this file follow it.
revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

-- -------------------------------------------------- read the whole queue

create policy reports_read_staff on public.reports
  for select to authenticated
  using (public.is_staff());

-- `reports_read_own` from 0003 stays. Postgres ORs permissive policies, so a
-- reporter keeps seeing their own report and staff see everything.

-- --------------------------------------- read the session that was reported

-- Reading the queue is not enough to work it. `activities_read` admits a
-- public session in published/full/completed, plus your own. A session that
-- was reported and then **cancelled**, or one that is unlisted or
-- community-only, is invisible to a reviewer — and those are precisely the
-- sessions a report is most likely to be about. Without this the queue can
-- name a report and not what it is about.
--
-- Scoped to sessions that are actually the subject of a report, rather than
-- giving staff a key to every row in the table. Moderating something is a
-- reason to see that thing; it is not a reason to see everything.
create policy activities_read_reported on public.activities
  for select to authenticated
  using (
    public.is_staff()
    and exists (
      select 1 from public.reports r
       where r.subject_type = 'activity'
         and r.subject_id   = activities.id
    )
  );

-- --------------------------------------------------------- resolve_report

create or replace function public.resolve_report(
  p_report_id    uuid,
  p_status       public.report_status,
  p_action_taken text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reporter uuid;
  v_current  public.report_status;
begin
  if not public.is_staff() then
    raise exception 'solo el equipo de Movo puede resolver reportes'
      using errcode = '42501';
  end if;

  -- 'open' is the state a report is born in, not one it can be moved back to.
  -- Reopening would erase reviewed_by and reviewed_at, and the audit trail of
  -- who looked at a safety report is the point of having the columns.
  if p_status = 'open' then
    raise exception 'un reporte no vuelve a open; usa reviewing'
      using errcode = '22023';
  end if;

  -- Lock the row before reading its state, so two reviewers resolving the
  -- same report cannot both believe they were first.
  select r.status, r.reporter_id
    into v_current, v_reporter
    from public.reports r
   where r.id = p_report_id
     for update;

  if not found then
    raise exception 'reporte no encontrado' using errcode = 'P0002';
  end if;

  if v_current in ('actioned', 'dismissed') then
    raise exception 'este reporte ya fue resuelto' using errcode = '22023';
  end if;

  update public.reports
     set status       = p_status,
         reviewed_by  = auth.uid(),
         reviewed_at  = now(),
         action_taken = nullif(trim(coalesce(p_action_taken, '')), '')
   where id = p_report_id;

  -- 'reviewing' means somebody picked it up, not that it is finished, so the
  -- reporter hears nothing yet. Telling them "we reviewed it" and then doing
  -- nothing for a week is worse than telling them nothing.
  if p_status in ('actioned', 'dismissed') then
    -- Deliberately says only that it was reviewed. What was decided about
    -- another person is not the reporter's to receive, and a reporter who
    -- learns an account was blocked learns something about that account.
    insert into public.notifications (user_id, type, payload)
    values (v_reporter, 'report_resolved',
            jsonb_build_object('report_id', p_report_id));
  end if;
end;
$$;

comment on function public.resolve_report(uuid, public.report_status, text) is
  'The only way a report changes state — there is no UPDATE grant on '
  'reports, for the same reason participation has none: the rules are not '
  'expressible as a row filter. Stamps reviewed_by from auth.uid() rather '
  'than taking it as an argument, so the record cannot name somebody else.';

revoke all on function public.resolve_report(uuid, public.report_status, text) from public, anon;
grant execute on function public.resolve_report(uuid, public.report_status, text) to authenticated;
