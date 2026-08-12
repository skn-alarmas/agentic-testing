# TESTING_STANDARDS.md — Estándar de pruebas E2E

> Norma del equipo. Un test que no cumple esto **no entra**: ni escrito por una
> persona, ni escrito por un agente. Las skills y los agentes de este kit están
> construidos para hacerla cumplir automáticamente.

Ámbito: pruebas end-to-end de frontend (React / Next.js / Vue) con Playwright.
No cubre tests unitarios (vitest/jest) ni de backend, que tienen sus propias reglas.

---

## 0. Los cinco principios

1. **Explorar antes de escribir.** Ningún test se escribe sobre un selector
   supuesto. Se escribe sobre lo que un navegador real mostró.
2. **El test describe una intención de usuario**, no una secuencia de clicks.
3. **Determinismo sobre cobertura.** Un test verde inestable es peor que no
   tener el test: entrena al equipo a ignorar el rojo.
4. **Un fallo es una hipótesis, no un veredicto.** Antes de "arreglar" un test
   hay que decidir si el roto es el test o la app.
5. **La evidencia viaja con el reporte.** Falla sin screenshot/trace = falla no
   reportable.

---

## 1. Estructura de archivos

```
<repo>/
├── tests/
│   └── e2e/
│       ├── _helpers/            # infraestructura compartida (prefijo _)
│       │   ├── session.ts       # login/sesión, cache de credenciales
│       │   ├── evidencia.ts     # screenshots y adjuntos con nombre estable
│       │   ├── red.ts           # guardas de consola y red
│       │   └── datos.ts         # generadores de datos únicos por corrida
│       ├── fixtures/            # fixtures de Playwright (test.extend)
│       ├── <flujo>.spec.ts      # un archivo por flujo de negocio
│       └── ...
├── docs/qa/
│   ├── mapa/<flujo>.md          # mapas de exploración (fuente de los tests)
│   └── reportes/<fecha>-<x>.md  # reportes de corrida
├── playwright.config.ts
└── .e2e-secrets.local           # gitignoreado, NUNCA se commitea
```

**Reglas de nombres**

| Cosa | Convención | Ejemplo |
|---|---|---|
| Archivo spec | `<flujo-de-negocio>.spec.ts`, kebab-case, en español | `checkout-pago-tarjeta.spec.ts` |
| Helper | prefijo `_` o carpeta `_helpers/` | `_helpers/session.ts` |
| `describe` | El flujo, tal como lo nombra el negocio | `describe("Checkout con tarjeta")` |
| `test` | Frase en español: **acción → resultado esperado** | `test("pagar con tarjeta vencida muestra el error del emisor")` |
| Mapa de exploración | `docs/qa/mapa/<flujo>.md` | `docs/qa/mapa/checkout.md` |

**Prohibido** como nombre de archivo: `qa-*`, `test-*`, `debug-*`, `final-*`,
`fix-*`, `nuevo-*`, `v2`, `natural`, o cualquier cosa que describa *cuándo se
escribió* en lugar de *qué prueba*. Si un spec se llama `qa-final-fix.spec.ts`,
nadie sabe si borrarlo.

---

## 2. Escalera de selectores (regla dura)

Se baja un peldaño **sólo** si el de arriba no aplica. En la revisión hay que
poder justificar por qué no se usó el peldaño anterior.

| # | Peldaño | Cuándo | Ejemplo |
|---|---|---|---|
| 1 | **Rol accesible + nombre** | Todo control interactivo con semántica | `getByRole("button", { name: "Confirmar pago" })` |
| 2 | **Label / placeholder** | Campos de formulario | `getByLabel("Número de tarjeta")` |
| 3 | **`data-testid`** | **Obligatorio** cuando no hay semántica estable | `getByTestId("fila-factura-12345")` |
| 4 | **Texto visible** | Sólo para *aserciones*, nunca para navegar | `expect(page.getByText("Pago aprobado")).toBeVisible()` |
| 5 | CSS / XPath | ❌ Prohibido | — |

### Cuándo `data-testid` es obligatorio

No es "preferido": es **requerido** y su ausencia es un bug de la app, no del test.

- Filas, celdas y ítems de listas o tablas → `data-testid="fila-<entidad>-<id>"`
- Contenedores de estado → `data-testid="estado-carga"`, `"estado-vacio"`, `"estado-error"`
- Elementos cuyo texto es dinámico, traducible o formateado (montos, fechas)
- Elementos sin rol nativo (`div` clickeable, wrappers de librerías)
- Cualquier cosa que el test necesite y que hoy sólo se pueda alcanzar por CSS

**Convención de valor:** `<contexto>-<elemento>[-<id>]`, kebab-case, en español,
estable frente a traducciones. `data-testid="checkout-boton-pagar"`, no
`data-testid="btn1"`.

### Regla de doble filo (a11y)

Cuando el elemento **debería** tener semántica y no la tiene, el camino correcto
no es agregar un `data-testid` y seguir: es **reportar el problema de
accesibilidad** y agregar el `data-testid` como puente. Un `<div onClick>` que
no es alcanzable por teclado es un bug para un usuario con lector de pantalla,
y el test es el que lo detectó. Se registra como hallazgo de a11y en el reporte.

---

## 3. Espera y determinismo (anti-flakiness)

### Prohibido sin excepción

```ts
await page.waitForTimeout(2000);              // ❌ sleep arbitrario
await page.waitForLoadState("networkidle");   // ❌ no determinista en SPA
if (await x.isVisible()) { ... }              // ❌ condicional sobre timing
await expect(x).toBeVisible({ timeout: 30000 }); // ❌ timeout inflado para tapar
test.setTimeout(120_000);                      // ❌ salvo justificación escrita
locator.first()                                 // ❌ si es para esquivar ambigüedad
```

### Obligatorio

```ts
// Aserciones web-first: reintentan solas hasta el timeout del proyecto
await expect(page.getByTestId("fila-factura-123")).toBeVisible();
await expect(page.getByRole("status")).toHaveText("Pago aprobado");

// Esperar el efecto observable, no el tiempo
await page.getByRole("button", { name: "Guardar" }).click();
await expect(page.getByTestId("estado-carga")).toBeHidden();

// Esperar una respuesta concreta cuando el efecto no es visual
const resp = page.waitForResponse(r => r.url().includes("/api/pagos") && r.request().method() === "POST");
await page.getByRole("button", { name: "Pagar" }).click();
expect((await resp).status()).toBe(201);
```

### Datos de prueba

- **Únicos por corrida.** Nada de `"test@test.com"` fijo: usar los generadores
  de `_helpers/datos.ts`, sembrados con un id de corrida.
- **Autolimpiantes.** Lo que el test crea, el test lo borra o lo anula, en el
  mismo run. Si no puede, usa un espacio propio (proveedor/tenant/prefijo del test).
- **Sin dependencia entre tests.** Cada `test()` debe pasar corriendo solo, con
  `--repeat-each=3` y en cualquier orden. No compartir estado por variables
  de módulo salvo dentro de un `describe.serial` justificado por escrito.

### Umbral de flakiness

Un test que falla ≥1 de 10 corridas seguidas está **roto**, aunque a veces pase.
Se marca `test.fixme` con link al hallazgo y se arregla; no se le suben retries.

---

## 4. Anatomía de un spec

```ts
/**
 * E2E de <Flujo> — <ruta> — <ticket>.
 *
 * Cadena real que ejercita: front :5175 → /api → BFF :3110 → ORDS → DB.
 * Requisitos para correr: <qué tiene que estar levantado, qué credenciales>.
 *
 * Mapa de exploración: docs/qa/mapa/<flujo>.md
 *
 * Escenarios:
 *   1. Happy path — ...
 *   2. Validación — ...
 *   3. Error del servidor — ...
 */
// `./fixtures` en vez de "@playwright/test": trae las guardas automáticas de
// errores de consola y respuestas 5xx, y el rastro de limpieza.
import { test, expect } from "./fixtures";
import { asegurarSesion } from "./_helpers/session";
import { capturar } from "./_helpers/evidencia";

test.describe("Checkout con tarjeta @critico", () => {
  test.beforeEach(async ({ page, context }) => {
    await asegurarSesion(context);
    await page.goto("/checkout");
  });

  test("pagar con tarjeta válida deja la orden confirmada", async ({ page, consola }) => {
    // Arrange — el estado del que parte el usuario
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();

    // Act — lo que el usuario hace
    await page.getByLabel("Número de tarjeta").fill("4111111111111111");
    await page.getByRole("button", { name: "Pagar" }).click();

    // Assert — lo que el usuario debe ver, más la verdad del backend
    await expect(page.getByTestId("estado-orden")).toHaveText("Confirmada");
    await capturar(page, "checkout-confirmado");
  });
});
```

**Cabecera obligatoria.** Todo spec arranca con el bloque de comentario de
arriba. Explica el *porqué* y las precondiciones, no el *qué* (eso lo dice el
código). Sin cabecera, el spec no pasa revisión.

**Estructura Arrange / Act / Assert** explícita, con esos comentarios o su
equivalente en español. Un `test()` = un comportamiento verificable.

**Aserción dual.** En flujos que escriben datos, no alcanza con que la UI diga
"listo": hay que contrastar contra la misma fuente que consulta el sistema
(endpoint de listado, API, DB). La UI puede mentir.

---

## 5. Etiquetas y niveles de suite

Se etiqueta en el título del `describe` o del `test`:

| Etiqueta | Qué es | Dónde corre | Presupuesto |
|---|---|---|---|
| `@smoke` | ¿La app levanta y se puede entrar? | Cada push, cada deploy | < 60 s |
| `@critico` | Flujos que si se rompen, se pierde plata o se frena la operación | Cada PR | < 5 min |
| `@regresion` | Cobertura amplia, incluye edge cases | Nightly y pre-release | sin tope duro |
| `@lento` | Necesita datos pesados o esperas de sistemas externos | Nightly | — |
| `@manual` | Documentado pero no automatizable hoy | Nunca en CI | — |

```bash
npx playwright test --grep @smoke
npx playwright test --grep-invert @lento
```

Todo test nace `@regresion`. Se **promueve** a `@critico` cuando el flujo tiene
dueño de negocio, y a `@smoke` cuando es la puerta de entrada del sistema.

---

## 6. Configuración obligatoria

```ts
// playwright.config.ts — mínimos no negociables
export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: !!process.env.CI,     // ningún .only llega a CI
  retries: process.env.CI ? 1 : 0,  // 1, no 2: los retries tapan flakiness
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    testIdAttribute: "data-testid",
  },
});
```

- `retries` en CI es **1**, no 2. Dos retries es esconder el problema.
- `trace: "retain-on-failure"` no es opcional: sin trace no hay diagnóstico.
- Nunca `retries` en local.

---

## 7. Secretos y datos sensibles

- Credenciales sólo desde `process.env`, cargadas de `.e2e-secrets.local`
  (gitignoreado) o del secret store de CI.
- Si falta una credencial, el test hace `test.skip` **con mensaje explicativo**;
  nunca falla con un error críptico ni, peor, pasa vacío.
- Prohibido: credenciales en el spec, en el config, en el mapa de exploración,
  en screenshots de evidencia o en el reporte.
- Prohibido correr la suite contra **producción** salvo `@smoke` de sólo lectura
  y con aprobación explícita anotada en el spec.

---

## 8. Definition of Done de un test

Un test está terminado cuando:

- [ ] Existe el mapa de exploración que lo respalda (`docs/qa/mapa/<flujo>.md`)
- [ ] Pasa 3 corridas seguidas: `npx playwright test <spec> --repeat-each=3`
- [ ] Pasa corriendo solo y dentro de la suite completa
- [ ] Falla de verdad si se rompe la funcionalidad (verificado rompiéndola a propósito)
- [ ] Cumple la escalera de selectores, sin CSS ni XPath
- [ ] Sin `waitForTimeout`, sin `networkidle`, sin timeouts inflados
- [ ] Tiene cabecera con precondiciones y escenarios
- [ ] Los `data-testid` que hicieron falta están **en el código de la app**, commiteados junto al test
- [ ] Limpia lo que creó
- [ ] Tiene etiqueta de nivel (`@smoke` / `@critico` / `@regresion`)

El punto 4 es el que más se saltea y el más importante: **un test que no puede
fallar no está probando nada.**

---

## 9. Qué NO automatizar

Escribir estos tests cuesta más de lo que aportan:

- Verificaciones puramente visuales de layout → usar screenshots de referencia
  o revisión humana, no aserciones de píxeles en E2E.
- Reglas de negocio con muchas combinaciones → tests unitarios, no E2E.
- Flujos que dependen de sistemas de terceros sin ambiente de pruebas → mockear
  el borde o marcar `@manual`.
- Cobertura de campos uno por uno en un formulario → un test del formulario
  completo más unitarios de validación.

**Un E2E prueba que las piezas están bien conectadas, no que cada pieza es correcta.**

---

## 10. Cómo se hace cumplir

| Control | Cuándo | Herramienta |
|---|---|---|
| Escalera de selectores, prohibiciones, naming | Antes de commitear | `/enforce-standards` |
| Cobertura y calidad del test | En el PR | `reviewer-agent` |
| Flakiness | Nightly | `/regression-suite` con `--repeat-each` |
| `forbidOnly` | CI | Playwright |

Una excepción a este estándar se documenta **en el mismo archivo**, con el
motivo y qué habría que cambiar para eliminarla. Excepción sin comentario =
violación.
