/**
 * Configuración de la suite de API.
 *
 * Los mínimos del estándar (§9 y §11). Los valores marcados con 📌 no son
 * preferencias: cambiarlos cambia lo que la suite garantiza.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    dir: "tests/api",
    include: ["**/*.test.ts"],

    /** 📌 Verifica el ambiente ANTES de correr nada: un servicio caído produce
     *  un mensaje claro en vez de 60 timeouts distintos. */
    globalSetup: ["tests/api/setup.ts"],

    /** 📌 `retry: 0` también en CI. Una llamada HTTP no tiene la variabilidad
     *  de un navegador: acá un retry es esconder una carrera. */
    retry: 0,

    /** 📌 Timeout corto a propósito. Si un endpoint necesita más de 15 s,
     *  eso es un hallazgo, no una razón para subir el número. */
    testTimeout: 15_000,
    hookTimeout: 30_000,

    /** Los archivos corren en paralelo. Si dos archivos escriben la misma
     *  entidad se pisan: eso se arregla con datos únicos (`_helpers/datos.ts`),
     *  NO poniendo esto en `false`. */
    fileParallelism: true,

    /** El orden por defecto es estable para poder reproducir. La verificación
     *  de independencia se hace explícita: `npm run test:api:aleatorio`. */
    sequence: { shuffle: false },

    reporters: process.env.CI ? ["default", "junit"] : ["default"],
    outputFile: { junit: "test-results/api-junit.xml" },

    /** Sin `globals`: los imports explícitos hacen visible de dónde sale `test`
     *  — y acá `test` viene de `./fixtures`, no de vitest. */
    globals: false,
  },
});
