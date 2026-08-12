/**
 * Fixtures del proyecto.
 *
 * Importá `test` y `expect` DESDE ACÁ, no desde `@playwright/test`:
 *
 *   import { test, expect } from "./fixtures";
 *
 * Con eso, cada test obtiene automáticamente:
 *   · guarda de errores de consola (falla el test si la app tira errores)
 *   · guarda de respuestas 5xx
 *   · un `Rastro` para anotar lo que crea y limpiarlo solo
 *
 * Las guardas se verifican en el teardown, así que no hay que acordarse de
 * llamarlas — que es exactamente el punto: una guarda que hay que recordar
 * usar, tarde o temprano no se usa.
 */
import { test as base, expect } from "@playwright/test";
import { vigilarConsola, vigilarServidor, type Colector } from "../_helpers/red";
import { Rastro } from "../_helpers/datos";

interface FixturesDelProyecto {
  consola: Colector;
  servidor: Colector;
  rastro: Rastro;
}

export const test = base.extend<FixturesDelProyecto>({
  consola: async ({ page }, use) => {
    const colector = vigilarConsola(page);
    await use(colector);
    colector.verificar();
  },

  servidor: async ({ page }, use) => {
    const colector = vigilarServidor(page);
    await use(colector);
    colector.verificar();
  },

  rastro: async ({ request }, use) => {
    const rastro = new Rastro();
    await use(rastro);

    // Limpieza de lo que el test creó. Los errores acá NO deben tumbar el
    // test: si la limpieza falla, se avisa pero el resultado del test manda.
    for (const { tipo, id } of rastro.drenar()) {
      await request
        .delete(`/api/${tipo}/${id}`)
        .catch((e: unknown) => console.warn(`⚠️ no se pudo limpiar ${tipo}/${id}: ${String(e)}`));
    }
  },
});

export { expect };

/**
 * ⚠️ Las fixtures `consola` y `servidor` sólo se activan si el test las
 * declara: `async ({ page, consola }) => {...}`. Para que apliquen SIEMPRE,
 * agregalas como auto-fixtures:
 *
 *   consola: [async ({ page }, use) => { ... }, { auto: true }],
 *
 * Empezá sin `auto` mientras adoptás el kit sobre una suite existente —
 * activarlo de golpe puede poner en rojo tests que hoy pasan sobre errores de
 * consola preexistentes. Activalo cuando esa deuda esté saldada.
 */
