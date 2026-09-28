-- =====================================================================
-- 26_verify_venues_test.sql — only staff verify a venue, only a real one,
-- and the record says who.
--
-- Every check raises on failure, so a clean exit is a pass.
-- =====================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a2600000-0000-0000-0000-000000000001', 'crea26@test.cr',  '{"display_name":"Crea"}'),
  ('a2600000-0000-0000-0000-000000000009', 'staff26@test.cr', '{"display_name":"Equipo"}');

insert into public.staff (user_id, note)
values ('a2600000-0000-0000-0000-000000000009', 'Test fixture');

insert into public.locations (id, name, geog, is_public_venue, created_by) values
  -- La Sabana: inside a distrito.
  ('b2600000-0000-0000-0000-000000000001', 'Cancha 26',
   extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
   true, 'a2600000-0000-0000-0000-000000000001'),
  -- The Pacific: in no distrito.
  ('b2600000-0000-0000-0000-000000000002', 'Mar 26',
   extensions.st_setsrid(extensions.st_makepoint(-86.5000, 8.0000), 4326)::extensions.geography,
   true, 'a2600000-0000-0000-0000-000000000001');

-- ------------------------------------------------------ not staff, no

select set_config('request.jwt.claim.sub', 'a2600000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$
declare v_sqlstate text;
begin
  begin
    perform public.verify_location('b2600000-0000-0000-0000-000000000001'::uuid, 'Es mía');
    raise exception 'FAIL: the creator verified their own venue';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate = 'P0001' then raise; end if;
    if v_sqlstate <> '42501' then
      raise exception 'FAIL: non-staff verify refused with %, expected 42501', v_sqlstate;
    end if;
  end;
end $$;

reset role;

-- ------------------------------------------------ staff, refusals

select set_config('request.jwt.claim.sub', 'a2600000-0000-0000-0000-000000000009', true);
set local role authenticated;

do $$
declare
  r record;
  v_sqlstate text;
begin
  for r in select * from (values
    ('b2600000-0000-0000-0000-000000000001'::uuid, '  ',        'a blank note'),
    ('b2600000-0000-0000-0000-000000000002'::uuid, 'Revisado',  'a point in no district')
  ) as t(id, note, why) loop
    begin
      perform public.verify_location(r.id, r.note);
      raise exception 'FAIL: verified with %', r.why;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate = 'P0001' then raise; end if;
      if v_sqlstate <> '22023' then
        raise exception 'FAIL: % refused with %, expected 22023', r.why, v_sqlstate;
      end if;
    end;
  end loop;
end $$;

-- ------------------------------------------------------ staff, yes

select public.verify_location('b2600000-0000-0000-0000-000000000001',
                              'Visto en el mapa: cancha pública, el punto está en la entrada');

reset role;

do $$
declare v_loc public.locations%rowtype;
begin
  select * into v_loc from public.locations where id = 'b2600000-0000-0000-0000-000000000001';
  if not v_loc.is_verified then
    raise exception 'FAIL: the venue was not verified';
  end if;
  if v_loc.verified_by is distinct from 'a2600000-0000-0000-0000-000000000009' then
    raise exception 'FAIL: verified_by is %, not the staff member who did it', v_loc.verified_by;
  end if;
  if v_loc.verified_at is null or v_loc.verified_note is null then
    raise exception 'FAIL: when or why was not recorded';
  end if;
end $$;

-- Verified means the creator can no longer move it.
select set_config('request.jwt.claim.sub', 'a2600000-0000-0000-0000-000000000001', true);
set local role authenticated;

update public.locations set name = 'Movida 26'
 where id = 'b2600000-0000-0000-0000-000000000001';

reset role;

do $$ begin
  if (select name from public.locations where id = 'b2600000-0000-0000-0000-000000000001') <> 'Cancha 26' then
    raise exception 'FAIL: the creator changed a verified venue';
  end if;
end $$;

-- -------------------------------------------------- undoing a mistake

select set_config('request.jwt.claim.sub', 'a2600000-0000-0000-0000-000000000009', true);
set local role authenticated;
select public.unverify_location('b2600000-0000-0000-0000-000000000001', 'Lo verifiqué por error');
reset role;

select set_config('request.jwt.claim.sub', 'a2600000-0000-0000-0000-000000000001', true);
set local role authenticated;
update public.locations set name = 'Cancha 26 norte'
 where id = 'b2600000-0000-0000-0000-000000000001';
reset role;

do $$ begin
  if (select is_verified from public.locations where id = 'b2600000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: unverify left the venue verified';
  end if;
  if (select name from public.locations where id = 'b2600000-0000-0000-0000-000000000001') <> 'Cancha 26 norte' then
    raise exception 'FAIL: unverifying did not hand the venue back to its creator';
  end if;
end $$;

rollback;
