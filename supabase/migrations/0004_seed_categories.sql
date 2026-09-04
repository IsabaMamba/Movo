-- =====================================================================
-- 0004_seed_categories.sql
--
-- The three MVP categories and their attribute schemas. Adding padel or
-- cycling later is an INSERT here plus a form renderer on the client —
-- no migration, no new table, which is what "flexible schema" has to mean
-- in practice.
--
-- attribute_schema is a JSON Schema subset. Validate against it in the API
-- layer before writing activities.attributes; Postgres does not enforce it.
-- =====================================================================

insert into public.categories (id, name_es, name_en, icon, sort_order, attribute_schema) values
(
  'running', 'Running', 'Running', 'run', 10,
  '{
    "type": "object",
    "additionalProperties": false,
    "required": ["distance_km", "pace_min_per_km"],
    "properties": {
      "distance_km":      { "type": "number",  "minimum": 1, "maximum": 100,
                            "title": "Distancia (km)" },
      "pace_min_per_km":  { "type": "number",  "minimum": 3, "maximum": 12,
                            "title": "Ritmo objetivo (min/km)" },
      "route_type":       { "type": "string",  "enum": ["calle", "trail", "pista"],
                            "title": "Tipo de ruta" },
      "has_pacers":       { "type": "boolean", "title": "Hay pacers por grupo" },
      "route_url":        { "type": "string",  "title": "Enlace a la ruta" },
      "no_drop":          { "type": "boolean", "default": true,
                            "title": "Nadie se queda atrás" }
    }
  }'::jsonb
),
(
  'hiking', 'Senderismo', 'Hiking', 'mountain', 20,
  '{
    "type": "object",
    "additionalProperties": false,
    "required": ["distance_km", "elevation_gain_m"],
    "properties": {
      "distance_km":        { "type": "number",  "minimum": 1, "maximum": 60,
                              "title": "Distancia (km)" },
      "elevation_gain_m":   { "type": "integer", "minimum": 0, "maximum": 4000,
                              "title": "Desnivel positivo (m)" },
      "trail_name":         { "type": "string",  "title": "Sendero" },
      "estimated_hours":    { "type": "number",  "minimum": 0.5, "maximum": 24,
                              "title": "Duración estimada (h)" },
      "transport_provided": { "type": "boolean", "title": "Incluye transporte" },
      "entrance_fee_crc":   { "type": "integer", "minimum": 0,
                              "title": "Entrada al parque (₡)" },
      "water_liters":       { "type": "number",  "minimum": 0, "maximum": 10,
                              "title": "Agua recomendada (L)" }
    }
  }'::jsonb
),
(
  'football', 'Fútbol', 'Football', 'soccer', 30,
  '{
    "type": "object",
    "additionalProperties": false,
    "required": ["format", "surface"],
    "properties": {
      "format":            { "type": "string", "enum": ["5v5", "7v7", "9v9", "11v11"],
                             "title": "Formato" },
      "surface":           { "type": "string", "enum": ["sintetica", "natural", "cemento"],
                             "title": "Superficie" },
      "cancha_cost_crc":   { "type": "integer", "minimum": 0,
                             "title": "Costo de cancha (₡ total)" },
      "split_cost":        { "type": "boolean", "default": true,
                             "title": "Se divide entre jugadores" },
      "positions_needed":  { "type": "array", "items": { "type": "string",
                             "enum": ["portero", "defensa", "medio", "delantero"] },
                             "title": "Posiciones que faltan" },
      "bring_two_shirts":  { "type": "boolean", "default": true,
                             "title": "Traer camisa clara y oscura" },
      "referee":           { "type": "boolean", "title": "Hay árbitro" }
    }
  }'::jsonb
)
on conflict (id) do update
  set name_es          = excluded.name_es,
      name_en          = excluded.name_en,
      icon             = excluded.icon,
      sort_order       = excluded.sort_order,
      attribute_schema = excluded.attribute_schema;


-- ---------------------------------------------------------------------
-- Cold-start seeding
--
-- An empty Discover screen on first open is the single most likely reason
-- a first-time user never returns. Before launch, load real public sessions
-- you do not organize with source = 'imported', attributed and linkable.
-- claimed_by is set later if the real organizer signs up and takes it over.
--
-- Example (commented — replace with real venues and a real seed account):
--
-- with venue as (
--   insert into public.locations (name, district, geog, is_public_venue, is_verified)
--   values ('Parque Metropolitano La Sabana', 'Mata Redonda',
--           extensions.st_setsrid(extensions.st_makepoint(-84.1035, 9.9350), 4326)::extensions.geography,
--           true, true)
--   returning id
-- )
-- insert into public.activities (
--   organizer_id, category_id, location_id, title, description,
--   starts_at, ends_at, skill, difficulty, price_crc,
--   attributes, visibility, status, source, source_url, meeting_point
-- )
-- select '<seed-account-uuid>', 'running', venue.id,
--        'Corrida grupal — martes',
--        'Sesión abierta publicada por el club. Confirmá en su Instagram.',
--        '2026-09-08 18:00:00-06', '2026-09-08 19:15:00-06',
--        'any', 2, 0,
--        '{"distance_km": 6, "pace_min_per_km": 6.5, "route_type": "calle", "no_drop": true}'::jsonb,
--        'public', 'published', 'imported', 'https://instagram.com/<club>',
--        'Frente al Estadio Nacional'
--   from venue;
