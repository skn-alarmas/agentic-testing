/**
 * Fixtures del proyecto.
 *
 * Importá `test` DESDE ACÁ, no desde `vitest`:
 *
 *   import { test } from "./fixtures";
 *   import { expect, describe } from "vitest";
 *
 * Con eso, cada test recibe:
 *   · `api`      cliente HTTP con roles y evidencia
 *   · `db`       la fuente de verdad — capa 3 de la aserción (§3)
 *   · `contrato` validador estricto contra OpenAPI (§5)
 *   · `rastro`   registro de lo creado, que se limpia solo en el teardown
 *
 * La limpieza corre sola: una limpieza que hay que recordar, tarde o temprano
 * no se hace, y la suite empieza a fallar por basura de corridas viejas.
 */
import { test as base } from "vitest";
import { ClienteApi, api as clienteAnonimo } from "../_helpers/cliente";
import { fuenteDeVerdad, type FuenteDeVerdad } from "../_helpers/db";
import { cargarContrato, type Contrato } from "../_helpers/contrato";
import { Rastro } from "../_helpers/datos";

interface FixturesDelProyecto {
  api: ClienteApi;
  db: FuenteDeVerdad;
  contrato: Contrato;
  rastro: Rastro;
}

export const test = base.extend<FixturesDelProyecto>({
  // eslint-disable-next-line no-empty-pattern
  api: async ({}, use) => {
    await use(clienteAnonimo);
  },

  // eslint-disable-next-line no-empty-pattern
  db: async ({}, use) => {
    await use(fuenteDeVerdad);
  },

  // eslint-disable-next-line no-empty-pattern
  contrato: async ({}, use) => {
    await use(await cargarContrato());
  },

  // eslint-disable-next-line no-empty-pattern
  rastro: async ({}, use) => {
    const rastro = new Rastro();
    await use(rastro);

    // Limpieza de lo que el test creó, en orden inverso (hijos antes que padres).
    // Un error acá NO debe tumbar el test: si la limpieza falla se avisa, pero
    // el resultado del test es el que manda.
    const admin = new ClienteApi().como("admin");
    for (const { recurso, id } of rastro.drenar()) {
      try {
        const res = await admin.delete(`/api/${recurso}/${id}`);
        if (res.status >= 400 && res.status !== 404) {
          console.warn(`⚠️ no se pudo limpiar ${recurso}/${id}: HTTP ${res.status}`);
        }
      } catch (e) {
        console.warn(`⚠️ no se pudo limpiar ${recurso}/${id}: ${String(e)}`);
      }
    }
  },
});

export { expect, describe, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
