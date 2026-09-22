-- =====================================================================
-- 0019_moderate_cancel.sql — the team can cancel a reported session.
--
-- 0012 gave the report queue a reader and a way to record a judgement, and
-- said plainly what it did not do: act. This is the first of those powers,
-- and the narrowest — one session, the one a report is about. Hiding a
-- profile and suspending an account are separate powers with a wider blast
-- radius, and they get their own migration.
--
-- moderate_cancel_activity(report, note) does four things in one
-- transaction, so that none can be left half-done:
--
--   1. cancels the session, the same way cancel_activity() in 0008 does;
--   2. tells everybody on the roster — joined and waiting — that it was
--      cancelled, and tells the organizer that Movo cancelled it;
--   3. marks the report `actioned`, stamped with who and when, with the
--      team's note in action_taken;
--   4. tells the reporter their report was reviewed, as resolve_report()
--      does, and nothing more.
--
-- What the organizer and the roster receive is deliberately generic. It
-- carries no report id, no reason and not the team's note. In a session of
-- four, "there was a report" tells the organizer who made it, and the
-- adversary at the top of docs/security.md is exactly a person who would
-- act on that. The note stays in `reports`, which only staff can read.
--
-- Why a column rather than a reason string: the app shows cancel_reason as
-- «Quien organiza escribió», so writing the team's words there would put
-- them in the organizer's mouth. `cancelled_by_staff` lets the app say who
-- cancelled without saying why.
-- =====================================================================

alter table public.activities
  add column cancelled_by_staff boolean not null default false;

comment on column public.activities.cancelled_by_staff is
  'True when the Movo team cancelled the session from a report, through '
  'moderate_cancel_activity(). Says who cancelled, never why: the reason '
  'lives in reports.action_taken, which only staff can read.';

-- 0008 revoked table-level UPDATE on activities, and nothing grants it per
-- column, so no client can set this flag directly. Stated here because a
-- future grant on activities would have to leave this column out.

-- ------------------------------------------------ moderate_cancel_activity

create or replace function public.moderate_cancel_activity(
  p_report_id uuid,
  p_note      text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note     text := nullif(trim(coalesce(p_note, '')), '');
  v_report   public.reports%rowtype;
  v_act      public.activities%rowtype;
  v_notified integer;
begin
  if not public.is_staff() then
    raise exception 'solo el equipo de Movo puede cancelar una sesión reportada'
      using errcode = '42501';
  end if;

  -- The note is the only record of why somebody's session was taken down.
  -- resolve_report() requires one for `actioned` in the app; here the
  -- database requires it, because this call is the action itself.
  if v_note is null then
    raise exception 'escribe por qué se cancela: es lo único que lo va a explicar después'
      using errcode = '22023';
  end if;

  -- Report first, then session, always in that order, so two reviewers on
  -- the same report queue behind one lock instead of deadlocking.
  select * into v_report from public.reports where id = p_report_id for update;
  if not found then
    raise exception 'reporte no encontrado' using errcode = 'P0002';
  end if;

  if v_report.status in ('actioned', 'dismissed') then
    raise exception 'este reporte ya fue resuelto' using errcode = '22023';
  end if;

  if v_report.subject_type <> 'activity' then
    raise exception 'este reporte no es sobre una sesión' using errcode = '22023';
  end if;

  select * into v_act from public.activities where id = v_report.subject_id for update;
  if not found then
    raise exception 'la sesión reportada ya no existe' using errcode = 'P0002';
  end if;

  -- Already cancelled — by its organizer, or by another report about it —
  -- leaves nothing to act on here. The reviewer records the report with
  -- resolve_report() instead, and the roster is not told twice.
  if v_act.status = 'cancelled' then
    raise exception 'la sesión ya está cancelada; resuelve el reporte sin cancelar'
      using errcode = '22023';
  end if;

  if v_act.status = 'completed' then
    raise exception 'la sesión ya pasó y está cerrada' using errcode = '22023';
  end if;

  update public.activities
     set status             = 'cancelled',
         cancelled_at       = now(),
         cancel_reason      = null,
         cancelled_by_staff = true
   where id = v_act.id;

  -- Same recipients as cancel_activity() in 0008. `by` tells the inbox to say
  -- the team cancelled; an older build that ignores it shows "se canceló.
  -- Sin motivo escrito.", which is still true. The organizer cannot be on
  -- their own roster (join_activity refuses them), so excluding them is
  -- belt and braces — they get their own notice below.
  insert into public.notifications (user_id, type, payload)
  select p.user_id,
         'activity_cancelled',
         jsonb_build_object(
           'activity_id', v_act.id,
           'title',       v_act.title,
           'starts_at',   v_act.starts_at,
           'by',          'movo'
         )
    from public.activity_participants p
   where p.activity_id = v_act.id
     and p.status in ('joined', 'waitlisted')
     and p.user_id <> v_act.organizer_id;
  get diagnostics v_notified = row_count;

  insert into public.notifications (user_id, type, payload)
  values (v_act.organizer_id, 'activity_cancelled_by_movo',
          jsonb_build_object(
            'activity_id', v_act.id,
            'title',       v_act.title,
            'starts_at',   v_act.starts_at
          ));

  update public.reports
     set status       = 'actioned',
         reviewed_by  = auth.uid(),
         reviewed_at  = now(),
         action_taken = 'Sesión cancelada por el equipo. ' || v_note
   where id = v_report.id;

  -- Word for word what resolve_report() writes: reviewed, nothing else.
  insert into public.notifications (user_id, type, payload)
  values (v_report.reporter_id, 'report_resolved',
          jsonb_build_object('report_id', v_report.id));

  -- The reporter may be on this very roster, and then hears twice: once
  -- that the session is off, like everybody else, and once that their report
  -- was reviewed. The two are not linked in either payload.

  return v_notified;
end;
$$;

comment on function public.moderate_cancel_activity(uuid, text) is
  'Staff only. Cancels the session a report is about, tells its roster and '
  'organizer without naming the report, and marks the report actioned with '
  'the note — all in one transaction. Returns how many people on the roster '
  'were told.';

revoke all on function public.moderate_cancel_activity(uuid, text) from public, anon;
grant execute on function public.moderate_cancel_activity(uuid, text) to authenticated;
