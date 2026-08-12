import { defineConfig, devices } from "@playwright/test";

/**
 * Configuración base del kit de testing agentic.
 *
 * Los valores marcados NO NEGOCIABLE están fijados por `TESTING_STANDARDS.md`
 * §6. Cambiarlos requiere justificación escrita en este mismo archivo.
 *
 * COMPLETAR POR PROYECTO: el puerto de `baseURL` y el comando de `webServer`.
 */
export default defineConfig({
  testDir: "./tests/e2e",

  /* Paralelo entre ARCHIVOS. Si tu app comparte datos entre flujos, bajalo a
   * false y dejá escrito por qué. */
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,

  /* NO NEGOCIABLE — ningún `.only` llega a CI. */
  forbidOnly: !!process.env.CI,

  /* NO NEGOCIABLE — 1, no 2. Dos retries esconden flakiness en vez de
   * resolverla. En local, cero: si es flaky, querés verlo. */
  retries: process.env.CI ? 1 : 0,

  /* Presupuesto por test. Si uno necesita más, se justifica con
   * test.setTimeout() y un comentario, no subiendo este número. */
  timeout: 30_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI
    ? [["github"], ["html", { outputFolder: "playwright-report", open: "never" }], ["list"]]
    : [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],

  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",

    /* NO NEGOCIABLE — sin trace no hay diagnóstico posible de una falla de CI. */
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",

    /* NO NEGOCIABLE — hace que getByTestId() lea `data-testid`. */
    testIdAttribute: "data-testid",

    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    locale: "es-PY",
    timezoneId: "America/Asuncion",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  /* Levanta la app sola si no está corriendo. En CI siempre la levanta.
   * COMPLETAR: comando y puerto reales del proyecto. */
  webServer: {
    command: "npm run dev",
    url: process.env.E2E_BASE_URL || "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },

  outputDir: "test-results",
});
