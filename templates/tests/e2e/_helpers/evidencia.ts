/**
 * Evidencia: capturas y adjuntos con nombre estable.
 *
 * Playwright ya guarda screenshot, video y trace de las fallas. Esto es para lo
 * OTRO: capturar estados intermedios que querés mostrarle a una persona
 * ("así se veía el resumen antes de confirmar"), y que aparezcan en el reporte
 * HTML asociados al test que las produjo.
 *
 * Regla: la evidencia se adjunta al test (`testInfo.attach`), no se tira suelta
 * en una carpeta. Una captura sin test asociado no se mira nunca.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { test, type Locator, type Page } from "@playwright/test";

/** Nombre de archivo seguro y estable a partir de una descripción. */
const normalizar = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

/**
 * Captura la pantalla y la adjunta al reporte del test.
 *
 *   await capturar(page, "checkout confirmado");
 */
export async function capturar(page: Page, descripcion: string): Promise<void> {
  const info = test.info();
  const nombre = normalizar(descripcion);
  const destino = path.join(info.outputDir, `${nombre}.png`);

  fs.mkdirSync(info.outputDir, { recursive: true });
  await page.screenshot({ path: destino, fullPage: true });
  await info.attach(descripcion, { path: destino, contentType: "image/png" });
}

/** Adjunta datos (respuesta de API, payload, diff) al reporte del test. */
export async function adjuntarDatos(descripcion: string, datos: unknown): Promise<void> {
  await test.info().attach(descripcion, {
    body: typeof datos === "string" ? datos : JSON.stringify(datos, null, 2),
    contentType: "application/json",
  });
}

/**
 * Adjunta el árbol de accesibilidad (roles y nombres) de la página o de una
 * región. Vale oro cuando un test falla por un selector: te muestra qué había
 * realmente en pantalla, con los mismos roles que usan los `getByRole`.
 *
 * Es el mismo snapshot que produce el MCP de Playwright al explorar.
 *
 *   await adjuntarArbolA11y(page);                          // toda la página
 *   await adjuntarArbolA11y(page.getByRole("dialog"));      // sólo el modal
 */
export async function adjuntarArbolA11y(
  destino: Page | Locator,
  descripcion = "arbol-a11y",
): Promise<void> {
  const raiz = "locator" in destino ? destino.locator("body") : destino;
  const arbol = await raiz.ariaSnapshot();
  await test.info().attach(descripcion, { body: arbol, contentType: "text/yaml" });
}

/**
 * Deja constancia de un hallazgo encontrado durante el test sin hacerlo fallar.
 * Aparece en el reporte HTML y en la salida de consola.
 *
 *   anotarHallazgo("a11y", "El botón 'quitar' es un <div>, no se alcanza con Tab");
 */
export function anotarHallazgo(tipo: string, detalle: string): void {
  const linea = `[hallazgo:${tipo}] ${detalle}`;
  console.warn(`⚠️  ${linea}`);
  void test.info().attach(`hallazgo-${normalizar(tipo)}`, {
    body: detalle,
    contentType: "text/plain",
  });
}
