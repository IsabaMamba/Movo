-- =====================================================================
-- 23_verification_columns_test.sql — nobody verifies themselves or their
-- own venue, and nobody makes a public venue private.
--
-- Each refusal is paired with the write the app really makes on the same
-- row, so a pass proves the column rule and not a broken fixture.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a2300000-0000-0000-0000-000000000001', 'vero23@test.cr', '{"display_name":"Vero"}');

-- ------------------------------------------------------------- grants

do $$ begin
  if has_column_privilege('authenticated', 'public.profiles', 'is_verified', 'update') then
    raise exception 'FAIL: a client can update profiles.is_verified';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'avatar_url', 'update') then
    raise exception 'FAIL: a client can set avatar_url before there is an upload';
  end if;
  if not has_column_privilege('authenticated', 'public.profiles', 'display_name', 'update') then
    raise exception 'FAIL: a client can no longer change their own display name';
  end if;

  if has_column_privilege('authenticated', 'public.locations', 'is_verified', 'insert')
     or has_column_privilege('authenticated', 'public.locations', 'is_verified', 'update') then
    raise exception 'FAIL: a client can write locations.is_verified';
  end if;
  if has_column_privilege('authenticated', 'public.locations', 'is_public_venue', 'update') then
    raise exception 'FAIL: a client can make a venue private';
  end if;
  if has_column_privilege('authenticated', 'public.locations', 'district_code', 'insert')
     or has_column_privilege('authenticated', 'public.locations', 'district_code', 'update') then
    raise exception 'FAIL: a client can write locations.district_code';
  end if;
end $$;

-- ------------------------------------------------------------- profiles

select set_config('request.jwt.claim.sub', 'a2300000-0000-0000-0000-000000000001', true);
set local role authenticated;

-- What an account screen does: change the name.
update public.profiles set display_name = 'Vero M.'
 where id = 'a2300000-0000-0000-0000-000000000001';

do $$
declare v_sqlstate text;
begin
  begin
    update public.profiles set is_verified = true
     where id = 'a2300000-0000-0000-0000-000000000001';
    raise exception 'FAIL: Vero verified herself';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate = 'P0001' then raise; end if;
    if v_sqlstate <> '42501' then
      raise exception 'FAIL: self-verify refused with %, expected 42501', v_sqlstate;
    end if;
  end;
end $$;

-- ------------------------------------------------------------ locations

-- What createVenue() sends, verbatim in shape.
insert into public.locations (id, name, district, address, geog, is_public_venue, created_by)
values ('b2300000-0000-0000-0000-000000000001', 'Cancha 23', 'Mata Redonda', null,
        extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
        true, 'a2300000-0000-0000-0000-000000000001');

do $$
declare v_sqlstate text;
begin
  -- Inserted already verified.
  begin
    insert into public.locations (name, geog, is_public_venue, created_by, is_verified)
    values ('Falsa 23',
            extensions.st_setsrid(extensions.st_makepoint(-84.10, 9.93), 4326)::extensions.geography,
            true, 'a2300000-0000-0000-0000-000000000001', true);
    raise exception 'FAIL: a venue was inserted already verified';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate = 'P0001' then raise; end if;
    if v_sqlstate <> '42501' then
      raise exception 'FAIL: verified insert refused with %, expected 42501', v_sqlstate;
    end if;
  end;

  -- Verified after the fact.
  begin
    update public.locations set is_verified = true
     where id = 'b2300000-0000-0000-0000-000000000001';
    raise exception 'FAIL: the creator verified their own venue';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate = 'P0001' then raise; end if;
    if v_sqlstate <> '42501' then
      raise exception 'FAIL: self-verify venue refused with %, expected 42501', v_sqlstate;
    end if;
  end;

  -- Made private.
  begin
    update public.locations set is_public_venue = false
     where id = 'b2300000-0000-0000-0000-000000000001';
    raise exception 'FAIL: the creator made a public venue private';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate = 'P0001' then raise; end if;
    if v_sqlstate <> '42501' then
      raise exception 'FAIL: private flip refused with %, expected 42501', v_sqlstate;
    end if;
  end;

  -- Placed in a zone the point is not in.
  begin
    update public.locations set district_code = '10101'
     where id = 'b2300000-0000-0000-0000-000000000001';
    raise exception 'FAIL: the creator rewrote the district code';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate = 'P0001' then raise; end if;
    if v_sqlstate <> '42501' then
      raise exception 'FAIL: district rewrite refused with %, expected 42501', v_sqlstate;
    end if;
  end;
end $$;

-- What a venue-correction screen would do: fix the name.
update public.locations set name = 'Cancha 23 norte'
 where id = 'b2300000-0000-0000-0000-000000000001';

reset role;

do $$ begin
  if (select display_name from public.profiles
       where id = 'a2300000-0000-0000-0000-000000000001') <> 'Vero M.' then
    raise exception 'FAIL: the display name did not change';
  end if;
  if (select is_verified from public.profiles
       where id = 'a2300000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: Vero is verified';
  end if;
  if (select name from public.locations
       where id = 'b2300000-0000-0000-0000-000000000001') <> 'Cancha 23 norte' then
    raise exception 'FAIL: the venue name did not change';
  end if;
  if (select is_verified or not is_public_venue or district_code is null
        from public.locations where id = 'b2300000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: the venue is verified, private, or unplaced';
  end if;
end $$;

rollback;
