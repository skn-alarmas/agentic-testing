# CLAUDE.md — Testing de backend (kit del equipo)

> Este archivo se instala en el repo de cada servicio (o se fusiona con su
> CLAUDE.md). Le dice a Claude Code cómo se prueba el backend acá.

## Qué es este sistema

Un equipo de skills y agentes que prueban la API con **paranoia controlada**:
primero mapean los endpoints reales, después cubren las nueve dimensiones
obligatorias, escriben los tests, los corren, diagnostican lo que falla y lo
reparan — sin inventar endpoints y sin hacer pasar tests a la fuerza.

Lo local, lo versionado y lo gratis es el punto: los tests viven en este repo,
se revisan en el PR y no dependen de ningún servicio externo.

Es el hermano de `TESTING_STANDARDS.md` (frontend). Mismo ciclo, mismas reglas
de fondo, distinto objeto de prueba.

## Documentos que mandan

| Archivo | Qué define |
|---|---|
| `BACKEND_TESTING_STANDARDS.md` | **La norma.** Dimensiones, tres capas, control positivo, códigos HTTP, DoD. Ante conflicto, gana este archivo. |
| `BACKEND_AGENTS.md` | Contrato de cada agente: qué puede y qué no |
| `BACKEND_PROMPTS.md` | Prompts listos para copiar |

## El ciclo

**Mapear → Planificar las 9 dimensiones → Generar → Ejecutar → Diagnosticar →
Criticar cobertura → Entregar**

Nunca se saltea el primer paso. Un test escrito sobre un endpoint imaginado es
un rojo garantizado — o peor, un verde que no prueba nada porque la ruta no
existe.

## Skills disponibles

| Skill | Para qué | Invocación |
|---|---|---|
| `backend-rigorous-tester` | **Punto de entrada.** Orquesta el ciclo completo | `/backend-rigorous-tester <recurso>` |
| `api-contract-validator` | Valida (o genera) el contrato OpenAPI | `/api-contract-validator` |
| `security-penetration-tester` | Catálogo OWASP API sobre endpoints propios | `/security-penetration-tester <recurso>` |
| `data-integrity-guardian` | Transacciones, estados, agregados, concurrencia | `/data-integrity-guardian <recurso>` |
| `negative-edge-case-generator` | Casos negativos y de borde, sistemáticos | `/negative-edge-case-generator <endpoint>` |
| `backend-self-heal` | Diagnostica y repara lo que falla | `/backend-self-heal [archivo]` |
| `backend-standards-enforcer` | Audita cumplimiento de la norma | `/backend-standards-enforcer` |
| `backend-onboarding` | Deja el entorno andando en minutos | `/backend-onboarding` |

Si no sabés cuál usar: **`/backend-rigorous-tester`** y describí qué querés probar.

## Agentes

`api-explorer-agent` · `contract-enforcer-agent` · `security-attacker-agent` ·
`data-chaos-agent` · `backend-healer-agent` · `coverage-critic-agent`
→ contratos completos en `BACKEND_AGENTS.md`.

## Las nueve dimensiones

Ningún endpoint está cubierto hasta que las nueve tienen veredicto —
incluido "no aplica, porque X".

| | | | |
|---|---|---|---|
| **D1** contrato | **D2** happy path | **D3** autenticación | |
| **D4** autorización | **D5** validación | **D6** bordes | |
| **D7** errores | **D8** integridad | **D9** concurrencia | |

Matriz viva en `docs/qa/api/cobertura.md`.

## Las seis reglas que no se negocian

1. **Mapear antes de escribir.** Ningún endpoint sale de la imaginación.
2. **`200 OK` no es evidencia.** Los tests que escriben afirman en **tres capas**:
   respuesta → contrato → fuente de verdad.
3. **Todo test de rechazo lleva control positivo.** Si el ataque falla, hay que
   demostrar que podía haber funcionado.
4. **El código exacto.** `toBe(422)`, nunca `toBeLessThan(500)` ni `not.toBe(200)`.
5. **Sin sleeps.** Se espera la condición con `esperarQue` y motivo escrito.
6. **Nunca hacer pasar un test debilitándolo.** Si el servicio se rompió, se
   reporta el bug; el test se queda rojo.

## Comandos

```bash
npm run test:api                 # suite completa
npm run test:api:smoke           # ¿el entorno está bien?      (< 30 s)
npm run test:api:critico         # lo que no puede romperse    (< 5 min)
npm run test:api:seguridad       # el catálogo OWASP
npm run test:api:contrato        # cumplimiento del contrato
npm run test:api:aleatorio       # 3 corridas en orden aleatorio ← antes de commitear
npx vitest run tests/api/<archivo>.test.ts --reporter=verbose
```

## Dónde vive cada cosa

```
tests/api/<recurso>.test.ts            tests funcionales
tests/api/<recurso>.seguridad.test.ts  D3 y D4
tests/api/_helpers/                    entorno · cliente · auth · contrato · db · datos · payloads · concurrencia
docs/qa/api/mapa/<recurso>.md          mapas de endpoints (insumo de los tests)
docs/qa/api/cobertura.md               matriz endpoint × dimensión
docs/qa/api/reportes/                  reportes de corrida y hallazgos
.api-secrets.local                     credenciales — GITIGNOREADO, nunca se commitea
```

## Precondiciones para correr la suite

<!-- COMPLETAR POR PROYECTO — el kit no puede adivinar esto -->

- Servicio levantado en: `http://localhost:____`
- Base de datos: `____` (migrada, con los seeds de prueba)
- Contrato en: `____` (o `API_CONTRATO=ninguno`, y D1 queda sin cubrir)
- Identidades en `.api-secrets.local` (ver `.api-secrets.local.example`).
  **`otroUsuario` no es opcional**: sin una segunda identidad no se puede
  probar IDOR.
- Ambiente de datos: `____` (**nunca producción**)

## Antes de commitear un test

```bash
npm run test:api:aleatorio       # 3 corridas verdes, en orden aleatorio
```

Y **rompé el servicio a propósito** para confirmar que el test se pone rojo:
comentá un filtro de autorización, devolvé 200 en vez de 201, sacá una
validación. Un test que no puede fallar no está probando nada — y en backend es
especialmente fácil escribir uno sin darse cuenta.
