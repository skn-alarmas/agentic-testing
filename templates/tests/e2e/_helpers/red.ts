/**
 * Guardas de consola y red, y simuladores de falla.
 *
 * Por qué existen: un error de JavaScript o un 500 en una llamada secundaria
 * casi nunca rompe la aserción del test, pero sí rompe la experiencia del
 * usuario. Sin estas guardas la suite pasa en verde sobre una app que en el
 * navegador está tirando errores.
 *
 * Para que la guarda de consola se aplique SOLA en todos los tests, importá
 * `test` desde `../fixtures` en vez de `@playwright/test`.
 */
import { expect, type Page, type Response } from "@playwright/test";

/** Ruido conocido que no vale la pena perseguir. Ampliar con criterio: cada
 *  patrón que agregues acá es un error que decidiste no volver a ver. */
export const RUIDO_IGNORABLE: RegExp[] = [
  /favicon\.ico/i,
  /ResizeObserver loop/i,
  /Download the React DevTools/i,
  /\[vite\] connect(ing|ed)/i,
];

const esRuido = (texto: string): boolean => RUIDO_IGNORABLE.some((r) => r.test(texto));

/** Colector de errores. `errores()` devuelve lo acumulado hasta el momento. */
export interface Colector {
  errores: () => string[];
  /** Falla el test si hubo algo. La fixture lo llama sola en el teardown. */
  verificar: () => void;
}

/**
 * Registra errores de consola y excepciones no capturadas.
 * Llamar ANTES del primer `goto` — los errores previos no se capturan.
 *
 *   const consola = vigilarConsola(page);
 *   await page.goto("/checkout");
 *   ...
 *   consola.verificar();          // o dejá que lo haga la fixture
 */
export function vigilarConsola(page: Page): Colector {
  const errores: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const texto = msg.text();
    if (!esRuido(texto)) errores.push(`console.error: ${texto}`);
  });

  page.on("pageerror", (err) => {
    if (!esRuido(err.message)) errores.push(`pageerror: ${err.message}`);
  });

  return {
    errores: () => [...errores],
    verificar: () =>
      expect(errores, "la página no debe emitir errores de consola").toEqual([]),
  };
}

/** Registra respuestas HTTP 5xx. Mismo contrato que `vigilarConsola`. */
export function vigilarServidor(page: Page, ignorar: RegExp[] = []): Colector {
  const fallas: string[] = [];

  page.on("response", (resp: Response) => {
    if (resp.status() < 500) return;
    if (ignorar.some((r) => r.test(resp.url()))) return;
    fallas.push(`${resp.status()} ${resp.request().method()} ${resp.url()}`);
  });

  return {
    errores: () => [...fallas],
    verificar: () => expect(fallas, "ninguna respuesta 5xx").toEqual([]),
  };
}

/**
 * Espera la respuesta de un endpoint concreto. Es la forma determinista de
 * esperar una operación sin efecto visual inmediato.
 *
 *   const r = esperarRespuesta(page, "/api/pagos", "POST");
 *   await page.getByRole("button", { name: "Pagar" }).click();
 *   expect((await r).status()).toBe(201);
 *
 * ⚠️ Preferí SIEMPRE esperar el efecto observable (que el estado aparezca en
 * pantalla). Esto es para cuando no hay efecto observable.
 */
export function esperarRespuesta(
  page: Page,
  fragmentoUrl: string,
  metodo = "GET",
): Promise<Response> {
  return page.waitForResponse(
    (r) => r.url().includes(fragmentoUrl) && r.request().method() === metodo,
  );
}

/**
 * Cuenta las llamadas a un endpoint. Sirve para probar que NO hay doble submit.
 *
 *   const pagos = contarLlamadas(page, "/api/pagos", "POST");
 *   await boton.click();
 *   await boton.click({ force: true }).catch(() => {});
 *   await pagos.esperarQueSean(1);
 */
export function contarLlamadas(page: Page, fragmentoUrl: string, metodo = "POST") {
  let total = 0;
  page.on("request", (req) => {
    if (req.url().includes(fragmentoUrl) && req.method() === metodo) total += 1;
  });
  return {
    total: () => total,
    esperarQueSean: async (n: number): Promise<void> => {
      await expect
        .poll(() => total, { message: `llamadas ${metodo} a ${fragmentoUrl}` })
        .toBe(n);
    },
  };
}

/**
 * Simula que un endpoint falla, para probar el manejo de errores de la UI.
 * El patrón es un glob de Playwright: `"**\/api/pagos"`.
 */
export async function simularFalla(
  page: Page,
  patronUrl: string,
  status = 500,
  cuerpo: unknown = { error: "Error simulado por el test E2E" },
): Promise<void> {
  await page.route(patronUrl, (route) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(cuerpo),
    }),
  );
}

/** Simula un endpoint lento: para probar indicadores de carga y doble submit. */
export async function simularLentitud(page: Page, patronUrl: string, ms = 3000): Promise<void> {
  await page.route(patronUrl, async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
}

/** Corta la red hacia un patrón: para probar el estado offline / de error. */
export async function simularCaida(page: Page, patronUrl: string): Promise<void> {
  await page.route(patronUrl, (route) => route.abort("failed"));
}
