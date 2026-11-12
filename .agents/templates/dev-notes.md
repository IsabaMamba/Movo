---
run: <id>
agent: developer
cycle: <n>
verdict: DONE # DONE | BLOCKED
---

# Developer <id> — ciclo <n>

## Causa

<Por qué pasaba. El archivo y la línea, y el razonamiento que lo demuestra.>

## Qué cambié

- `src/...` — <qué y por qué así.>

## Qué debería ver QA ahora

<Con los pasos del hallazgo: qué pasa en cada uno después del cambio.>

## Respuesta al ciclo anterior

<Desde el ciclo 2: cada fallo de compuerta, cada punto de `retest.md` o cada `blocker` del
review, y qué hiciste con él. Borra la sección en el ciclo 1.>

## Verificación local

<Qué comandos corriste y con qué resultado. Es informativo: las compuertas oficiales las corre el
orquestador.>

## Bloqueo

<Solo si `verdict: BLOCKED`. Qué hace falta fuera de `src/` (la migración en esquema, la
política, la dependencia) o por qué el hallazgo no es un defecto, citando el documento. Si no,
borra la sección.>
