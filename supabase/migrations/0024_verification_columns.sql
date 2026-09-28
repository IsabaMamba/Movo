-- =====================================================================
-- 0024_verification_columns.sql — nobody can verify themselves or their
-- own venue, and a venue cannot be made private after it is public.
--
-- Found on 28 September, reading the profiles grant to build an account
-- screen. 0003 granted UPDATE on whole rows, and the policies restrict which
-- row, never which column — the defect 0008 fixed for activities and 0011
-- for notifications, still open on two more tables:
--
--   * profiles. `grant update on public.profiles` let anybody set their own
--     `is_verified = true` through PostgREST. Nothing shows the flag yet, but
--     identity verification is a launch blocker in docs/security.md, and a
--     badge the person can grant themselves is worse than none.
--
--   * locations. The insert policy checks `created_by` and `is_public_venue`
--     and nothing else, so a venue could be inserted already `is_verified` —
--     and Crear shows «Verificado» on it. The update policy lets the creator
--     edit an unverified venue with a check of `created_by` alone, so the
--     creator could also verify it, flip `is_public_venue` to false (the one
--     structural half of "public, named venues only"), or write a
--     `district_code` that does not match the point, which the zone trigger
--     only recomputes when the point moves — and the heat map would light the
--     wrong zone.
--
-- Checked on the live project the same day: can_self_verify and
-- can_verify_venue were both true; zero profiles and zero user-created venues
-- were verified. The one verified venue is La Sabana, seeded by 0006.
--
-- The grants become column lists. What the app writes stays writable;
-- everything that is a judgement about the row — verified, public, which
-- zone it is in — is written only by migrations, SECURITY DEFINER code, or
-- the zone trigger, none of which a column grant restricts.
-- =====================================================================

-- ------------------------------------------------------------- profiles

revoke update on public.profiles from authenticated;

-- display_name, bio and home_district are the person's to say. avatar_url is
-- not granted yet: there is no upload, so the only thing a client could put
-- there is a URL on somebody else's server, loaded by everybody who sees the
-- profile. It comes back with storage (status.md, item 4).
grant update (display_name, bio, home_district) on public.profiles to authenticated;

-- ------------------------------------------------------------ locations

revoke insert, update on public.locations from authenticated;

-- What createVenue() in src/lib/activities.ts sends, plus `id`: a client that
-- picks its own uuid gains nothing but a primary-key error if it collides.
-- is_public_venue stays in the insert list because the policy requires it to
-- be true; it is absent from the update list, so it can never become false.
-- is_verified and district_code are in neither: the first defaults to false,
-- the second is set by locations_set_zone().
grant insert (id, name, address, district, geog, is_public_venue, created_by)
  on public.locations to authenticated;

-- What a creator may correct on a venue that is not verified yet. Moving the
-- point is allowed, and the zone trigger re-resolves the district when it
-- moves.
grant update (name, address, district, geog) on public.locations to authenticated;
