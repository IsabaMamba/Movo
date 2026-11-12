---
run: <id>
agent: reviewer
cycle: <n>
verdict: APPROVE # APPROVE | REQUEST_CHANGES
blockers: 0
---

# Review <id> — ciclo <n>

## Para la persona

<Tres o cuatro frases sin jerga: qué cambió, qué tan seguro estás y por qué, y qué conviene
mirar a mano antes de fusionar.>

## Checklist

| Punto                 | Resultado  | Nota |
| --------------------- | ---------- | ---- |
| Arregla la causa      | ok / falla |      |
| Seguridad             | ok / falla |      |
| Manejo de errores     | ok / falla |      |
| Legibilidad           | ok / falla |      |
| Convenciones del repo | ok / falla |      |
| Tests                 | ok / falla |      |

## Hallazgos

`blocker` obliga a REQUEST_CHANGES. `minor` no bloquea.

1. **blocker** — `src/features/x/Y.tsx:42` — <qué está mal, por qué importa, qué se espera.>
2. **minor** — `src/lib/x.ts:57` — <...>

## Tests debilitados y supresiones

<Uno por uno, de `gates-<n>.json`: ¿la expectativa que se quitó estaba mal, o se quitó para
llegar a verde? "No hubo" si las dos listas están vacías.>
