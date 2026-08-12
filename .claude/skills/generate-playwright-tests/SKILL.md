---
name: generate-playwright-tests
description: Genera tests Playwright de alta calidad a partir de un mapa de exploración. Escribe specs deterministas siguiendo la escalera de selectores, agrega los data-testid faltantes al código de la app, corre los tests, y verifica que fallan cuando deben. Usalo después de /explore-app, o cuando pidan escribir, generar o agregar tests E2E.
---

# Generate Playwright Tests — de mapa a suite

Convertís un mapa de exploración en tests que van a seguir sirviendo dentro de
seis meses. Sos el único agente autorizado a tocar el código de la app, y **sólo**
para agregar atributos `data-testid`.

Norma completa: `TESTING_STANDARDS.md`. Ante conflicto, gana ese archivo.

---

## Precondición inflexible

**Sin mapa no hay test.**

```bash
ls docs/qa/mapa/<flujo>.md
```

Si no existe: parás e invocás `/explore-app`. No escribas tests "provisorios"
mientras tanto — un test provisorio con selectores inventados se queda para
siempre y falla para siempre.

Si el mapa existe pero está viejo (la app cambió, el mapa tiene semanas),
verificá el camino principal en el navegador antes de usarlo.

---

## Proceso

### 1. Leer el mapa y planificar

Del mapa salen tres listas:

- **Escenarios** a automatizar (los que te pidieron, o los candidatos del mapa)
- **Selectores** disponibles, con su peldaño
- **`data-testid` faltantes**, con archivo y línea

Mostrá el plan antes de escribir:

```
tests/e2e/checkout.spec.ts — 4 tests
  @critico   pagar con tarjeta válida deja la orden confirmada
  @critico   tarjeta vencida muestra el error del emisor y no cobra
  @regresion carrito vacío no permite llegar al pago
  @regresion doble click en Pagar genera una sola orden

data-testid a agregar en la app (3):
  src/pages/Checkout.tsx:88   fila-item-${item.id}
  src/pages/Checkout.tsx:140  estado-orden
  src/pages/Checkout.tsx:96   checkout-total
```

### 2. Agregar los `data-testid` faltantes

Primero la app, después el test. Al revés escribís contra selectores que no existen.

```tsx
// src/pages/Checkout.tsx
- <tr key={item.id}>
+ <tr key={item.id} data-testid={`fila-item-${item.id}`}>

- <span className="badge">{orden.estado}</span>
+ <span className="badge" data-testid="estado-orden">{orden.estado}</span>
```

**Límites:**
- Sólo agregás el atributo. Nada de refactors, renombres ni "de paso arreglo esto".
- Si el elemento debería tener semántica y no la tiene (un `<div onClick>`),
  agregás el `data-testid` **y** registrás el hallazgo de a11y. No arreglás la
  semántica vos: eso cambia comportamiento y va en su propio cambio.
- Convención: `<contexto>-<elemento>[-<id>]`, kebab-case, español, estable
  frente a traducciones.

### 3. Escribir el spec

Plantilla base — la cabecera es obligatoria:

```ts
/**
 * E2E de Checkout — /checkout — #1234.
 *
 * Cadena real: front :5173 → /api → BFF :3100 → pasarela (sandbox).
 * Requisitos: BFF levantado y credenciales en `.e2e-secrets.local`.
 *
 * ⚠️ Este flujo CREA órdenes reales en el sandbox. Cada test usa su propio
 * comprador (datos.emailUnico) y el `rastro` anula lo que creó al terminar.
 *
 * Mapa de exploración: docs/qa/mapa/checkout.md
 *
 * Escenarios:
 *   1. Happy path — tarjeta válida → orden confirmada (+ verificación por API)
 *   2. Tarjeta vencida → error del emisor, sin cobro
 *   3. Carrito vacío → no se llega al pago
 *   4. Doble click en Pagar → una sola orden  (regresión del hallazgo #1)
 */
// Desde ./fixtures, no desde "@playwright/test": trae las guardas de consola
// y de respuestas 5xx, y el `rastro` que limpia lo creado.
import { test, expect } from "./fixtures";
import { asegurarSesion, hayCredenciales, MOTIVO_SIN_CREDENCIALES } from "./_helpers/session";
import { capturar } from "./_helpers/evidencia";
import { contarLlamadas } from "./_helpers/red";
import { emailUnico, TARJETAS } from "./_helpers/datos";

test.describe("Checkout con tarjeta @critico", () => {
  test.skip(!hayCredenciales(), MOTIVO_SIN_CREDENCIALES);

  test.beforeEach(async ({ page, context }) => {
    await asegurarSesion(context);
    await page.goto("/checkout");
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
  });

  test("pagar con tarjeta válida deja la orden confirmada", async ({
    page,
    request,
    rastro,
  }) => {
    // Arrange
    await expect(page.getByTestId("checkout-total")).not.toBeEmpty();

    // Act
    await page.getByLabel("Correo").fill(emailUnico());
    await page.getByLabel("Número de tarjeta").fill(TARJETAS.aprobada);
    await page.getByLabel("Vencimiento").fill("12/30");
    const respuesta = page.waitForResponse(
      r => r.url().includes("/api/pagos") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Pagar" }).click();

    // Assert — en la UI...
    expect((await respuesta).status()).toBe(201);
    await expect(page.getByTestId("estado-orden")).toHaveText("Confirmada");
    await capturar(page, "checkout-confirmado");

    // ...y en la fuente de verdad (aserción dual). La UI puede mostrar
    // "Confirmada" sin que el backend haya persistido nada.
    const { ordenId } = await (await respuesta).json();
    rastro.anotar("ordenes", ordenId);   // se limpia solo en el teardown
    const enApi = await request.get(`/api/ordenes/${ordenId}`);
    expect(enApi.ok()).toBe(true);
    expect((await enApi.json()).estado).toBe("CONFIRMADA");
  });

  test("doble click en Pagar genera una sola orden", async ({ page }) => {
    await page.getByLabel("Número de tarjeta").fill(TARJETAS.aprobada);
    await page.getByLabel("Vencimiento").fill("12/30");

    const pagos = contarLlamadas(page, "/api/pagos", "POST");
    const boton = page.getByRole("button", { name: "Pagar" });

    await boton.click();
    // El segundo click debería rebotar contra el `disabled`.
    await boton.click({ force: true, timeout: 1000 }).catch(() => {});

    await expect(page.getByTestId("estado-orden")).toHaveText("Confirmada");
    await pagos.esperarQueSean(1);
  });
});
```

### 4. Correr y verificar

```bash
npx playwright test tests/e2e/checkout.spec.ts --reporter=list
npx playwright test tests/e2e/checkout.spec.ts --repeat-each=3   # 3 verdes
```

### 5. Verificar que el test PUEDE fallar

El paso que casi todos se saltean, y el que separa un test de un adorno.

Por cada test, rompé lo que verifica y confirmá el rojo:

| Test | Cómo romperlo | Debe fallar en |
|---|---|---|
| happy path | comentar el `POST /api/pagos` en la app | la aserción del estado |
| doble click | quitar el `disabled` del botón | el conteo de órdenes |
| validación | quitar la validación del campo | la aserción del mensaje |

Y **revertí el cambio**. Si el test sigue verde con la app rota, el test está mal
escrito: casi siempre porque afirma algo demasiado débil (`toBeVisible()` sobre
un contenedor que siempre existe).

Documentá qué rompiste y qué pasó:

```
Verificación de falla:
  ✅ happy path — comenté el POST → falló en "estado-orden" (esperado)
  ✅ doble click — saqué el disabled → falló, encontró 2 órdenes (esperado)
  ⚠️ carrito vacío — vacié el carrito y siguió verde → la aserción era
     toBeVisible() sobre el contenedor. Cambiada a toHaveText("Tu carrito está vacío").
```

---

## Catálogo de patrones

### Esperar un efecto, nunca el reloj

```ts
// ❌
await page.click("#guardar");
await page.waitForTimeout(2000);
expect(await page.textContent(".estado")).toBe("Guardado");

// ✅
await page.getByRole("button", { name: "Guardar" }).click();
await expect(page.getByTestId("estado-guardado")).toHaveText("Guardado");
```

### Listas y tablas

```ts
// ✅ por testid con id de negocio — sobrevive al reordenamiento
await expect(page.getByTestId(`fila-factura-${nroFactura}`)).toBeVisible();

// ✅ conteo
await expect(page.getByTestId(/^fila-factura-/)).toHaveCount(3);

// ❌ por posición — se rompe con cualquier orden nuevo
await expect(page.locator("tr").nth(2)).toContainText("12345");
```

### Estados de carga, vacío y error

```ts
await expect(page.getByTestId("estado-carga")).toBeHidden();
await expect(page.getByTestId("estado-vacio")).toHaveText("No hay facturas");
```

### Simular fallas del backend

```ts
await page.route("**/api/pagos", (route) =>
  route.fulfill({ status: 500, body: JSON.stringify({ error: "Servicio caído" }) }),
);
await page.getByRole("button", { name: "Pagar" }).click();
await expect(page.getByRole("alert")).toContainText("No pudimos procesar el pago");
```

### Datos únicos por corrida

```ts
// _helpers/datos.ts
const RUN = `${Date.now() % 1_000_000}`;
export const emailUnico = () => `e2e.${RUN}.${contador++}@ejemplo.test`;
```

### Autolimpieza

```ts
const creados: string[] = [];
test.afterEach(async ({ request }) => {
  for (const id of creados.splice(0)) {
    await request.delete(`/api/ordenes/${id}`).catch(() => {});
  }
});
```

---

## Reglas duras

1. **Sin mapa no hay test.**
2. **Ningún selector que no esté en el mapa o confirmado en el navegador.**
3. **Escalera de selectores.** CSS y XPath, prohibidos. Si bajaste de peldaño,
   el comentario dice por qué.
4. **Sin `waitForTimeout`, `networkidle`, timeouts inflados, `.first()` para
   esquivar ambigüedad, ni `if (isVisible)`.**
5. **Cada test pasa solo y en cualquier orden.**
6. **En la app sólo agregás `data-testid`.** Nada más.
7. **No entregás un test que no viste pasar 3 veces y fallar 1 a propósito.**
8. **No commiteás.** Dejás el árbol listo y lo decís.
9. **Reportá lo que no cubriste.**

---

## Errores típicos

| Error | Qué produce |
|---|---|
| `toBeVisible()` sobre un contenedor siempre presente | Test que nunca falla |
| Asertar montos formateados por texto | Rojo cada vez que cambia el locale |
| Un test que depende del anterior | Cascada de rojos por una causa |
| Un `test()` con 40 pasos | Falla y no sabés en qué parte del negocio |
| `retries: 2` para "estabilizar" | Flakiness escondida, no resuelta |
| Reusar `"test@test.com"` | Choques entre corridas, tests que fallan de a ratos |
