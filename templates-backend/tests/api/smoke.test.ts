/**
 * Smoke de la suite de API — valida el ENTORNO, no el negocio.
 *
 * Cadena real: test → servicio (API_BASE_URL).
 * Requisitos: servicio levantado. Nada más — este archivo tiene que pasar
 * recién instalado el kit, antes de escribir un solo test del proyecto.
 *
 * Si esto está en rojo, no tiene sentido mirar ningún otro test.
 *
 * Dimensiones: D1 (parcial), D3 (parcial), D7. Las demás las cubren los tests
 * del proyecto.
 */
import { describe, expect, test } from "vitest";
import { api } from "./_helpers/cliente";
import { clasificarUrl, entorno, redactar } from "./_helpers/entorno";

const RUTA_SALUD = process.env.API_RUTA_SALUD ?? "/api/salud";
const RUTA_PROTEGIDA = process.env.API_RUTA_PROTEGIDA;

describe("Entorno de pruebas @smoke", () => {
  test("el servicio responde en la ruta de salud", async () => {
    const res = await api.get(RUTA_SALUD);

    expect(res.status).toBe(200);
    // Aserción de valor, no de existencia: un 200 con cuerpo vacío no dice nada.
    expect(res.texto.length).toBeGreaterThan(0);
  });

  test("el guardarraíl anti-producción está activo", () => {
    // Que el clasificador funcione es lo único que separa la suite de los
    // datos reales. Se verifica en cada corrida, no una vez al instalar.
    expect(clasificarUrl("https://api.miempresa.com")).toBe("produccion");
    expect(clasificarUrl("https://www.miempresa.com/api")).toBe("produccion");
    expect(clasificarUrl("http://localhost:3000")).toBe("seguro");
    expect(clasificarUrl("https://api-qa.miempresa.com")).toBe("seguro");

    const { clasificacion, produccionPermitida } = entorno();
    if (clasificacion === "produccion") {
      expect(
        produccionPermitida,
        "corriendo contra producción sin permiso explícito: esto no debería haber arrancado",
      ).toBe(true);
    }
  });

  test("la evidencia no filtra secretos", () => {
    const muestra = {
      usuario: "operador",
      password: "santo-grial",
      headers: { authorization: "Bearer abc.def.ghi", accept: "application/json" },
      anidado: [{ token: "xyz" }],
    };

    const limpio = redactar(muestra) as typeof muestra;

    expect(limpio.password).toBe("****");
    expect(limpio.headers.authorization).toBe("****");
    expect(limpio.anidado[0]!.token).toBe("****");
    expect(limpio.usuario).toBe("operador"); // lo que no es secreto, se conserva
    expect(JSON.stringify(limpio)).not.toContain("santo-grial");
  });

  test("una ruta inexistente devuelve 404 y no filtra internals", async () => {
    const res = await api.get("/api/__ruta-que-no-existe__");

    expect(res.status).toBe(404);
    // Un 404 que trae stack trace, SQL o rutas del servidor es filtración de
    // información (§6 S7), y se detecta acá antes que en un pentest.
    expect(res.texto).not.toMatch(/at\s+\/|node_modules|\.js:\d+:\d+|Traceback|SELECT\s+.*FROM/i);
  });

  test("un cuerpo JSON malformado devuelve 400, no 500", async () => {
    const res = await api.post(RUTA_SALUD, { cuerpoCrudo: "{" });

    // 400/415/405 son todas respuestas correctas según lo que soporte la ruta.
    // 500 no: un JSON roto es culpa del cliente (§8).
    expect(
      [400, 405, 415, 404].includes(res.status),
      `JSON malformado devolvió ${res.status}. Un 5xx acá es un bug de validación.`,
    ).toBe(true);
  });

  test.skipIf(!RUTA_PROTEGIDA)("sin credenciales, un endpoint protegido devuelve 401", async () => {
    const res = await api.get(RUTA_PROTEGIDA!, { token: null });

    expect(res.status).toBe(401);
    // 403 sería incorrecto: el servidor no sabe quién sos, no es que no puedas (§8).
    expect(res.status, "401 = no sé quién sos · 403 = sé quién sos y no podés").not.toBe(403);
  });
});

describe("Configuración de la suite @smoke", () => {
  test("hay al menos una identidad configurada", () => {
    const roles = Object.keys(process.env).filter((k) => k.startsWith("API_USER_") && process.env[k]);

    expect(
      roles.length,
      "Ningún API_USER_* configurado. Copiá .api-secrets.local.example y completalo: " +
        "sin identidades no se pueden probar autenticación, autorización ni IDOR.",
    ).toBeGreaterThan(0);
  });
});
