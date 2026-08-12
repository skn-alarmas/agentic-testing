# Spec de referencia

Ejemplo anotado con todos los patrones del estándar. **No es un test que corre**
(las rutas y endpoints son inventados): es el modelo a copiar.

Cada bloque marcado con 📌 explica una decisión que hay que replicar.

````ts
/**
 * 📌 CABECERA OBLIGATORIA (§4 del estándar).
 * Explica el POR QUÉ y las precondiciones. El QUÉ lo dice el código.
 *
 * E2E de Checkout — /checkout — #1234.
 *
 * Cadena real: front :5173 → /api → BFF :3100 → pasarela (sandbox).
 * Requisitos: BFF levantado y credenciales en `.e2e-secrets.local`.
 *
 * ⚠️ Este flujo CREA órdenes en el sandbox. Cada test usa su propio comprador
 * y el `rastro` las anula al terminar.
 *
 * Mapa de exploración: docs/qa/mapa/checkout.md
 *
 * Escenarios:
 *   1. Happy path — tarjeta válida → orden confirmada (+ verificación por API)
 *   2. Tarjeta vencida → error del emisor, sin cobro
 *   3. Carrito vacío → no se llega al pago
 *   4. Doble click en Pagar → una sola orden  (regresión del hallazgo #1 del mapa)
 *   5. API caída → mensaje claro, sin pantalla en blanco
 */

// 📌 Importar desde ./fixtures, no desde @playwright/test:
//    trae las guardas de consola y 5xx y el rastro de limpieza.
import { test, expect } from "./fixtures";
import { asegurarSesion, hayCredenciales, MOTIVO_SIN_CREDENCIALES, vencerSesion } from "./_helpers/session";
import { capturar, anotarHallazgo } from "./_helpers/evidencia";
import { contarLlamadas, esperarRespuesta, simularFalla } from "./_helpers/red";
import { emailUnico, TARJETAS } from "./_helpers/datos";

// 📌 ETIQUETA DE NIVEL en el título del describe (§5).
test.describe("Checkout con tarjeta @critico", () => {
  // 📌 Si faltan credenciales, SKIP CON MOTIVO — nunca un error críptico
  //    ni, peor, un test que pasa vacío.
  test.skip(!hayCredenciales(), MOTIVO_SIN_CREDENCIALES);

  test.beforeEach(async ({ page, context }) => {
    await asegurarSesion(context);
    await page.goto("/checkout");
    // 📌 Punto de partida verificado: si esto falla, el error apunta al setup
    //    y no a la mitad del test.
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────────
  // 1. Happy path
  // ─────────────────────────────────────────────────────────────────────
  test("pagar con tarjeta válida deja la orden confirmada", async ({
    page,
    request,
    rastro,
  }) => {
    // Arrange — el estado del que parte el usuario
    await expect(page.getByTestId("checkout-total")).not.toBeEmpty();

    // Act — lo que el usuario hace
    // 📌 Peldaño 2 de la escalera: label, porque son campos de formulario.
    await page.getByLabel("Número de tarjeta").fill(TARJETAS.aprobada);
    await page.getByLabel("Vencimiento").fill("12/30");
    await page.getByLabel("Correo").fill(emailUnico());

    // 📌 Preparar la espera ANTES del click. Al revés hay carrera: la
    //    respuesta puede llegar antes de que empieces a escucharla.
    const respuesta = esperarRespuesta(page, "/api/pagos", "POST");
    await page.getByRole("button", { name: "Pagar" }).click();

    // Assert — en la UI...
    const r = await respuesta;
    expect(r.status()).toBe(201);
    // 📌 Aserción de VALOR, no de visibilidad. `toBeVisible()` sobre el
    //    contenedor pasaría igual con la orden rechazada.
    await expect(page.getByTestId("estado-orden")).toHaveText("Confirmada");
    await capturar(page, "checkout confirmado");

    // ...y en la fuente de verdad (📌 ASERCIÓN DUAL, §4).
    // La UI puede mostrar "Confirmada" sin que el backend haya persistido nada.
    const { ordenId } = await r.json();
    rastro.anotar("ordenes", ordenId); // 📌 se limpia solo en el teardown
    const enApi = await request.get(`/api/ordenes/${ordenId}`);
    expect(enApi.ok()).toBe(true);
    expect((await enApi.json()).estado).toBe("CONFIRMADA");
  });

  // ─────────────────────────────────────────────────────────────────────
  // 2. Error del emisor
  // ─────────────────────────────────────────────────────────────────────
  test("tarjeta vencida muestra el error del emisor y no cobra", async ({ page }) => {
    await page.getByLabel("Número de tarjeta").fill(TARJETAS.rechazada);
    await page.getByLabel("Vencimiento").fill("01/20");
    await page.getByRole("button", { name: "Pagar" }).click();

    // 📌 role="alert" es el peldaño 1 y además verifica que el error se
    //    ANUNCIA a lectores de pantalla, no sólo que se ve.
    await expect(page.getByRole("alert")).toContainText("Tarjeta vencida");
    // 📌 Verificar también lo que NO debe pasar.
    await expect(page.getByTestId("estado-orden")).toHaveCount(0);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 3. Estado vacío
  // ─────────────────────────────────────────────────────────────────────
  test("carrito vacío no permite llegar al pago", async ({ page, request }) => {
    await request.delete("/api/carrito");
    await page.reload();

    await expect(page.getByTestId("estado-vacio")).toHaveText("Tu carrito está vacío");
    // 📌 `toBeDisabled()` afirma el estado, no la apariencia.
    await expect(page.getByRole("button", { name: "Pagar" })).toBeDisabled();
  });

  // ─────────────────────────────────────────────────────────────────────
  // 4. Regresión de un bug encontrado explorando
  // ─────────────────────────────────────────────────────────────────────
  test("doble click en Pagar genera una sola orden", async ({ page }) => {
    // 📌 Todo hallazgo del mapa que se arregla, deja su test de regresión.
    //    Sin esto, el bug vuelve en tres sprints.
    await page.getByLabel("Número de tarjeta").fill(TARJETAS.aprobada);
    await page.getByLabel("Vencimiento").fill("12/30");

    const pagos = contarLlamadas(page, "/api/pagos", "POST");
    const boton = page.getByRole("button", { name: "Pagar" });

    await boton.click();
    // El segundo click debería rebotar contra el `disabled`. Si la app está
    // bien, esto no hace nada; si está mal, dispara un segundo POST.
    await boton.click({ force: true, timeout: 1000 }).catch(() => {});

    await expect(page.getByTestId("estado-orden")).toHaveText("Confirmada");
    await pagos.esperarQueSean(1);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 5. Falla del sistema
  // ─────────────────────────────────────────────────────────────────────
  test("si la API de pagos falla, el usuario ve un mensaje claro", async ({ page }) => {
    // 📌 Interceptar es la única forma práctica de probar el 500. Se usa para
    //    simular el BORDE, nunca para reemplazar el flujo que se está probando.
    await simularFalla(page, "**/api/pagos", 500, { error: "Servicio no disponible" });

    await page.getByLabel("Número de tarjeta").fill(TARJETAS.aprobada);
    await page.getByLabel("Vencimiento").fill("12/30");
    await page.getByRole("button", { name: "Pagar" }).click();

    await expect(page.getByRole("alert")).toContainText("No pudimos procesar el pago");
    // 📌 Que el usuario pueda reintentar es parte del requisito.
    await expect(page.getByRole("button", { name: "Pagar" })).toBeEnabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Bloque aparte: sesión vencida. Va en su propio describe porque necesita
// un beforeEach distinto — 📌 no metas setups incompatibles en el mismo bloque.
// ─────────────────────────────────────────────────────────────────────────
test.describe("Checkout con sesión vencida @regresion", () => {
  test.skip(!hayCredenciales(), MOTIVO_SIN_CREDENCIALES);

  test("vencer la sesión durante el pago devuelve al login sin perder el carrito", async ({
    page,
    context,
  }) => {
    await asegurarSesion(context);
    await page.goto("/checkout");
    await page.getByLabel("Número de tarjeta").fill(TARJETAS.aprobada);

    await vencerSesion(page);
    await page.getByRole("button", { name: "Pagar" }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("alert")).toContainText("Tu sesión expiró");

    // 📌 Hallazgo anotado sin hacer fallar el test: es un problema de UX
    //    conocido, no una regresión de este flujo.
    anotarHallazgo("ux", "Tras re-loguearse, el usuario cae en /home y no vuelve al checkout");
  });
});
````

---

## Lo que este ejemplo NO hace, a propósito

| No hace | Por qué |
|---|---|
| Un test por cada campo del formulario | Eso son unitarios. El E2E prueba que las piezas están conectadas. |
| Aserciones de píxeles o de clases CSS | Se rompen con cualquier retoque visual sin que nada esté roto. |
| `waitForTimeout` en ningún lado | Prohibido (§3). |
| Compartir estado entre tests | Cada uno parte de cero y limpia lo suyo. |
| Correr contra producción | Crea órdenes reales. |
