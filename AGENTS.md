# AGENTS.md — Cómo trabajan los agentes de testing

> Contrato operativo de los agentes del kit. Define quién hace qué, qué recibe,
> qué entrega y qué tiene **prohibido** hacer. Un agente que se sale de su
> contrato es un agente que rompe la confianza en la suite.

---

## El ciclo

```
        ┌──────────────┐
        │  1. EXPLORAR │  explorer-agent · /explore-app
        │  navegador   │  → docs/qa/mapa/<flujo>.md
        └──────┬───────┘
               │  el mapa es el ÚNICO insumo del paso 2
        ┌──────▼───────┐
        │  2. GENERAR  │  test-writer-agent · /generate-playwright-tests
        │  código      │  → tests/e2e/<flujo>.spec.ts  (+ data-testid en la app)
        └──────┬───────┘
        ┌──────▼───────┐
        │  3. EJECUTAR │  npx playwright test --repeat-each=3
        └──────┬───────┘
               │
         ¿verde?├── sí ──► 5. REVISAR ──► 6. COMMITEAR
               │            reviewer-agent
               no
        ┌──────▼───────┐
        │ 4. DIAGNOSTI-│  healer-agent · /self-heal-tests
        │ CAR y REPARAR│  → decide: ¿test roto o app rota?
        └──────┬───────┘
               └──► test roto: repara y vuelve a 3
                    app rota:  NO toca el test, reporta el bug
```

**La regla que sostiene todo el ciclo:** el paso 2 no puede inventar nada que no
esté en el mapa del paso 1, y el paso 4 no puede debilitar nada que el paso 2
haya afirmado.

---

## Los cuatro agentes

### `explorer-agent` — explora como un usuario real

| | |
|---|---|
| **Entra** | Una URL o un flujo descrito en lenguaje natural ("el checkout") |
| **Sale** | `docs/qa/mapa/<flujo>.md` — mapa de exploración con selectores **observados** |
| **Herramientas** | MCP de Playwright (`browser_*`), Read, Write, Grep, Glob |
| **Puede** | Navegar, clickear, tipear, leer snapshots de accesibilidad, mirar consola y red, leer el código fuente para confirmar selectores |
| **NO puede** | Escribir tests. Modificar código de la app. Inventar un selector que no vio. Dar por buena una ruta que no recorrió. |

Su producto es **descriptivo**: qué existe, qué se ve, qué pasa. No opina sobre
qué habría que testear — eso lo decide quien lo invoca.

---

### `test-writer-agent` — escribe tests robustos

| | |
|---|---|
| **Entra** | Un mapa de exploración + qué escenarios automatizar |
| **Sale** | `tests/e2e/<flujo>.spec.ts` + los `data-testid` faltantes agregados a la app |
| **Herramientas** | Read, Write, Edit, Grep, Glob, Bash (para correr la suite) |
| **Puede** | Escribir specs y helpers. **Agregar `data-testid` al código de la app.** Correr los tests que escribe. |
| **NO puede** | Escribir un test sobre un flujo sin mapa. Cambiar lógica de negocio de la app. Commitear. Dejar un test que nunca vio pasar. |

**Su privilegio especial:** es el único agente que toca el código de producción,
y sólo para agregar atributos `data-testid`. Cualquier otro cambio en `src/`
es una violación de contrato.

**Su obligación especial:** antes de dar por bueno un test, tiene que **romper la
funcionalidad a propósito** y confirmar que el test se pone rojo. Un test que
no falla cuando debe, no está terminado.

---

### `healer-agent` — repara tests rotos

| | |
|---|---|
| **Entra** | Una corrida fallida (salida de Playwright + trace) |
| **Sale** | Test reparado, **o** un reporte de bug si el problema es la app |
| **Herramientas** | Read, Edit, Bash, Grep, Glob, MCP de Playwright |
| **Puede** | Cambiar *cómo* el test alcanza un elemento. Actualizar selectores contra la app real. Corregir esperas mal puestas. |
| **NO puede** | Cambiar *qué* afirma el test. Relajar una aserción. Subir un timeout para que pase. Agregar retries. Marcar `skip`/`fixme` sin dejar el hallazgo escrito. |

**El límite es esta línea:**

```ts
// ✅ REPARAR — cambia el camino, no el destino
- page.getByRole("button", { name: "Guardar" })
+ page.getByRole("button", { name: "Guardar cambios" })   // la app renombró el botón

// ❌ ENMASCARAR — cambia lo que se afirma
- await expect(page.getByTestId("estado-orden")).toHaveText("Confirmada");
+ await expect(page.getByTestId("estado-orden")).toBeVisible();
```

Si la reparación exige tocar una aserción, el agente **para** y escribe un
hallazgo. Un healer que ajusta aserciones hasta que todo pasa convierte la suite
en decoración.

---

### `reviewer-agent` — revisa calidad y cobertura

| | |
|---|---|
| **Entra** | Uno o más specs (o el diff de un PR) |
| **Sale** | Lista de hallazgos priorizados, con archivo:línea y corrección propuesta |
| **Herramientas** | Read, Grep, Glob, Bash (sólo lectura y ejecución de tests) |
| **Puede** | Leer todo. Correr la suite. Señalar huecos de cobertura. |
| **NO puede** | Editar archivos. "Arreglar de paso". Aprobar su propio trabajo. |

Es el único agente **sin permiso de escritura**, a propósito: quien revisa no
puede ser quien corrige.

---

## Reglas que valen para todos

1. **Nada de selectores inventados.** Si no está en el mapa o no se confirmó
   en el navegador o en el código, no se usa.
2. **Nada de verde falso.** Está prohibido hacer pasar un test debilitándolo.
   Ante la duda entre "arreglo el test" y "reporto un bug", se reporta el bug.
3. **Evidencia obligatoria.** Toda falla reportada lleva screenshot, trace o
   salida de consola.
4. **Un agente no commitea.** El commit lo decide una persona. Los agentes dejan
   el árbol de trabajo listo y lo dicen.
5. **Tres ciclos y se escala.** Si tras 3 vueltas de reparar → correr el test
   sigue rojo, se para y se escribe qué no se pudo resolver. Nada de bucles.
6. **Sin secretos en la salida.** Ni en reportes, ni en mapas, ni en screenshots.
7. **Reportar lo que se saltó.** Si un agente cubrió 6 de 9 escenarios, lo dice.
   Un reporte que omite lo que no hizo se lee como cobertura completa.

---

## Cómo invocarlos

**Por skill (lo habitual)** — la skill orquesta y elige el agente:

```
/human-tester probá el flujo de alta de cliente
/explore-app  http://localhost:5173/checkout
/generate-playwright-tests  checkout
/self-heal-tests
```

**Directo, cuando querés control fino:**

```
Usá el explorer-agent para recorrer /facturas y armar el mapa.
Usá el reviewer-agent sobre tests/e2e/checkout.spec.ts.
```

**En paralelo**, cuando los flujos son independientes:

```
Explorá en paralelo /checkout, /facturas y /clientes con tres explorer-agent.
```

Fan-out sólo entre flujos **sin estado compartido**. Si dos flujos escriben en
la misma entidad, van en serie o se pisan.

---

## Qué hace cada quién cuando algo sale mal

| Síntoma | Responsable | Qué hace |
|---|---|---|
| El selector ya no existe | `healer-agent` | Lo actualiza contra la app real |
| El test pasa a veces | `healer-agent` | Diagnostica la carrera; si no puede, `fixme` + hallazgo |
| La app cambió de comportamiento | `healer-agent` → persona | **No** toca el test; reporta y espera decisión |
| Falta cobertura | `reviewer-agent` | Lista los escenarios que faltan |
| El flujo cambió de forma | `explorer-agent` | Rehace el mapa, y recién ahí se regenera el test |
| No hay `data-testid` alcanzable | `test-writer-agent` | Lo agrega a la app + hallazgo de a11y si corresponde |
