-- =====================================================================
-- 0036_sports_catalog.sql — the 19 sports, in six families.
--
-- 3 November handoff (docs/design/handoff-2026-11-03.md, backend item 1;
-- boards Deportes v1 and v2). Movo launched with three categories; the
-- design now has nineteen, grouped so they can be told apart:
--
--   correr   Running, Trail running
--   montana  Senderismo
--   balon    Fútbol, Voleibol, Baloncesto, Ultimate frisbee, Touch rugby,
--            Sóftbol, Béisbol
--   ruedas   Ciclismo, Ciclismo de montaña
--   entrenar Yoga, Bootcamp, Calistenia, Zumba y baile
--   agua     Surf, Kayak, Rafting
--
-- Adding a sport stays what 0004 promised: a row with its attribute_schema,
-- no new table. Two additions to the schema dialect, both read by the
-- client and ignored by anything that does not know them:
--
--   * "enumNames" — the words a person reads for each enum value, in the
--     same order. «sintetica» is a value; «Sintética» is what the chip says.
--   * "readOnly": true with "const" — a fixed rule of the sport. Water
--     sports carry three (a life jacket for everyone, everyone can swim,
--     cancelled if the CNE declares an alert for the area), cycling and
--     rafting a helmet, touch rugby no contact. The organizer cannot remove
--     them, so this file does not trust the client to send them:
--     apply_fixed_attributes() writes every fixed value on insert and
--     update of activities and activity_series.
--
-- Not here: a group with up to three sports and a level per sport in the
-- profile (user_interests.skill already exists) ship with the screens that
-- set them.
-- =====================================================================

-- ------------------------------------------------------------ family

alter table public.categories
  add column family text check (
    family is null or family in ('correr', 'montana', 'balon', 'ruedas', 'entrenar', 'agua')
  );

comment on column public.categories.family is
  'correr | montana | balon | ruedas | entrenar | agua. One colour per family on '
  'the client; the sport''s name always goes beside it. See 0036.';

update public.categories set family = 'correr',  icon = 'shoe',     sort_order = 10 where id = 'running';
update public.categories set family = 'montana', icon = 'mountain', sort_order = 20 where id = 'hiking';
update public.categories set family = 'balon',   icon = 'ball',     sort_order = 30 where id = 'football';

-- Words for the values the first three sports already had.
update public.categories
   set attribute_schema = jsonb_set(
         attribute_schema, '{properties,route_type,enumNames}', '["Calle", "Trail", "Pista"]')
 where id = 'running';

update public.categories
   set attribute_schema = jsonb_set(
         jsonb_set(
           jsonb_set(attribute_schema, '{properties,format,enumNames}',
                     '["5 contra 5", "7 contra 7", "9 contra 9", "11 contra 11"]'),
           '{properties,surface,enumNames}', '["Sintética", "Natural", "Cemento"]'),
         '{properties,positions_needed,items,enumNames}',
         '["Portero", "Defensa", "Medio", "Delantero"]')
 where id = 'football';

-- ------------------------------------------------------- 16 new sports

insert into public.categories (id, name_es, name_en, icon, family, sort_order, attribute_schema) values
(
  'trail_running', 'Trail running', 'Trail running', 'shoe', 'correr', 11,
  '{
    "type": "object", "additionalProperties": false,
    "required": ["distance_km", "elevation_gain_m"],
    "properties": {
      "distance_km":      { "type": "number",  "minimum": 1, "maximum": 100, "title": "Distancia (km)" },
      "elevation_gain_m": { "type": "integer", "minimum": 0, "maximum": 5000, "title": "Desnivel positivo (m)" },
      "pace_min_per_km":  { "type": "number",  "minimum": 4, "maximum": 20, "title": "Ritmo objetivo (min/km)" },
      "no_drop":          { "type": "boolean", "default": true, "title": "Nadie se queda atrás" }
    }
  }'
),
(
  'volleyball', 'Voleibol', 'Volleyball', 'ball', 'balon', 31,
  '{
    "type": "object", "additionalProperties": false,
    "required": ["surface", "format"],
    "properties": {
      "surface": { "type": "string", "enum": ["arena", "cancha"], "enumNames": ["Arena", "Cancha"], "title": "Dónde se juega" },
      "format":  { "type": "string", "enum": ["2v2", "4v4", "6v6"],
                   "enumNames": ["2 contra 2", "4 contra 4", "6 contra 6"], "title": "Formato" }
    }
  }'
),
(
  'basketball', 'Baloncesto', 'Basketball', 'ball', 'balon', 32,
  '{
    "type": "object", "additionalProperties": false,
    "required": ["format"],
    "properties": {
      "format": { "type": "string", "enum": ["3x3", "5x5"], "enumNames": ["3 contra 3", "5 contra 5"], "title": "Formato" },
      "court":  { "type": "string", "enum": ["techada", "aire_libre"], "enumNames": ["Techada", "Al aire libre"], "title": "Cancha" }
    }
  }'
),
(
  'ultimate_frisbee', 'Ultimate frisbee', 'Ultimate frisbee', 'ball', 'balon', 33,
  '{
    "type": "object", "additionalProperties": false,
    "required": ["format"],
    "properties": {
      "format":   { "type": "string", "enum": ["5v5", "7v7"], "enumNames": ["5 contra 5", "7 contra 7"], "title": "Formato" },
      "has_disc": { "type": "boolean", "default": true, "title": "Hay disco" }
    }
  }'
),
(
  'touch_rugby', 'Touch rugby', 'Touch rugby', 'ball', 'balon', 34,
  '{
    "type": "object", "additionalProperties": false,
    "required": ["format", "no_contact"],
    "properties": {
      "format":     { "type": "string", "enum": ["5v5", "6v6"], "enumNames": ["5 contra 5", "6 contra 6"], "title": "Formato" },
      "no_contact": { "type": "boolean", "const": true, "readOnly": true, "title": "Sin contacto: solo se toca" }
    }
  }'
),
(
  'softball', 'Sóftbol', 'Softball', 'ball', 'balon', 35,
  '{
    "type": "object", "additionalProperties": false,
    "required": ["players_per_team"],
    "properties": {
      "players_per_team": { "type": "integer", "minimum": 5, "maximum": 10, "title": "Jugadores por equipo" },
      "gloves_provided":  { "type": "boolean", "title": "Hay guantes para prestar" }
    }
  }'
),
(
  'baseball', 'Béisbol', 'Baseball', 'ball', 'balon', 36,
  '{
    "type": "object", "additionalProperties": false,
    "required": ["players_per_team"],
    "properties": {
      "players_per_team": { "type": "integer", "minimum": 5, "maximum": 9, "title": "Jugadores por equipo" },
      "gloves_provided":  { "type": "boolean", "title": "Hay guantes para prestar" },
      "helmets_provided": { "type": "boolean", "title": "Hay cascos para prestar" }
    }
  }'
),
(
  'cycling', 'Ciclismo', 'Cycling', 'bike', 'ruedas', 40,
  '{
    "type": "object", "additionalProperties": false,
    "required": ["distance_km", "avg_speed_kmh", "helmet"],
    "properties": {
      "distance_km":      { "type": "number",  "minimum": 5, "maximum": 300, "title": "Distancia (km)" },
      "elevation_gain_m": { "type": "integer", "minimum": 0, "maximum": 5000, "title": "Desnivel positivo (m)" },
      "avg_speed_kmh":    { "type": "number",  "minimum": 10, "maximum": 45, "title": "Velocidad promedio (km/h)" },
      "no_drop":          { "type": "boolean", "default": true, "title": "Nadie se queda atrás" },
      "helmet":           { "type": "boolean", "const": true, "readOnly": true, "title": "Casco obligatorio" }
    }
  }'
),
(
  'mountain_biking', 'Ciclismo de montaña', 'Mountain biking', 'bike', 'ruedas', 41,
  '{
    "type": "object", "additionalProperties": false,
    "required": ["distance_km", "technical", "helmet"],
    "properties": {
      "distance_km":      { "type": "number",  "minimum": 3, "maximum": 150, "title": "Distancia (km)" },
      "elevation_gain_m": { "type": "integer", "minimum": 0, "maximum": 4000, "title": "Desnivel positivo (m)" },
      "technical":        { "type": "string", "enum": ["baja", "media", "alta"],
                            "enumNames": ["Baja", "Media", "Alta"], "title": "Dificultad técnica" },
      "helmet":           { "type": "boolean", "const": true, "readOnly": true, "title": "Casco obligatorio" }
    }
  }'
),
(
  'yoga', 'Yoga', 'Yoga', 'dumbbell', 'entrenar', 50,
  '{
    "type": "object", "additionalProperties": false,
    "required": ["style"],
    "properties": {
      "style":    { "type": "string", "enum": ["hatha", "vinyasa", "yin", "restaurativo"],
                    "enumNames": ["Hatha", "Vinyasa", "Yin", "Restaurativo"], "title": "Estilo" },
      "bring_mat": { "type": "boolean", "default": true, "title": "Trae tu mat" }
    }
  }'
),
(
  'bootcamp', 'Bootcamp', 'Bootcamp', 'dumbbell', 'entrenar', 51,
  '{
    "type": "object", "additionalProperties": false,
    "required": ["intensity"],
    "properties": {
      "intensity": { "type": "string", "enum": ["baja", "media", "alta"],
                     "enumNames": ["Baja", "Media", "Alta"], "title": "Intensidad" },
      "equipment": { "type": "string", "enum": ["ninguno", "se_presta", "cada_quien"],
                     "enumNames": ["Sin equipo", "Se presta", "Cada quien trae"], "title": "Equipo" }
    }
  }'
),
(
  'calisthenics', 'Calistenia', 'Calisthenics', 'dumbbell', 'entrenar', 52,
  '{
    "type": "object", "additionalProperties": false,
    "properties": {
      "park_bars": { "type": "boolean", "default": true, "title": "Usamos las barras del parque" }
    }
  }'
),
(
  'dance', 'Zumba y baile', 'Zumba and dance', 'dumbbell', 'entrenar', 53,
  '{
    "type": "object", "additionalProperties": false,
    "required": ["style"],
    "properties": {
      "style":     { "type": "string", "enum": ["zumba", "salsa", "bachata", "urbano"],
                     "enumNames": ["Zumba", "Salsa", "Bachata", "Urbano"], "title": "Estilo" },
      "intensity": { "type": "string", "enum": ["baja", "media", "alta"],
                     "enumNames": ["Baja", "Media", "Alta"], "title": "Intensidad" }
    }
  }'
),
(
  'surf', 'Surf', 'Surfing', 'waves', 'agua', 60,
  '{
    "type": "object", "additionalProperties": false,
    "required": ["beach", "wave_size", "life_jackets", "swimmers_only", "cne_alert_cancels"],
    "properties": {
      "beach":             { "type": "string", "title": "Playa" },
      "wave_size":         { "type": "string", "enum": ["pequenas", "medianas", "grandes"],
                             "enumNames": ["Pequeñas", "Medianas", "Grandes"], "title": "Tamaño de las olas" },
      "board":             { "type": "string", "enum": ["propia", "alquiler", "incluida"],
                             "enumNames": ["Tabla propia", "Se alquila", "Incluida"], "title": "Tabla" },
      "life_jackets":      { "type": "boolean", "const": true, "readOnly": true, "title": "Chaleco salvavidas para cada persona" },
      "swimmers_only":     { "type": "boolean", "const": true, "readOnly": true, "title": "Nadie entra al agua sin saber nadar" },
      "cne_alert_cancels": { "type": "boolean", "const": true, "readOnly": true, "title": "Se cancela si hay alerta de la CNE" }
    }
  }'
),
(
  'kayak', 'Kayak', 'Kayaking', 'waves', 'agua', 61,
  '{
    "type": "object", "additionalProperties": false,
    "required": ["water", "equipment", "life_jackets", "swimmers_only", "cne_alert_cancels"],
    "properties": {
      "water":             { "type": "string", "enum": ["lago", "rio", "mar"],
                             "enumNames": ["Lago", "Río", "Mar"], "title": "Dónde se rema" },
      "equipment":         { "type": "string", "enum": ["incluido", "cada_quien", "se_alquila"],
                             "enumNames": ["Incluido", "Cada quien trae", "Se alquila"], "title": "Equipo" },
      "life_jackets":      { "type": "boolean", "const": true, "readOnly": true, "title": "Chaleco salvavidas para cada persona" },
      "swimmers_only":     { "type": "boolean", "const": true, "readOnly": true, "title": "Nadie rema sin saber nadar" },
      "cne_alert_cancels": { "type": "boolean", "const": true, "readOnly": true, "title": "Se cancela si hay alerta de la CNE" }
    }
  }'
),
(
  'rafting', 'Rafting', 'Rafting', 'waves', 'agua', 62,
  '{
    "type": "object", "additionalProperties": false,
    "required": ["river_class", "operator", "helmet", "life_jackets", "swimmers_only", "cne_alert_cancels"],
    "properties": {
      "river_class":       { "type": "string", "enum": ["I", "II", "III", "IV", "V"],
                             "enumNames": ["Clase I", "Clase II", "Clase III", "Clase IV", "Clase V"], "title": "Clase del río" },
      "operator":          { "type": "string", "title": "Operador con permiso" },
      "helmet":            { "type": "boolean", "const": true, "readOnly": true, "title": "Casco para cada persona" },
      "life_jackets":      { "type": "boolean", "const": true, "readOnly": true, "title": "Chaleco salvavidas para cada persona" },
      "swimmers_only":     { "type": "boolean", "const": true, "readOnly": true, "title": "Nadie entra al río sin saber nadar" },
      "cne_alert_cancels": { "type": "boolean", "const": true, "readOnly": true, "title": "Se cancela si hay alerta de la CNE" }
    }
  }'
)
on conflict (id) do update
  set name_es          = excluded.name_es,
      name_en          = excluded.name_en,
      icon             = excluded.icon,
      family           = excluded.family,
      sort_order       = excluded.sort_order,
      attribute_schema = excluded.attribute_schema;

alter table public.categories alter column family set not null;

-- ---------------------------------------------------- fixed rules

-- Every property marked readOnly with a const is written here, whatever the
-- client sent. A missing or false «life jacket» cannot reach the database.
create or replace function public.apply_fixed_attributes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_fixed jsonb;
begin
  select coalesce(jsonb_object_agg(p.key, p.value -> 'const'), '{}'::jsonb)
    into v_fixed
    from public.categories c,
         jsonb_each(c.attribute_schema -> 'properties') as p(key, value)
   where c.id = new.category_id
     and (p.value ->> 'readOnly')::boolean is true
     and p.value ? 'const';

  new.attributes := coalesce(new.attributes, '{}'::jsonb) || v_fixed;
  return new;
end;
$$;

comment on function public.apply_fixed_attributes() is
  'Writes each readOnly const of the category schema into attributes, so the '
  'fixed rules of a sport (water, helmets) cannot be left out. See 0036.';

revoke all on function public.apply_fixed_attributes() from public, anon, authenticated;

create trigger activities_fixed_attributes
  before insert or update of attributes, category_id on public.activities
  for each row execute function public.apply_fixed_attributes();

create trigger activity_series_fixed_attributes
  before insert or update of attributes, category_id on public.activity_series
  for each row execute function public.apply_fixed_attributes();
