/**
 * Smoke E2E — la app levanta y es usable.
 *
 * Este spec lo instala el kit y está pensado para pasar en CUALQUIER app desde
 * el minuto cero: es la validación de que el entorno de testing quedó bien.
 * No necesita sesión ni datos.
 *
 * Precondiciones: la app levantada en `E2E_BASE_URL` (o el puerto del
 * playwright.config.ts).
 *
 * Escenarios:
 *   1. La página raíz responde y renderiza contenido
 *   2. No hay errores de JavaScript en consola
 *   3. Hay una estructura mínima accesible (un landmark y un encabezado)
 *   4. No hay respuestas 5xx en la carga inicial
 *
 * Cuando el proyecto tenga su propia puerta de entrada (login, dashboard),
 * reemplazá el escenario 3 por algo específico y más exigente.
 */
import { test, expect } from "./fixtures";

test.describe("Smoke @smoke", () => {
  test("la app carga y renderiza contenido", async ({ page }) => {
    const respuesta = await page.goto("/");

    expect(respuesta?.status(), "la raíz debe responder 2xx/3xx").toBeLessThan(400);
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page).toHaveTitle(/.+/);
  });

  test("no hay errores de JavaScript al cargar", async ({ page, consola }) => {
    await page.goto("/");
    // La app puede seguir montando después del load: esperamos a que la UI
    // esté estable observando un elemento real, no un timeout.
    await expect(page.locator("body")).toBeVisible();
    expect(consola.errores(), "errores de consola en la carga inicial").toEqual([]);
  });

  test("no hay respuestas 5xx en la carga inicial", async ({ page, servidor }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    expect(servidor.errores(), "respuestas 5xx durante la carga").toEqual([]);
  });

  test("la página tiene estructura accesible mínima", async ({ page }) => {
    await page.goto("/");

    // Un landmark principal: sin esto, quien usa lector de pantalla no puede
    // saltar al contenido. Si tu app usa otro patrón, ajustá la aserción.
    const principal = page.getByRole("main").or(page.locator("#root, #app, main"));
    await expect(principal.first()).toBeVisible();

    // Al menos un encabezado que oriente sobre dónde está parado el usuario.
    await expect(page.getByRole("heading").first()).toBeVisible();
  });
});
