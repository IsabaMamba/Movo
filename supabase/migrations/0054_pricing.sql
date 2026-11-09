-- =====================================================================
-- 0054_pricing.sql — a price per person, or a total split; and the entry fee.
--
-- 16 October handoff, backend item 4: «unit (per person / total split),
-- split total and divisor, venue entry fee (none / amount / unknown). Show
-- it as "₡1,200 por persona · cancha ₡12,000 entre 10". In a series the
-- price is per date, and says so.»
--
-- `price_minor` stays what it always was — what one person pays the
-- organizer — so every list, card and filter that reads it keeps working.
-- For a split it is computed here from the total and the divisor, rounded up
-- to a whole unit, so nobody types a per-person amount that disagrees with
-- the total they announced.
--
-- The entry fee is separate: it is paid at the door of a park or a pool,
-- not to the organizer, and «no sé» is a real answer worth saying aloud.
--
-- A series carries the same columns, and each date it generates copies them
-- from the series, the way it copies the price today.
-- =====================================================================

alter table public.activities
  add column price_unit        text    not null default 'per_person'
    check (price_unit in ('per_person', 'split')),
  add column split_total_minor integer check (split_total_minor > 0),
  add column split_divisor     integer check (split_divisor between 2 and 1000),
  add column venue_fee         text    not null default 'none'
    check (venue_fee in ('none', 'amount', 'unknown')),
  add column venue_fee_minor   integer check (venue_fee_minor > 0),
  add constraint activities_split_shape check (
    (price_unit = 'per_person' and split_total_minor is null and split_divisor is null)
    or (price_unit = 'split' and split_total_minor is not null and split_divisor is not null)
  ),
  add constraint activities_venue_fee_shape check (
    (venue_fee = 'amount') = (venue_fee_minor is not null)
  );

alter table public.activity_series
  add column price_unit        text    not null default 'per_person'
    check (price_unit in ('per_person', 'split')),
  add column split_total_minor integer check (split_total_minor > 0),
  add column split_divisor     integer check (split_divisor between 2 and 1000),
  add column venue_fee         text    not null default 'none'
    check (venue_fee in ('none', 'amount', 'unknown')),
  add column venue_fee_minor   integer check (venue_fee_minor > 0),
  add constraint activity_series_split_shape check (
    (price_unit = 'per_person' and split_total_minor is null and split_divisor is null)
    or (price_unit = 'split' and split_total_minor is not null and split_divisor is not null)
  ),
  add constraint activity_series_venue_fee_shape check (
    (venue_fee = 'amount') = (venue_fee_minor is not null)
  );

comment on column public.activities.price_unit is
  'per_person: price_minor as entered. split: price_minor = split_total_minor / split_divisor, rounded up to a whole unit. See 0054.';
comment on column public.activities.venue_fee is
  'Entry fee paid at the venue, not to the organizer: none, amount (venue_fee_minor) or unknown. See 0054.';

-- ------------------------------------------------------------- the trigger

-- Rounded up to a whole unit of the currency (100 minor units): a split of
-- ₡10,000 between 3 is ₡3,334, never ₡3,333.33.
create or replace function public.split_share(p_total integer, p_divisor integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (ceil(p_total::numeric / p_divisor / 100) * 100)::integer;
$$;

create or replace function public.apply_pricing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.activity_series;
begin
  -- A date of a series prices as its series does.
  -- Nested, because a series row has no series_id to read.
  if tg_table_name = 'activities' and tg_op = 'INSERT' then
    if new.series_id is not null then
      select * into v_s from public.activity_series where id = new.series_id;
      if found then
        new.price_minor       := v_s.price_minor;
        new.price_unit        := v_s.price_unit;
        new.split_total_minor := v_s.split_total_minor;
        new.split_divisor     := v_s.split_divisor;
        new.venue_fee         := v_s.venue_fee;
        new.venue_fee_minor   := v_s.venue_fee_minor;
      end if;
    end if;
  end if;

  if new.price_unit = 'split' and new.split_total_minor is not null and new.split_divisor is not null then
    new.price_minor := public.split_share(new.split_total_minor, new.split_divisor);
  end if;

  return new;
end;
$$;

revoke all on function public.apply_pricing() from public, anon, authenticated;
revoke all on function public.split_share(integer, integer) from public, anon, authenticated;

create trigger activities_pricing
  before insert or update of price_unit, split_total_minor, split_divisor
  on public.activities
  for each row execute function public.apply_pricing();

create trigger activity_series_pricing
  before insert or update of price_unit, split_total_minor, split_divisor
  on public.activity_series
  for each row execute function public.apply_pricing();
