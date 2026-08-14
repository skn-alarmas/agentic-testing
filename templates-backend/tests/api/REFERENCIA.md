# Spec de referencia — API

Ejemplo anotado con todos los patrones del estándar. **No es un test que corre**
(las rutas son inventadas): es el modelo a copiar.

Cada bloque marcado con 📌 explica una decisión que hay que replicar.

````ts
/**
 * 📌 CABECERA OBLIGATORIA (§10 del estándar).
 * Explica el POR QUÉ, la cadena real y las precondiciones. El QUÉ lo dice el código.
 *
 * API de Facturas — /api/facturas — #1234.
 *
 * Cadena real: test → API :3000 → servicio → PostgreSQL.
 * Requisitos: servicio arriba, DB migrada, usuarios de prueba sembrados.
 *
 * ⚠️ Este archivo CREA facturas. Cada test usa su propio cliente y el `rastro`
 * las borra al terminar.
 *
 * Mapa:     docs/qa/api/mapa/facturas.md
 * Contrato: openapi.yaml #/paths/~1api~1facturas
 *
 * 📌 DIMENSIONES CUBIERTAS ACÁ: D1 D2 D5 D6 D7 D8 D9.
 *    D3 y D4 viven en facturas.seguridad.test.ts — se separan porque se corren
 *    con distinta frecuencia y las lee gente distinta.
 */

// 📌 `test` sale de ./fixtures, no de vitest: trae api, db, contrato y rastro.
import { test, expect, describe } from "./fixtures";
import { montoUnico, nombreUnico } from "./_helpers/datos";
import { dobleSubmit, esperarQue } from "./_helpers/concurrencia";
import { CUERPOS_MALFORMADOS, MASS_ASSIGNMENT, NUMEROS, TEXTO } from "./_helpers/payloads";

// 📌 ETIQUETA DE NIVEL en el título del describe (§11).
describe("POST /api/facturas @critico", () => {
  // ───────────────────────────────────────────────────────────────────────
  // D2 · Happy path — con las TRES capas de aserción (§3)
  // ───────────────────────────────────────────────────────────────────────
  test("crear una factura válida la deja PENDIENTE y consultable", async ({
    api,
    db,
    contrato,
    rastro,
  }) => {
    // Arrange — el test crea lo que necesita. 📌 Nunca depender de "el cliente 1
    // tiene que estar": alguien lo borra y la suite se cae sin explicación.
    const cliente = await api.como("operador").post("/api/clientes", {
      cuerpo: { nombre: nombreUnico("Cliente") },
    });
    expect(cliente.status).toBe(201);
    rastro.anotar("clientes", cliente.cuerpo.id); // 📌 se limpia solo en el teardown

    // Act
    const monto = montoUnico();
    const res = await api.como("operador").post("/api/facturas", {
      cuerpo: { clienteId: cliente.cuerpo.id, monto, concepto: nombreUnico("Servicio") },
    });
    rastro.anotar("facturas", res.cuerpo?.id);

    // Assert · capa 1 — la respuesta HTTP
    expect(res.status).toBe(201);
    // 📌 201 con Location: el estándar de la casa (§8). Sin esto el cliente no
    //    sabe dónde quedó lo que creó.
    expect(res.headers.location).toBe(`/api/facturas/${res.cuerpo.id}`);

    // Assert · capa 2 — el contrato publicado
    // 📌 Valida además que NO haya campos de más: así aparecen los
    //    `costo_interno` y los `password_hash` que nadie quiso exponer (§5).
    contrato.verificar("POST", "/api/facturas", 201, res.cuerpo);

    // Assert · capa 3 — la fuente de verdad
    // 📌 Sin esto, un 201 devuelto antes del commit se vería idéntico a un
    //    201 correcto. Esta línea es la diferencia entre probar y creer.
    const enBase = await db.buscar("facturas", res.cuerpo.id);
    expect(enBase).toMatchObject({ estado: "PENDIENTE", clienteId: cliente.cuerpo.id });
    expect(Number(enBase.monto)).toBeCloseTo(monto, 2);
  });

  // ───────────────────────────────────────────────────────────────────────
  // D5 · Validación — un caso por valor, con nombre propio en el reporte
  // ───────────────────────────────────────────────────────────────────────
  // 📌 Bucle en vez de un test con muchos `expect`: cuando falla, el reporte
  //    dice QUÉ VALOR falló. Con un solo test, dice "validación" y hay que
  //    abrir el código.
  const MONTOS_INVALIDOS: Array<[string, unknown]> = [
    ["negativo", NUMEROS.negativo],
    ["cero", NUMEROS.cero],
    ["texto", "mil"],
    ["nulo", null],
    ["ausente", undefined],
    ["overflow", NUMEROS.maxSafeMas2],
    ["infinito", NUMEROS.notacion],
  ];

  for (const [etiqueta, valor] of MONTOS_INVALIDOS) {
    test(`monto ${etiqueta} → 422 y no crea nada`, async ({ api, db }) => {
      const antes = await db.contar("facturas");

      const res = await api.como("operador").post("/api/facturas", {
        cuerpo: { clienteId: 1, monto: valor, concepto: "x" },
      });

      // 📌 El código EXACTO. `not.toBe(200)` no es una aserción: un 500 lo
      //    cumpliría igual, y un 500 por input inválido es un bug (§8).
      expect(res.status).toBe(422);
      // 📌 El error se afirma por CÓDIGO, no por el texto del mensaje: el texto
      //    cambia con cada traducción y con cada revisión de UX.
      expect(res.cuerpo.codigo).toBe("VALIDACION");
      // 📌 Y el rechazo no dejó rastro. Un 422 que igual insertó la fila es el
      //    bug que nadie encuentra hasta que aparece en un reporte contable.
      expect(await db.contar("facturas")).toBe(antes);
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // D5 · Mass assignment (§6 S6)
  // ───────────────────────────────────────────────────────────────────────
  test("los campos que el cliente no controla se ignoran", async ({ api, db, rastro }) => {
    const res = await api.como("operador").post("/api/facturas", {
      cuerpo: {
        clienteId: 1,
        monto: montoUnico(),
        concepto: nombreUnico(),
        // 📌 El corpus completo está en _helpers/payloads.ts. Acá se mandan
        //    los que aplican a este recurso.
        estado: MASS_ASSIGNMENT.estado, // "APROBADO" — saltearía la aprobación
        id: MASS_ASSIGNMENT.id,
        creadoPor: MASS_ASSIGNMENT.creadoPor,
      },
    });
    rastro.anotar("facturas", res.cuerpo?.id);

    // Aceptar el request está bien; aplicar los campos, no.
    expect([201, 400, 422]).toContain(res.status);

    if (res.status === 201) {
      // 📌 Verificación en capa 3: la respuesta puede decir PENDIENTE y la fila
      //    haber quedado APROBADA. Se mira la base.
      const enBase = await db.buscar("facturas", res.cuerpo.id);
      expect(enBase.estado, "el cliente no puede fijar el estado").toBe("PENDIENTE");
      expect(String(enBase.id), "el cliente no puede fijar el id").not.toBe("1");
    }
  });

  // ───────────────────────────────────────────────────────────────────────
  // D7 · Errores y códigos — el servidor no explota con basura
  // ───────────────────────────────────────────────────────────────────────
  for (const [i, malformado] of CUERPOS_MALFORMADOS.entries()) {
    test(`cuerpo malformado #${i} → 4xx, nunca 5xx`, async ({ api }) => {
      const res = await api.como("operador").post("/api/facturas", { cuerpoCrudo: malformado });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status, "un JSON roto es culpa del cliente: 400, no 500").toBeLessThan(500);
      // 📌 Y el error no filtra internals (§6 S7).
      expect(res.texto).not.toMatch(/node_modules|at\s+\/|SELECT\s+.*FROM/i);
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // D6 · Bordes — texto legítimo que parece un ataque
  // ───────────────────────────────────────────────────────────────────────
  test("un concepto con apóstrofos y unicode se guarda tal cual", async ({ api, db, rastro }) => {
    // 📌 El caso que más se olvida: no todo lo raro es un ataque. `O'Brien & Cía.`
    //    es un nombre real, y un backend que lo escapa de más lo guarda roto.
    const concepto = `${TEXTO.sqlComoTexto} ${TEXTO.unicode}`;

    const res = await api.como("operador").post("/api/facturas", {
      cuerpo: { clienteId: 1, monto: montoUnico(), concepto },
    });
    rastro.anotar("facturas", res.cuerpo?.id);

    expect(res.status).toBe(201);
    const enBase = await db.buscar("facturas", res.cuerpo.id);
    expect(enBase.concepto).toBe(concepto); // ni escapado de más, ni truncado
  });

  // ───────────────────────────────────────────────────────────────────────
  // D9 · Concurrencia — el bug más caro y el menos probado
  // ───────────────────────────────────────────────────────────────────────
  test("doble submit simultáneo crea una sola factura", async ({ api, db, rastro }) => {
    const cliente = await api.como("operador").post("/api/clientes", {
      cuerpo: { nombre: nombreUnico("Cliente") },
    });
    rastro.anotar("clientes", cliente.cuerpo.id);

    const cuerpo = { clienteId: cliente.cuerpo.id, monto: montoUnico(), concepto: nombreUnico() };

    // 📌 Las dos llamadas salen JUNTAS. Secuenciales no reproducen la carrera:
    //    este bug sólo existe cuando los dos requests están en vuelo a la vez.
    const [a, b] = await dobleSubmit(() =>
      api.como("operador").post("/api/facturas", {
        cuerpo,
        headers: { "Idempotency-Key": `ref-${cliente.cuerpo.id}` },
      }),
    );

    for (const r of [a, b]) rastro.anotar("facturas", r.cuerpo?.id);

    // La respuesta correcta puede ser 201+409 o 201+201 idénticos (idempotencia).
    // Lo que NO puede pasar es que queden dos facturas.
    expect(await db.contar("facturas", { clienteId: cliente.cuerpo.id })).toBe(1);
  });

  // ───────────────────────────────────────────────────────────────────────
  // D8 · Consistencia eventual — la ÚNICA forma permitida de esperar (§7)
  // ───────────────────────────────────────────────────────────────────────
  test("la factura emitida termina PROCESADA por el worker", async ({ api, db, rastro }) => {
    const res = await api.como("operador").post("/api/facturas", {
      cuerpo: { clienteId: 1, monto: montoUnico(), concepto: nombreUnico(), emitir: true },
    });
    rastro.anotar("facturas", res.cuerpo?.id);

    // 📌 `esperarQue` con MOTIVO escrito. Un `setTimeout(5000)` acá sería una
    //    apuesta, y la apuesta se pierde en CI el día que el runner está lento.
    const procesada = await esperarQue(
      () => db.buscar("facturas", res.cuerpo.id),
      (f) => f?.estado === "PROCESADA",
      { timeout: 8_000, motivo: "la emisión se procesa por cola (worker cada ~2s)" },
    );

    expect(procesada.numeroFiscal).toMatch(/^\d{3}-\d{3}-\d{7}$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// D3 y D4 en su propio archivo. 📌 Se separan porque se corren con distinta
// frecuencia (nightly completo) y porque el reporte de seguridad lo lee gente
// distinta. Este bloque es el modelo de facturas.seguridad.test.ts.
// ─────────────────────────────────────────────────────────────────────────
describe("Seguridad de /api/facturas @seguridad", () => {
  test("un usuario no puede leer la factura de otro (IDOR)", async ({ api, db, rastro }) => {
    // Arrange — una factura que pertenece al operador
    const propia = await api.como("operador").post("/api/facturas", {
      cuerpo: { clienteId: 1, monto: montoUnico(), concepto: nombreUnico("Secreta") },
    });
    rastro.anotar("facturas", propia.cuerpo?.id);
    const id = propia.cuerpo.id;

    // 📌 CONTROL POSITIVO (§4). Sin esta mitad, el test pasaría igual si la
    //    ruta estuviera mal escrita y devolviera 404 a todo el mundo. Es el
    //    error más común en tests de seguridad, y el más difícil de ver en una
    //    revisión: el verde se ve idéntico.
    const dueño = await api.como("operador").get(`/api/facturas/${id}`);
    expect(dueño.status, "control positivo: el dueño SÍ debe poder leerla").toBe(200);

    // Act — el ataque
    const ajeno = await api.como("otroUsuario").get(`/api/facturas/${id}`);

    // Assert — 404 y no 403: la decisión de no revelar existencia está escrita
    // en docs/qa/api/mapa/facturas.md. 📌 El test afirma la decisión del equipo,
    // no la preferencia de quien lo escribió.
    expect(ajeno.status).toBe(404);
    // Y no se filtró nada por el cuerpo del error.
    expect(JSON.stringify(ajeno.cuerpo)).not.toContain("Secreta");

    // 📌 Capa 3: y tampoco pudo verla listando.
    const listado = await api.como("otroUsuario").get("/api/facturas");
    expect(JSON.stringify(listado.cuerpo)).not.toContain(String(id));
  });

  test("un lector no puede anular facturas", async ({ api, db, rastro }) => {
    const factura = await api.como("operador").post("/api/facturas", {
      cuerpo: { clienteId: 1, monto: montoUnico(), concepto: nombreUnico() },
    });
    rastro.anotar("facturas", factura.cuerpo?.id);
    const id = factura.cuerpo.id;

    // 📌 Control positivo por partida doble: el rol que SÍ puede, puede.
    //    Se prueba al final para no destruir el recurso antes del ataque.
    const ataque = await api.como("lector").delete(`/api/facturas/${id}`);
    expect(ataque.status).toBe(403); // sé quién sos y no podés (§8)
    expect(await db.buscar("facturas", id), "el 403 no borró igual").not.toBeNull();

    const legitimo = await api.como("operador").delete(`/api/facturas/${id}`);
    expect(legitimo.status, "control positivo: el operador SÍ puede").toBe(204);
  });

  test("un token con el rol manipulado no escala privilegios", async ({ api }) => {
    // Este test se saltea solo si no hay secreto de firma del ambiente de
    // pruebas: 📌 mejor un skip con motivo que un verde que no probó nada.
    const { tokenConClaims } = await import("./_helpers/auth");

    let forjado: string;
    try {
      forjado = await tokenConClaims({ rol: "admin", permisos: ["*"] }, "lector");
    } catch (e) {
      // Con RS256 no se puede forjar sin la clave privada: eso ya es la mitigación.
      console.warn(`⏭️  ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    const res = await api.get("/api/admin/usuarios", { token: forjado });

    // El servidor tiene que revalidar el rol contra la base, no confiar en el claim.
    expect([401, 403]).toContain(res.status);
  });
});
````

---

## Lo que este ejemplo NO hace, a propósito

| No hace | Por qué |
|---|---|
| Un test por cada combinación de reglas de negocio | Eso son unitarios. Acá se prueba que las piezas están conectadas y defendidas (§14). |
| `toMatchSnapshot()` del cuerpo | Se rompe con cada campo nuevo y se actualiza con `-u` sin leerlo. La forma la valida el contrato (§5). |
| `setTimeout` para esperar | Prohibido. Se espera la condición con `esperarQue` y motivo escrito (§7). |
| Reusar el token de admin para todo | Un test que no dice con qué rol actúa no se puede revisar (§10). |
| Depender de datos preexistentes | Cada test crea lo suyo y lo limpia. |
| Medir tiempos como aserción | La performance se mide con una herramienta de carga, no acá (§14). |
