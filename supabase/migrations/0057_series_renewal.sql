-- =====================================================================
-- 0057_series_renewal.sql — «¿Agregas 8 fechas más?», and «¿Sigues?».
--
-- 16 October handoff, and Series v2 · 9–10 (10 November). A series is a
-- run of dates, 8 by default. When it is about to end, Movo asks; it never
-- renews by itself, and nobody is put on new dates without saying yes.
--
--   * offer_series_renewals(), nightly where pg_cron exists: an active
--     series whose last upcoming date is within a month gets one
--     `series_renewal_offer` to its organizer, once per last date.
--   * renew_series(series, count, skip): the organizer adds `count` dates
--     (8 by default, 1 to 12) after the current last one, minus the dates
--     in `skip` (a holiday), the run moving a week for each. Dates are
--     made by generate_series_occurrences() (0002/0005), so a renewed date
--     is exactly like any other.
--   * Everybody on all the upcoming dates — the people «on the whole
--     series», since 0048 has no membership table — gets `series_renewal`.
--     answer_series_renewal(series, yes): yes joins the new dates through
--     join_activity(), as join_series() does, so capacity, blocks and
--     waitlists apply date by date; no records the answer and joins
--     nothing. No answer is no.
--   * series_renewals and series_renewal_answers keep what was offered and
--     answered. The organizer reads them; clients write neither.
-- =====================================================================

alter table public.activity_series
  add column renewal_offered_for timestamptz;

comment on column public.activity_series.renewal_offered_for is
  'The last date a renewal offer was sent for, so each run of dates is offered once. See 0057.';

create table public.series_renewals (
  id          uuid primary key default gen_random_uuid(),
  series_id   uuid not null references public.activity_series (id) on delete cascade,
  -- New dates are the ones that start after this instant: the old last date.
  after_start timestamptz not null,
  added       integer not null check (added between 1 and 12),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default clock_timestamp()
);

create index series_renewals_series_idx on public.series_renewals (series_id, created_at desc);

create table public.series_renewal_answers (
  renewal_id  uuid not null references public.series_renewals (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  joined      boolean not null,
  answered_at timestamptz not null default clock_timestamp(),
  primary key (renewal_id, user_id)
);

alter table public.series_renewals        enable row level security;
alter table public.series_renewal_answers enable row level security;
revoke all on public.series_renewals        from anon, authenticated;
revoke all on public.series_renewal_answers from anon, authenticated;
grant select on public.series_renewals        to authenticated;
grant select on public.series_renewal_answers to authenticated;

-- The organizer sees the renewals of their series and every answer; a
-- person sees their own answer.
create policy series_renewals_read on public.series_renewals
  for select to authenticated
  using (exists (select 1 from public.activity_series s
                  where s.id = series_id and s.organizer_id = auth.uid()));

create policy series_renewal_answers_read on public.series_renewal_answers
  for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.series_renewals r
                      join public.activity_series s on s.id = r.series_id
                     where r.id = renewal_id and s.organizer_id = auth.uid()));

-- ------------------------------------------------------------- helpers

-- The series' upcoming dates that still take people.
create or replace function public.series_upcoming(p_series_id uuid)
returns setof public.activities
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.activities
   where series_id = p_series_id
     and status in ('published', 'full')
     and starts_at > now()
   order by starts_at;
$$;

revoke all on function public.series_upcoming(uuid) from public, anon, authenticated;

-- ------------------------------------------------------- the offer

create or replace function public.offer_series_renewals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row  record;
  v_sent integer := 0;
begin
  for v_row in
    select s.id, s.organizer_id, s.title, max(a.starts_at) as last_start, count(*) as remaining
      from public.activity_series s
      join public.activities a
        on a.series_id = s.id and a.status in ('published', 'full') and a.starts_at > now()
     where s.is_active
     group by s.id
    having max(a.starts_at) <= now() + interval '31 days'
  loop
    if (select renewal_offered_for from public.activity_series where id = v_row.id)
       is not distinct from v_row.last_start then
      continue;
    end if;

    insert into public.notifications (user_id, type, payload)
    values (v_row.organizer_id, 'series_renewal_offer',
            jsonb_build_object('series_id', v_row.id, 'title', v_row.title,
                               'remaining', v_row.remaining, 'last_start', v_row.last_start));
    update public.activity_series set renewal_offered_for = v_row.last_start where id = v_row.id;
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;

comment on function public.offer_series_renewals() is
  'Nightly: one series_renewal_offer to the organizer of each active series whose last date is '
  'within a month, once per last date. See 0057.';

revoke all on function public.offer_series_renewals() from public, anon, authenticated;

-- ------------------------------------------------------- renewing

create or replace function public.renew_series(
  p_series_id uuid,
  p_count     integer default 8,
  p_skip      date[]  default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_s        public.activity_series%rowtype;
  v_last     timestamptz;
  v_step     integer;
  v_date     date;
  v_dates    date[] := '{}';
  v_skip     date[] := coalesce(p_skip, '{}');
  v_renewal  uuid;
  v_notified integer;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_count is null or p_count not between 1 and 12 then
    raise exception 'Se agregan de 1 a 12 fechas.' using errcode = '22023';
  end if;

  select * into v_s from public.activity_series where id = p_series_id for update;
  if not found then
    raise exception 'series not found' using errcode = 'P0002';
  end if;
  if v_s.organizer_id <> v_user then
    raise exception 'Solo quien organiza puede agregar fechas.' using errcode = '42501';
  end if;
  if not v_s.is_active then
    raise exception 'Esta serie ya no está activa.' using errcode = '22023';
  end if;

  select max(starts_at) into v_last from public.activities
   where series_id = p_series_id and status <> 'cancelled';
  if v_last is null then
    raise exception 'La serie no tiene fechas todavía.' using errcode = '22023';
  end if;

  v_step := case v_s.frequency when 'weekly' then 7 when 'biweekly' then 14 when 'monthly' then 28 end;
  v_date := (v_last at time zone v_s.timezone)::date;
  -- A renewal after the series ended starts from today, not from the past.
  while v_date < current_date loop
    v_date := v_date + v_step;
  end loop;

  while cardinality(v_dates) < p_count loop
    v_date := v_date + v_step;
    if not (v_date = any (v_skip)) then
      v_dates := v_dates || v_date;
    end if;
  end loop;

  -- The generator makes every date up to the last one asked for; the
  -- skipped ones are removed right after, before anybody can join them.
  perform public.generate_series_occurrences(p_series_id, v_dates[cardinality(v_dates)]);
  delete from public.activities a
   where a.series_id = p_series_id
     and a.starts_at > v_last
     and (a.starts_at at time zone v_s.timezone)::date = any (v_skip)
     and not exists (select 1 from public.activity_participants p where p.activity_id = a.id);

  insert into public.series_renewals (series_id, after_start, added, created_by)
  values (p_series_id, v_last, p_count, v_user)
  returning id into v_renewal;

  -- Who is on every upcoming date of the old run: «toda la serie».
  insert into public.notifications (user_id, type, payload)
  select p.user_id, 'series_renewal',
         jsonb_build_object('series_id', p_series_id, 'title', v_s.title, 'name', pr.display_name,
                            'added', p_count, 'first', v_dates[1], 'last', v_dates[cardinality(v_dates)],
                            'last_start', v_last)
    from public.activity_participants p
    join public.activities a on a.id = p.activity_id
    join public.profiles pr on pr.id = v_user
   where a.series_id = p_series_id
     and a.status in ('published', 'full')
     and a.starts_at > now()
     and a.starts_at <= v_last
     and p.status in ('joined', 'waitlisted')
     and p.user_id <> v_user
   group by p.user_id, pr.display_name
  having count(*) = (select count(*) from public.series_upcoming(p_series_id) u where u.starts_at <= v_last);
  get diagnostics v_notified = row_count;

  return jsonb_build_object('renewal_id', v_renewal, 'dates', to_jsonb(v_dates), 'asked', v_notified);
end;
$$;

comment on function public.renew_series(uuid, integer, date[]) is
  'The organizer adds 1–12 dates after the last one, minus skipped dates; people on the whole series '
  'are asked with series_renewal. Never automatic. See 0057.';

-- ---------------------------------------------------- answering

create or replace function public.answer_series_renewal(p_series_id uuid, p_join boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_renewal public.series_renewals%rowtype;
  v_act     record;
  v_status  public.participation_status;
  v_joined  integer := 0;
  v_waiting integer := 0;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_renewal from public.series_renewals
   where series_id = p_series_id order by created_at desc limit 1;
  if not found then
    raise exception 'Esta serie no tiene fechas nuevas que responder.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.notifications
                  where user_id = v_user and type = 'series_renewal'
                    and payload ->> 'series_id' = p_series_id::text
                    and (payload ->> 'last_start')::timestamptz = v_renewal.after_start) then
    raise exception 'No te preguntamos por estas fechas.' using errcode = '42501';
  end if;
  if exists (select 1 from public.series_renewal_answers
              where renewal_id = v_renewal.id and user_id = v_user) then
    raise exception 'Ya respondiste.' using errcode = '22023';
  end if;

  insert into public.series_renewal_answers (renewal_id, user_id, joined)
  values (v_renewal.id, v_user, coalesce(p_join, false));

  if coalesce(p_join, false) then
    perform set_config('movo.series_join', p_series_id::text, true);
    for v_act in
      select id from public.activities
       where series_id = p_series_id and status in ('published', 'full')
         and starts_at > v_renewal.after_start and starts_at > now()
       order by starts_at
    loop
      v_status := public.join_activity(v_act.id);
      if v_status = 'waitlisted' then v_waiting := v_waiting + 1; else v_joined := v_joined + 1; end if;
    end loop;
    perform set_config('movo.series_join', '', true);
  end if;

  -- Answering is reading the question.
  update public.notifications set read_at = now()
   where user_id = v_user and type = 'series_renewal' and read_at is null
     and payload ->> 'series_id' = p_series_id::text;

  return jsonb_build_object('joined', v_joined, 'waitlisted', v_waiting);
end;
$$;

comment on function public.answer_series_renewal(uuid, boolean) is
  'Yes joins the new dates of the latest renewal (date by date, through join_activity); no joins '
  'nothing. Only for people who were asked, once. See 0057.';

revoke all on function public.renew_series(uuid, integer, date[])      from public, anon;
revoke all on function public.answer_series_renewal(uuid, boolean)     from public, anon;
grant execute on function public.renew_series(uuid, integer, date[])   to authenticated;
grant execute on function public.answer_series_renewal(uuid, boolean)  to authenticated;

-- 09:47 UTC is 03:47 in Costa Rica.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
    execute $cmd$
      select cron.schedule('offer-series-renewals', '47 9 * * *', 'select public.offer_series_renewals()')
    $cmd$;
  else
    raise notice 'pg_cron is not available here; offer_series_renewals() is not scheduled';
  end if;
end
$$;
