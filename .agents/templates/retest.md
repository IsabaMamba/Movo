---
run: <id>
agent: qa
cycle: <n>
verdict: FIXED # FIXED | NOT_FIXED | BLOCKED
---

# Retest <id> — ciclo <n>

## Los pasos del hallazgo

| Paso  | Qué vi |
| ----- | ------ |
| <...> | <...>  |

## Por otra ruta

<El mismo flujo con otra cuenta o desde otra entrada, y qué viste.>

## Alrededor

<Las pantallas de antes y de después. Qué revisaste y si algo cambió para mal.>

## Evidencia

- Captura: `.agents/qa/out/<archivo>.png`
- Consola: <...>
- Red: <...>

## Qué sigue fallando

<Solo si `verdict: NOT_FIXED`. Exactamente qué hiciste y qué viste: el Developer solo tiene este
archivo. Si no, borra la sección.>
