---
run: <id>
agent: qa
verdict: SWEEP_DONE # SWEEP_DONE | BLOCKED
area: <área recorrida>
---

# Sweep <id> — <área>

## Qué recorrí

<Si el área era `auto`: cuál elegiste y por qué.>

| Flujo | Como quién | Resultado       |
| ----- | ---------- | --------------- |
| <...> | <...>      | ok / F-<número> |

## Hallazgos

| Id         | Severidad | Título |
| ---------- | --------- | ------ |
| F-<número> | major     | <...>  |

## Lo que funciona

<Lo que recorriste de punta a punta sin problemas. Vale tanto como los hallazgos: es lo que ya
no hace falta mirar a mano.>

## Lo que no pude probar

<Pantallas a las que no llegaste y por qué: hace falta el proyecto alojado, una fila que solo se
crea con SQL, un permiso del navegador.>

## Preguntas

<Cosas que no sabes si son intencionales. Las decide una persona. "Ninguna" si no hay.>

## Motivo del bloqueo

<Solo si `verdict: BLOCKED`. Si no, borra esta sección.>
