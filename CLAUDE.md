# CLAUDE.md — Testing agentic (kit del equipo)

> Este archivo se instala en el repo de cada app (o se fusiona con su CLAUDE.md).
> Le dice a Claude Code cómo se prueban las cosas acá.

## Qué es este sistema

Un equipo de skills y agentes que prueban el frontend **como lo probaría una
persona**: primero recorren la app en un navegador real, después escriben los
tests, los corren, diagnostican lo que falla y lo reparan — sin inventar
selectores y sin hacer pasar tests a la fuerza.

Lo local, lo versionado y lo gratis es el punto: los tests viven en este repo,
se revisan en el PR y no dependen de ningún servicio externo.

## Documentos que mandan

| Archivo | Qué define |
|---|---|
| `TESTING_STANDARDS.md` | **La norma.** Selectores, esperas, naming, DoD. Ante conflicto, gana este archivo. |
| `AGENTS.md` | Contrato de cada agente: qué puede y qué no |
| `PROMPTS.md` | Prompts listos para copiar |

## El ciclo

**Explorar → Generar → Ejecutar → Diagnosticar → Reparar → Revisar → Commitear**

Nunca se saltea el primer paso. Un test escrito sin haber recorrido la app es
un test escrito sobre suposiciones, y las suposiciones son la causa número uno
de suites que nadie mantiene.

## Skills disponibles

| Skill | Para qué | Invocación |
|---|---|---|
| `human-tester` | **Punto de entrada.** Orquesta el ciclo completo | `/human-tester <flujo>` |
| `explore-app` | Recorre la app y produce el mapa del flujo | `/explore-app <url o flujo>` |
| `generate-playwright-tests` | Escribe los tests desde el mapa | `/generate-playwright-tests <flujo>` |
| `self-heal-tests` | Diagnostica y repara lo que falla | `/self-heal-tests [spec]` |
| `enforce-standards` | Audita cumplimiento de la norma | `/enforce-standards` |
| `regression-suite` | Mantiene la suite de regresión | `/regression-suite` |
| `team-onboarding` | Deja el entorno andando en minutos | `/team-onboarding` |

Si no sabés cuál usar: **`/human-tester`** y describí lo que querés probar.

## Agentes

`explorer-agent` · `test-writer-agent` · `healer-agent` · `reviewer-agent`
→ contratos completos en `AGENTS.md`.

## Las cinco reglas que no se negocian

1. **Explorar antes de escribir.** Ningún selector sale de la imaginación.
2. **Escalera de selectores:** rol accesible → label → `data-testid` → texto
   (sólo para aserciones). **CSS y XPath prohibidos.**
3. **`data-testid` obligatorio** donde no hay semántica estable: filas, celdas,
   estados de carga/vacío/error, textos dinámicos o traducibles.
4. **Sin `waitForTimeout`, sin `networkidle`, sin timeouts inflados.** Se espera
   el efecto observable, no el reloj.
5. **Nunca hacer pasar un test debilitándolo.** Si la app se rompió, se reporta
   el bug; el test se queda rojo.

## Comandos

```bash
npm run test:e2e                    # suite completa
npm run test:e2e:smoke              # sólo @smoke  (< 60s)
npm run test:e2e:critico            # sólo @critico (< 5 min)
npm run test:e2e:ui                 # modo UI, para depurar a ojo
npx playwright test <spec> --repeat-each=3   # verificar que no es flaky
npx playwright show-trace test-results/<...>/trace.zip
```

## Dónde vive cada cosa

```
tests/e2e/<flujo>.spec.ts     tests
tests/e2e/_helpers/           sesión, evidencia, guardas de red, datos
docs/qa/mapa/<flujo>.md       mapas de exploración (insumo de los tests)
docs/qa/reportes/             reportes de corrida
.e2e-secrets.local            credenciales — GITIGNOREADO, nunca se commitea
```

## Precondiciones para correr E2E

<!-- COMPLETAR POR PROYECTO — el kit no puede adivinar esto -->

- App levantada en: `http://localhost:____`
- Backend / BFF levantado en: `____`
- Credenciales en `.e2e-secrets.local` (ver `.e2e-secrets.local.example`)
- Ambiente de datos: `____` (nunca producción)

## Antes de commitear un test

```bash
npx playwright test <spec> --repeat-each=3   # 3 corridas verdes
```
Y romper la funcionalidad a propósito para confirmar que el test se pone rojo.
Un test que no puede fallar no está probando nada.
