-- =====================================================================
-- 0041_weather_cancel.sql — a water session is cancelled when the CNE
-- declares an alert, and everybody going is told why.
--
-- Deportes v1 · 5 and Normas v4 · 30: surf, kayak and rafting carry three
-- fixed rules, and the third is «si la CNE declara alerta para la zona, la
-- sesión se cancela». 0036 writes the rule into every water session; this
-- is the way to apply it, and the notice the board describes (Avisos v3,
-- `activity_cancelled_weather`).
--
--   * cancel_for_weather(activity, alert) — the session's organizer or the
--     team. Water sessions only: a CNE alert also covers a football match,
--     but there the organizer decides, with cancel_activity() and a reason.
--     The alert is the CNE's own words, «alerta amarilla en el Golfo de
--     Nicoya», shown to everybody going.
--   * cancel_water_sessions_in_zone(zone, until, alert) — the team only.
--     An alert is declared for an area, not a session, so the team cancels
--     every water session in a provincia, cantón or distrito that starts
--     before the alert ends, in one call. Each organizer is told too.
--
-- Both leave cancel_reason as «Alerta de la CNE», so the session detail and
-- the organizer's list say what happened without a new column, and set
-- cancelled_by_staff when the team did it (0019).
-- =====================================================================

create or replace function public.weather_cancel_one(
  p_act      public.activities,
  p_alert    text,
  p_by_staff boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notified integer;
begin
  update public.activities
     set status             = 'cancelled',
         cancelled_at       = now(),
         cancel_reason      = left('Alerta de la CNE' || coalesce(': ' || p_alert, ''), 280),
         cancelled_by_staff = p_by_staff
   where id = (p_act).id;

  insert into public.notifications (user_id, type, payload)
  select p.user_id, 'activity_cancelled_weather',
         jsonb_build_object(
           'activity_id', (p_act).id,
           'title',       (p_act).title,
           'starts_at',   (p_act).starts_at,
           'alert',       p_alert
         )
    from public.activity_participants p
   where p.activity_id = (p_act).id
     and p.status in ('joined', 'waitlisted');
  get diagnostics v_notified = row_count;

  -- When the team cancels, the organizer learns it the same way and for the
  -- same reason. When the organizer cancels, they already know.
  if p_by_staff then
    insert into public.notifications (user_id, type, payload)
    values ((p_act).organizer_id, 'activity_cancelled_weather',
            jsonb_build_object(
              'activity_id', (p_act).id,
              'title',       (p_act).title,
              'starts_at',   (p_act).starts_at,
              'alert',       p_alert,
              'organizer',   true
            ));
  end if;

  return v_notified;
end;
$$;

revoke all on function public.weather_cancel_one(public.activities, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------- one session

create or replace function public.cancel_for_weather(p_activity_id uuid, p_alert text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_act   public.activities%rowtype;
  v_alert text := nullif(btrim(coalesce(p_alert, '')), '');
  v_staff boolean;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if length(v_alert) > 200 then
    raise exception 'La alerta tiene que caber en 200 caracteres.' using errcode = '22023';
  end if;

  select * into v_act from public.activities where id = p_activity_id for update;
  if not found then
    raise exception 'activity not found' using errcode = 'P0002';
  end if;

  v_staff := public.is_staff() and v_act.organizer_id <> v_user;
  if v_act.organizer_id <> v_user and not public.is_staff() then
    raise exception 'Solo quien organiza o el equipo de Movo pueden cancelarla.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.categories k
                  where k.id = v_act.category_id and k.family = 'agua') then
    raise exception 'Solo las sesiones de agua se cancelan por alerta de la CNE. Para las demás, cancélala con un motivo.'
      using errcode = '22023';
  end if;

  if v_act.status = 'cancelled' then
    return 0;
  end if;
  if v_act.status = 'completed' or v_act.ends_at <= now() then
    raise exception 'activity is already over' using errcode = '22023';
  end if;

  return public.weather_cancel_one(v_act, v_alert, v_staff);
end;
$$;

comment on function public.cancel_for_weather(uuid, text) is
  'Cancels a water session for a CNE alert; its organizer or staff. Everybody going gets '
  'activity_cancelled_weather with the alert. See 0041.';

-- ------------------------------------------------------- a whole area

create or replace function public.cancel_water_sessions_in_zone(
  p_zone_code text,
  p_until     timestamptz,
  p_alert     text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alert     text := nullif(btrim(coalesce(p_alert, '')), '');
  v_act       public.activities%rowtype;
  v_sessions  integer := 0;
  v_people    integer := 0;
begin
  if not public.is_staff() then
    raise exception 'solo el equipo de Movo puede cancelar por zona' using errcode = '42501';
  end if;
  if v_alert is null then
    raise exception 'Escribe la alerta como la declaró la CNE: es lo que va a leer cada persona.'
      using errcode = '22023';
  end if;
  if length(v_alert) > 200 then
    raise exception 'La alerta tiene que caber en 200 caracteres.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.zones where code = p_zone_code) then
    raise exception 'Esa zona no existe.' using errcode = '22023';
  end if;
  if p_until is null or p_until <= now() then
    raise exception 'La alerta tiene que terminar en el futuro.' using errcode = '22023';
  end if;

  -- IGN codes nest: a distrito's code starts with its cantón's, which starts
  -- with its provincia's. A prefix match is the whole area.
  for v_act in
    select a.*
      from public.activities a
      join public.categories k on k.id = a.category_id and k.family = 'agua'
      join public.locations l on l.id = a.location_id
     where l.district_code like p_zone_code || '%'
       and a.status in ('draft', 'published', 'full')
       and a.ends_at > now()
       and a.starts_at < p_until
     for update of a
  loop
    v_people   := v_people + public.weather_cancel_one(v_act, v_alert, true);
    v_sessions := v_sessions + 1;
  end loop;

  return jsonb_build_object('sessions_cancelled', v_sessions, 'people_notified', v_people);
end;
$$;

comment on function public.cancel_water_sessions_in_zone(text, timestamptz, text) is
  'Staff only. Cancels every water session in a zone (provincia, cantón or distrito) that starts '
  'before the alert ends, and tells everybody going and each organizer. See 0041.';

revoke all on function public.cancel_for_weather(uuid, text)                          from public, anon;
revoke all on function public.cancel_water_sessions_in_zone(text, timestamptz, text)  from public, anon;
grant execute on function public.cancel_for_weather(uuid, text)                         to authenticated;
grant execute on function public.cancel_water_sessions_in_zone(text, timestamptz, text) to authenticated;
