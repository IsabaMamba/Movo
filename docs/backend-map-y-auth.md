# Backend para Web v2 y Lanzamiento v5 — qué falta y en qué orden

**17 de septiembre 2026.** Las dos pantallas están diseñadas en el lienzo
(`Web · v2 · a sangre` y `Lanzamiento · v5 · campo v7`). Este documento es lo que hay que
construir detrás, ordenado por lo que bloquea a lo demás.

Rama: `feat/zone-heat`, dos commits sobre `main` = `1856749`.

---

## Lo que ya viene en esta rama

| Archivo                              | Qué trae                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------- |
| `supabase/migrations/0014_zones.sql` | Tabla `zones`, `locations.district_code`, `resolve_zone()`, `zone_heat()` |
| `supabase/tests/14_zones_test.sql`   | 14ª suite. Incluye la prueba de la promesa de privacidad                  |
| `scripts/load-zones.mjs`             | Cargador: el andamio y de dónde sale el archivo. **No implementado**      |
| `docs/adr/0006-…`                    | La decisión y lo que deliberadamente **no** promete                       |
| `src/theme/heat.ts`                  | Ramp nuevo — **commit aparte, se puede botar** (ver al final)             |

`npm run verify` en verde, 14 suites SQL en `==> ok`.

**`0014` no trae datos y no está aplicada.** Crea el esquema; las fronteras se cargan aparte.

---

## 1 · Cargar la división del IGN — bloquea todo el mapa

Sin esto `zone_heat()` devuelve vacío, `district_code` queda null en cada lugar, y las dos
pantallas dibujan un país apagado.

**El archivo tiene que venir del IGN**, no de un repositorio abierto. El que se usó para
diseñar trae **83 cantones y 472 distritos** contra los **84 y 494** vigentes. En una lámina
eso no se nota. En producción son **22 zonas que nunca podrían encenderse**, y cada lugar
dentro de ellas resolviendo a null.

Pasos:

1. Bajar los distritos del SNIT/IGN en GeoJSON, WGS84.
2. Verificar que el código de 5 dígitos venga **como texto**. Si el archivo los guardó como
   número, `01101` se volvió `1101` y ya no se puede saber qué dígito se perdió — hay que
   reexportar, no rellenar con ceros.
3. Implementar `scripts/load-zones.mjs`. El comentario de arriba del archivo trae la forma:
   distritos directo, cantones y provincias por `ST_Union` del prefijo, centroide con
   `ST_PointOnSurface` y **no** `ST_Centroid` (el centroide de un distrito en herradura cae
   fuera de él, y entonces la mancha florece sobre el vecino).
4. Correr con la **service role key**, que salta RLS por completo. Nunca en la app, el repo,
   logs de CI ni una captura. Si se filtra: rotarla en Supabase; borrar el commit no alcanza.
5. Rellenar los lugares que ya existen:

   ```sql
   update public.locations set geog = geog where district_code is null;
   ```

   `geog = geog` dispara el trigger, que resuelve. Después revisar qué quedó en null: son
   lugares fuera de la división cargada — mar adentro, coordenadas mal pegadas, o un distrito
   que al archivo le falta. Los tres valen la pena mirarlos uno por uno. **Ninguno se asigna
   a una zona cercana por defecto.**

---

## 2 · Autenticación — bloquea el registro, no el mapa

Los tres métodos de las dos pantallas: Google, Apple y correo. Facebook queda fuera.

**2.1 · Mover la sesión a almacenamiento cifrado.** `src/lib/supabase.ts` usa `AsyncStorage`,
que no está cifrado en ninguna de las dos plataformas: en Android es un XML plano en el
directorio privado, y ahí el refresh token — credencial de larga vida que se renueva sola —
queda legible con root o por respaldo ADB. Va a `expo-secure-store`.

La trampa: SecureStore tiene tope de tamaño por valor y una sesión de Supabase lo pasa. El
adaptador tiene que partir el valor en trozos, o guardar solo el refresh token ahí. **Un
adaptador que falla en silencio deja a todos afuera en el próximo arranque, y no se nota
hasta que pasa.** Esto necesita una prueba antes de salir.

**2.2 · Google y Apple como proveedores** en el panel de Supabase. Apple exige su botón en la
app de iOS si hay login social; en web no es obligatorio, pero quien entró con Apple en el
teléfono tiene que poder entrar igual en la web o pierde la cuenta. Los assets se bajan de
Google Identity y de los Sign in with Apple HIG — los de las láminas son placeholders a
propósito y no se dibujan a mano.

**2.3 · SMTP propio,** o la confirmación de correo no sale. Hoy cualquiera se registra con una
dirección que no es suya.

**2.4 · `expo-linking` y un esquema propio.** `detectSessionInUrl` hoy es solo web, así que el
enlace de confirmación abre el navegador y ahí muere. Sin esto la tercera pantalla de
`Lanzamiento v5` no tiene a dónde volver.

---

## 3 · El endpoint que consume el mapa

`zone_heat(kind, from, to)` ya existe y ya está probado. Lo que falta del lado del cliente:

- El wrapper en `src/lib/`, con `toApiError` como todo lo demás.
- El umbral: **dibujar una celda desde una sesión, y controlar el calor con el denominador,
  no con el umbral.** `t = sesiones / max(REFERENCIA, la zona más llena a la vista)`, con
  REFERENCIA de 14 a nivel cantón y 7 a nivel distrito. Es el mismo patrón de
  `UNCAPPED_REFERENCE = 25` en `heat.ts` — conviene reusarlo y no inventar un segundo
  mecanismo.
- **Contar sesiones, no participantes.** `createActivity` es un insert plano sin fila en
  `activity_participants`, así que toda sesión recién creada tiene `joined_count = 0` aunque
  quien organiza vaya seguro. Umbral por participantes = sesión nueva invisible, que es justo
  al revés de lo que hace falta en el arranque en frío.

---

## 4 · Una decisión de producto que sigue abierta, y toca el backend

Se decidió que **la cuenta es obligatoria** y que no hay exploración anónima. Eso todavía no
está en la base: `0003_rls.sql` le da `SELECT` a `anon` sobre perfiles, categorías, lugares,
comunidades y actividades, con políticas. Hoy **la API permite lo que la interfaz va a
prohibir**.

Si la decisión se mantiene, es una migración que revoca esos grants, y
`03_anon_visibility_test.sql` se reescribe en vez de quedarse fallando. Vale la pena leer el
encabezado de esa prueba antes de decidir: dice que el argumento de arranque en frío de
`docs/architecture.md` depende de que un desconocido vea sesiones reales antes de registrarse.

`zone_heat()` hoy solo se le otorga a `authenticated`. Si al final el mapa se abre a anónimos,
ese grant se amplía — y conviene que sea una decisión explícita, no un descuido.

---

## El commit del ramp se puede botar

`9aa0812` es el único de esta tanda que edita código ya fusionado: cambia los stops de
`src/theme/heat.ts`. Alejandro no lo ha aprobado.

Si no lo quieren todavía:

```bash
git rebase --onto 4d3f0d5 9aa0812 feat/zone-heat
```

`0014` queda intacto. El trabajo de zonas no depende de qué colores use el ramp.

Si lo quieren, lo que trae es: fuera el malva `#A86D65` que la auditoría del 5 de septiembre
marcó y nadie resolvió, y fuera el teal **del ramp** — sigue siendo `accent.cool` y el relleno
del mapa en reposo. Y por primera vez la regla de "la luminancia siempre sube" tiene una
prueba en vez de un comentario.
