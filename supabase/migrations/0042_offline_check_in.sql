-- =====================================================================
-- 0042_offline_check_in.sql — «Llegué» without signal.
--
-- 3 November handoff, backend item 7 (board Estados v1 · «Llegué» sin
-- señal). Trailheads, beaches and half the canchas in the country have no
-- signal, and 0033's self_check_in() needs one at the moment of the tap. So
-- the phone keeps the session, the code typed and the time of the tap, and
-- sends them when it reconnects:
--
--   * self_check_in_offline(activity, code, tapped_at) accepts the tap if
--     the tap — not the sync — was inside 0033's window (15 minutes before
--     to 45 after the start) and the organizer has not closed the session
--     yet. The same code, the same five-attempt lock, the same answers.
--   * The time is the phone's, so it is not trusted further than it has
--     to be: a tap «in the future» (beyond two minutes of clock drift) is
--     refused, and the check-in is marked check_in_offline until the
--     organizer confirms it. The roster shows it as «sin señal».
--   * confirm_offline_check_in(activity, person): the organizer, before
--     closing. undo_check_in() (0033) still takes it back instead.
--
-- Closing a session with an unconfirmed offline check-in counts it as
-- attended: the organizer saw it on the roster and did not undo it.
-- =====================================================================

alter table public.activity_participants
  add column check_in_offline boolean not null default false;

comment on column public.activity_participants.check_in_offline is
  'True for a self check-in sent after the fact, until the organizer confirms it. See 0042.';

create or replace function public.self_check_in_offline(
  p_activity_id uuid,
  p_code        text,
  p_tapped_at   timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_act    public.activities%rowtype;
  v_status public.participation_status;
  v_fails  integer;
  v_code   text;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_tapped_at is null or p_tapped_at > now() + interval '2 minutes' then
    raise exception 'La hora de tu llegada no es válida.' using errcode = '22023';
  end if;

  select * into v_act from public.activities where id = p_activity_id for update;
  if not found then
    raise exception 'activity not found' using errcode = 'P0002';
  end if;
  if v_act.status = 'completed' then
    raise exception 'Quien organiza ya cerró la asistencia. Pídele que te marque si llegaste.'
      using errcode = '22023';
  end if;
  if v_act.status not in ('published', 'full') then
    raise exception 'Esta sesión no está abierta para marcar llegadas.' using errcode = '22023';
  end if;
  if p_tapped_at < v_act.starts_at - interval '15 minutes'
     or p_tapped_at > v_act.starts_at + interval '45 minutes' then
    raise exception 'Marcaste fuera del tiempo para marcar tu llegada. Pídele a quien organiza que te marque.'
      using errcode = '22023';
  end if;

  select status into v_status from public.activity_participants
   where activity_id = p_activity_id and user_id = v_caller;
  if v_status = 'attended' then
    return 'already';
  end if;
  if v_status is distinct from 'joined' then
    raise exception 'Solo quien va a esta sesión puede marcar su llegada.' using errcode = '42501';
  end if;

  select failures into v_fails from public.check_in_attempts
   where activity_id = p_activity_id and user_id = v_caller;
  if coalesce(v_fails, 0) >= 5 then
    return 'locked';
  end if;

  select code into v_code from public.check_in_codes where activity_id = p_activity_id;
  if v_code is null then
    raise exception 'Quien organiza todavía no abrió el código de hoy.' using errcode = '22023';
  end if;
  if btrim(coalesce(p_code, '')) <> v_code then
    insert into public.check_in_attempts (activity_id, user_id, failures)
    values (p_activity_id, v_caller, 1)
    on conflict (activity_id, user_id)
      do update set failures = public.check_in_attempts.failures + 1, last_at = now();
    return case when coalesce(v_fails, 0) + 1 >= 5 then 'locked' else 'wrong_code' end;
  end if;

  update public.activity_participants
     set status           = 'attended',
         checked_in_at    = p_tapped_at,
         checked_in_by    = v_caller,
         check_in_offline = true
   where activity_id = p_activity_id and user_id = v_caller;
  return 'checked_in';
end;
$$;

comment on function public.self_check_in_offline(uuid, text, timestamptz) is
  '«Llegué» sent after reconnecting: accepted if the tap was inside the window and the session '
  'is not closed; marked check_in_offline until the organizer confirms. See 0042.';

create or replace function public.confirm_offline_check_in(p_activity_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act public.activities%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_act from public.activities where id = p_activity_id for update;
  if not found then
    raise exception 'activity not found' using errcode = 'P0002';
  end if;
  if v_act.organizer_id <> auth.uid() then
    raise exception 'Solo quien organiza puede confirmar llegadas.' using errcode = '42501';
  end if;

  update public.activity_participants
     set check_in_offline = false
   where activity_id = p_activity_id
     and user_id = p_user_id
     and status = 'attended';
end;
$$;

comment on function public.confirm_offline_check_in(uuid, uuid) is
  'The organizer confirms a check-in sent without signal. See 0042.';

-- undo_check_in() (0033) turns `attended` back into `joined`; the flag
-- has to go with it, or a later organizer check-in would read as offline.
create or replace function public.clear_offline_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'attended' then
    new.check_in_offline := false;
  end if;
  return new;
end;
$$;

revoke all on function public.clear_offline_flag() from public, anon, authenticated;

create trigger activity_participants_clear_offline_flag
  before update of status on public.activity_participants
  for each row execute function public.clear_offline_flag();

revoke all on function public.self_check_in_offline(uuid, text, timestamptz) from public, anon;
revoke all on function public.confirm_offline_check_in(uuid, uuid)          from public, anon;
grant execute on function public.self_check_in_offline(uuid, text, timestamptz) to authenticated;
grant execute on function public.confirm_offline_check_in(uuid, uuid)          to authenticated;
