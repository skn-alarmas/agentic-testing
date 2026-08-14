# BACKEND_TESTING_STANDARDS.md — Estándar de pruebas de backend

> Norma del equipo. Un test que no cumple esto **no entra**: ni escrito por una
> persona, ni escrito por un agente. Las skills y los agentes del kit de backend
> están construidos para hacerla cumplir.

Ámbito: pruebas de API (REST y GraphQL), servicios, integridad de datos,
autorización y seguridad, ejecutadas contra un servicio **corriendo de verdad**
con su base de datos de verdad. Stack de referencia: Node.js + TypeScript +
Vitest. Adaptable a cualquier stack: lo que manda son las reglas, no la
herramienta.

No cubre tests unitarios de funciones puras (esos tienen sus propias reglas y
son más baratos: si algo se puede probar unitariamente, **no** se prueba acá).
Para el frontend rige `TESTING_STANDARDS.md`, que es el documento hermano.

---

## 0. Los seis principios

1. **`200 OK` no es evidencia.** Un endpoint puede responder 200, cumplir el
   schema y no haber guardado nada. Se afirma contra la fuente de verdad.
2. **Todo test de seguridad necesita su control positivo.** Si el ataque falla,
   hay que demostrar que *podía* haber funcionado. Sin eso, un endpoint mal
   escrito que devuelve 404 a todo el mundo se lee como "seguro".
3. **Un endpoint no está cubierto hasta que las nueve dimensiones tienen
   veredicto.** Incluido "no aplica, porque X". El silencio no es cobertura.
4. **Determinismo sobre cantidad.** Un test que falla de a ratos entrena al
   equipo a ignorar el rojo, y a partir de ahí la suite entera vale cero.
5. **Un fallo es una hipótesis.** Antes de "arreglar" hay que decidir si se
   rompió el test, se rompió el servicio o se rompió el ambiente. Son tres
   causas distintas con tres respuestas distintas.
6. **El caso negativo es el trabajo.** El happy path lo prueba el desarrollador
   solo, sin que se lo pidan. Lo que llega a producción roto es el otro 90 %.

---

## 1. Estructura de archivos

```
<repo>/
├── tests/
│   └── api/
│       ├── _helpers/              # infraestructura compartida (prefijo _)
│       │   ├── entorno.ts         # config + guardarraíl anti-producción
│       │   ├── cliente.ts         # cliente HTTP con evidencia y aserciones
│       │   ├── auth.ts            # tokens por rol + tokens adversarios
│       │   ├── contrato.ts        # validación estricta contra OpenAPI/schema
│       │   ├── db.ts              # consulta a la fuente de verdad
│       │   ├── datos.ts           # datos únicos por corrida + rastro
│       │   ├── payloads.ts        # corpus de valores maliciosos y de borde
│       │   └── concurrencia.ts    # carreras, idempotencia, doble submit
│       ├── fixtures/index.ts      # `test` extendido: api, rastro, contrato
│       ├── setup.ts               # arranque: secretos, guardarraíl, servicio vivo
│       ├── <recurso>.test.ts      # un archivo por recurso o caso de uso
│       ├── <recurso>.seguridad.test.ts
│       ├── REFERENCIA.md          # spec de referencia anotado
│       └── smoke.test.ts          # valida el entorno
├── docs/qa/api/
│   ├── mapa/<recurso>.md          # mapas de endpoints (insumo de los tests)
│   ├── cobertura.md               # matriz endpoint × dimensión
│   └── reportes/<fecha>-<x>.md    # reportes de corrida y hallazgos
├── vitest.config.ts
└── .api-secrets.local             # gitignoreado, NUNCA se commitea
```

**Reglas de nombres**

| Cosa | Convención | Ejemplo |
|---|---|---|
| Archivo de tests | `<recurso>.test.ts`, kebab-case, en español | `facturas.test.ts` |
| Tests de seguridad | `<recurso>.seguridad.test.ts` | `facturas.seguridad.test.ts` |
| `describe` | Método y ruta, tal como los publica la API | `describe("POST /api/facturas")` |
| `test` | **condición → resultado esperado**, en español | `test("sin token devuelve 401 y no crea nada")` |
| Mapa de endpoints | `docs/qa/api/mapa/<recurso>.md` | `docs/qa/api/mapa/facturas.md` |

**Prohibido** como nombre: `test-*`, `nuevo-*`, `final-*`, `fix-*`, `temp-*`,
`v2`, o cualquier cosa que describa *cuándo se escribió* en lugar de *qué
prueba*. Si un archivo se llama `api-final-fix.test.ts`, nadie sabe si borrarlo.

---

## 2. La matriz de las nueve dimensiones

Es el corazón del estándar. **Ningún endpoint se declara cubierto** hasta que
cada una de las nueve dimensiones tiene veredicto: `cubierto`, `no aplica` con
motivo, o `pendiente` con ticket.

| # | Dimensión | Pregunta que responde |
|---|---|---|
| **D1** | **Contrato** | ¿La respuesta tiene exactamente la forma publicada? ¿Ni un campo de más? |
| **D2** | **Happy path** | ¿Hace lo que existe para hacer, y queda hecho? |
| **D3** | **Autenticación** | ¿Sin credencial, vencida, o falsificada, se niega? |
| **D4** | **Autorización** | ¿Otro rol, otro dueño, otro tenant, pueden llegar? |
| **D5** | **Validación de input** | ¿Rechaza lo que no debe aceptar, con el código correcto? |
| **D6** | **Bordes y extremos** | ¿Límites, vacíos, enormes, unicode, paginación? |
| **D7** | **Errores y códigos** | ¿Cada rama de error da el código y el cuerpo correctos? |
| **D8** | **Integridad** | ¿El efecto real en los datos es el correcto y es atómico? |
| **D9** | **Concurrencia** | ¿Doble submit, carreras y actualizaciones simultáneas? |

La matriz vive en `docs/qa/api/cobertura.md` y la mantiene el
`coverage-critic-agent`:

```markdown
| Endpoint | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 |
|---|---|---|---|---|---|---|---|---|---|
| POST /api/facturas   | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| GET  /api/facturas   | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ | ✅ | — | — |
| GET  /api/salud      | ✅ | ✅ | — | — | — | — | ✅ | — | — |
```

`✅` cubierto · `⬜` pendiente (con ticket) · `—` no aplica (con motivo al pie).

> **Cobertura de líneas, no.** Un porcentaje de líneas ejecutadas dice cuánto
> código se tocó, no cuántas formas de romperlo se probaron. Se puede tener 90 %
> de líneas y cero tests de autorización. Acá la cobertura es esta matriz.

---

## 3. La aserción de tres capas

Todo test que **escribe** datos afirma en tres capas. Las tres, siempre.

```ts
// Capa 1 — la respuesta HTTP: código, headers, cuerpo
const res = await api.post("/api/facturas", { cuerpo: nueva });
expect(res.status).toBe(201);
expect(res.headers.location).toMatch(/^\/api\/facturas\/\d+$/);

// Capa 2 — el contrato: la forma publicada, sin campos de más
await contrato.verificar("POST", "/api/facturas", 201, res.cuerpo);

// Capa 3 — la fuente de verdad: ¿quedó guardado, y bien?
const guardada = await db.buscarFactura(res.cuerpo.id);
expect(guardada).toMatchObject({ monto: nueva.monto, estado: "PENDIENTE" });
```

**Por qué las tres.** Cada una atrapa una familia de bugs que las otras dos no ven:

| Sólo capa 1 | No ve | Ejemplo real |
|---|---|---|
| | Campos de más filtrados | La respuesta incluye `password_hash` y nadie lo nota |
| | Que no se guardó nada | 201 devuelto antes del commit; la transacción hace rollback |
| Sólo capas 1+2 | Efectos colaterales | Se creó la factura **y** se duplicó el asiento contable |

**Capa 3 sin acceso a la base.** Si el equipo de tests no tiene conexión a la
DB, la fuente de verdad es **otro endpoint de lectura** (`GET /api/facturas/:id`
con un token distinto al que la creó). No es tan fuerte, pero es infinitamente
mejor que confiar en el eco de la escritura. Lo que **no** vale es afirmar
contra el cuerpo de la respuesta que estás probando: eso es preguntarle al
acusado si es inocente.

---

## 4. La regla del control positivo (seguridad)

Un test de seguridad tiene **dos mitades obligatorias**:

```ts
test("@seguridad un usuario no puede leer la factura de otro (IDOR)", async () => {
  // Control positivo: el recurso EXISTE y es alcanzable por su dueño.
  // Sin esto, un 404 por typo en la ruta se leería como "seguro".
  const propia = await api.como("dueño").get(`/api/facturas/${idAjena}`);
  expect(propia.status, "control positivo: el dueño SÍ debe poder leerla").toBe(200);

  // El ataque
  const ajena = await api.como("otroUsuario").get(`/api/facturas/${idAjena}`);
  expect(ajena.status).toBe(404);              // decisión escrita: no revelar existencia
  expect(JSON.stringify(ajena.cuerpo)).not.toContain(montoSecreto);
});
```

**Sin control positivo, el test no entra.** Es la versión backend de "un test que
no puede fallar no está probando nada": un test de seguridad que pasa contra un
endpoint que **no existe** es el error más común y el más difícil de ver en una
revisión, porque el verde se ve igual.

Vale también para autorización, rate limiting, validación y cualquier test cuyo
resultado esperado sea un rechazo.

---

## 5. Contratos

- **El contrato es un archivo, no una costumbre.** OpenAPI (`openapi.yaml`) o
  JSON Schema versionado en el repo. Si el proyecto no lo tiene, el primer
  entregable del kit es generarlo desde la exploración y **discutirlo**, no
  inventarlo en silencio.
- **Validación estricta, siempre.** `additionalProperties: false` en todo
  objeto de respuesta. Un campo no declarado es un hallazgo, no un detalle:
  así se detectan filtraciones (`password_hash`, `token_interno`, `costo`,
  `saldo_de_otro_cliente`) y así se detecta que alguien cambió la API sin
  actualizar el contrato.
- **Se validan también los errores.** El cuerpo de un 400 y de un 500 tiene
  forma publicada y estable. Un `{"error": "algo salió mal"}` sin código
  legible es un contrato roto: el cliente no puede reaccionar distinto según
  la causa.
- **Cambio de contrato = decisión.** Si el servicio cambió y el contrato no, el
  test se queda rojo y se reporta. Nadie "actualiza el schema para que pase".
  Un contrato que se acomoda a la implementación no es un contrato.
- **Compatibilidad hacia atrás.** Sacar un campo, volver requerido uno opcional,
  o angostar un enum, es un cambio incompatible aunque los tests pasen. Se
  marca como tal en el reporte, con los consumidores afectados.

---

## 6. Seguridad — el catálogo mínimo obligatorio

Basado en OWASP API Security Top 10, reducido a lo que se puede probar de forma
determinista. Cada endpoint que maneja datos de usuario cubre **todo el
catálogo**, y cada test lleva su control positivo (§4).

| # | Riesgo | Qué se prueba, concretamente |
|---|---|---|
| **S1** | **BOLA / IDOR** | Pedir por id un recurso de otro dueño o de otro tenant → negado. Con ids adyacentes (`n-1`, `n+1`), no aleatorios. |
| **S2** | **Autenticación rota** | Sin header · token vencido · firma inválida · `alg: none` · token de otro ambiente · token bien firmado con claims cambiados |
| **S3** | **Exposición de datos** | La respuesta no trae campos internos. `additionalProperties: false` (§5) lo cataliza. |
| **S4** | **Consumo de recursos** | Paginación con `limit` absurdo (`999999`, `-1`) · payload gigante · anidamiento profundo · GraphQL: profundidad y complejidad |
| **S5** | **Autorización de función** | Un rol bajo llamando endpoints de admin (`DELETE`, `/admin/*`, cambios de rol) → 403. Probar **por método**: a veces `GET` está protegido y `PATCH` no. |
| **S6** | **Mass assignment** | Mandar campos que el cliente no debería poder fijar: `rol`, `id`, `saldo`, `esAdmin`, `empresaId`, `creadoPor`, `precio` → ignorados o 400, **nunca aplicados**. Verificado en capa 3. |
| **S7** | **Configuración insegura** | Verbos no soportados → 405 (no 500) · CORS que no refleja cualquier `Origin` · headers de seguridad presentes · trazas de stack fuera de las respuestas |
| **S8** | **Inyección** | SQL, NoSQL, comandos, path traversal, plantillas, LDAP — con el corpus de `_helpers/payloads.ts`. Lo esperado es **400/422 o tratamiento literal**, nunca 500. |
| **S9** | **Rate limiting** | N+1 llamadas en ventana → 429 con `Retry-After`. **Acotado**: el objetivo es probar el límite, no tumbar el servicio. |
| **S10** | **Escalada de privilegios** | Usuario cambiándose el rol a sí mismo · usuario A editando a B · token de tenant A operando sobre tenant B · endpoint de invitación que otorga más de lo que debería |

### Reglas de conducta, no negociables

1. **Sólo contra ambientes de prueba propios del equipo.** Nunca producción,
   nunca infraestructura de terceros, nunca la API de un proveedor.
2. **Nada de denegación de servicio.** Las pruebas de límites son acotadas
   (decenas de requests, no miles) y con corte explícito. Medir un rate limit
   no es tumbar el servicio.
3. **Sin exfiltrar.** Si un test consigue datos que no debía ver, el reporte
   dice *qué clase* de dato se filtró y por dónde — nunca el dato. Los valores
   se redactan (`****`).
4. **Se escribe cómo se reproduce.** Un hallazgo de seguridad sin pasos de
   reproducción no es reportable.
5. **Los hallazgos críticos se avisan primero y se escriben después.** No se
   esperan al reporte final.

---

## 7. Datos, integridad y transacciones

### Datos de prueba

- **Únicos por corrida.** Nada de `"test@test.com"`. Se usan los generadores de
  `_helpers/datos.ts`, sembrados con `RUN_ID`.
- **Autolimpiantes.** Lo que el test crea, el test lo borra (fixture `rastro`).
  Si no se puede borrar, se usa un espacio propio: tenant, prefijo o empresa de
  pruebas.
- **Sin depender de datos preexistentes.** "El cliente 1 tiene que estar" es una
  bomba de tiempo: alguien lo borra y la suite se cae sin explicación. Si hace
  falta un dato base, **lo crea el propio test** o un seed versionado.
- **Sin orden entre tests.** Cada `test()` pasa corriendo solo y en orden
  aleatorio (`--sequence.shuffle`). Compartir estado sólo dentro de un
  `describe.sequential` justificado **por escrito** en el archivo.

### Integridad (D8)

Lo que hay que probar y casi nunca se prueba:

- **Atomicidad.** Si la operación toca N tablas y la última falla, no puede
  quedar nada de las N-1. Se fuerza el error (dato inválido en el último paso)
  y se verifica que no quedó basura.
- **Referencial.** Borrar un padre con hijos → 409, o borrado en cascada
  documentado. Nunca huérfanos silenciosos.
- **Estados imposibles.** Las transiciones prohibidas de la máquina de estados
  se rechazan: anular una factura ya anulada, pagar una cancelada, confirmar una
  borrada. Cada transición inválida es un test.
- **Idempotencia.** Si el endpoint declara `Idempotency-Key`, dos llamadas con
  la misma clave producen **un** efecto y la misma respuesta. Si no la declara,
  probar el doble submit igual: la respuesta a "¿qué pasa si el usuario hace
  doble click?" no puede ser "dos facturas".
- **Consistencia de agregados.** Si hay saldos, totales o contadores derivados,
  se verifica que cuadran después de la operación. Los desbalances no aparecen
  en un test de un solo request.

### Consistencia eventual

Si el sistema tiene consistencia eventual (colas, réplicas, cachés), **está
permitido esperar** — pero nunca con `sleep`:

```ts
// ✅ esperar la condición, acotado y explícito
await esperarQue(() => db.buscarFactura(id), (f) => f?.estado === "PROCESADA", {
  timeout: 5_000,
  motivo: "la facturación se procesa por cola (worker cada ~2s)",
});

// ❌ dormir y rezar
await new Promise((r) => setTimeout(r, 5000));
```

Todo `esperarQue` lleva `motivo`. Si nadie sabe por qué hay que esperar, no hay
que esperar: hay un bug.

---

## 8. Códigos HTTP — tabla canónica

La discusión "¿404 o 403?" se resuelve una vez, se escribe, y los tests afirman
la decisión escrita.

| Código | Cuándo | Error frecuente que corrige |
|---|---|---|
| `200` | Lectura o actualización con cuerpo | Devolver 200 con `{"error": ...}` adentro — **prohibido** |
| `201` | Creación. **Con `Location`** | Devolver 200 en un POST que crea |
| `202` | Aceptado para procesar después | Devolver 201 cuando todavía no existe |
| `204` | Éxito sin cuerpo (típico `DELETE`) | Devolver 204 **con** cuerpo |
| `400` | Payload malformado, JSON inválido, tipo equivocado | Devolver 500 ante un JSON roto |
| `401` | **No sé quién sos**: falta credencial, vencida o inválida | Usar 403 para "no mandaste token" |
| `403` | **Sé quién sos y no podés** | Usar 401 para falta de permiso |
| `404` | No existe, **o no se puede revelar que existe** | Filtrar existencia con un 403 |
| `405` | Método no soportado en esa ruta | Devolver 404 o 500 |
| `409` | Conflicto de estado: duplicado, FK, transición inválida | Devolver 400 para todo conflicto |
| `410` | Existió y se fue, definitivamente | — |
| `415` | `Content-Type` no soportado | Devolver 400 |
| `422` | Sintaxis válida, semántica inválida (regla de negocio) | Mezclar con 400 sin criterio |
| `429` | Límite de tasa. **Con `Retry-After`** | Devolver 503 |
| `500` | Error nuestro, no del cliente | Devolver 500 por input inválido |
| `502/503/504` | Falla de una dependencia | Devolver 500 y perder la causa |

**Reglas duras**

1. **Nunca 200 con error adentro.** Rompe a todo cliente que mira el status.
2. **Nunca 500 por culpa del cliente.** Un 500 ante input inválido es un bug de
   validación, y así se reporta.
3. **404 vs 403 se decide una vez, por recurso, y se escribe** en el mapa. El
   test afirma la decisión, no la preferencia de quien lo escribe.
4. **Ninguna respuesta de error lleva stack trace, SQL, ni ruta de archivo.**
   Se prueba explícitamente: es filtración de información (§6 S7).

---

## 9. Determinismo — prohibiciones

```ts
await new Promise(r => setTimeout(r, 3000));      // ❌ sleep arbitrario
expect(res.status).toBeLessThan(500);             // ❌ aserción vacía
expect(res.cuerpo).toBeDefined();                 // ❌ no afirma nada
expect(res.cuerpo).toBeTruthy();                  // ❌ ídem
expect(res.status).not.toBe(200);                 // ❌ "no fue OK" no es un caso
if (res.status === 200) { expect(...) }           // ❌ condicional sobre el resultado
test.retry(3)                                      // ❌ retries para tapar flakiness
expect(res.cuerpo).toMatchSnapshot();             // ❌ snapshot del cuerpo entero
const id = 42;                                     // ❌ id fijo de un dato preexistente
test.skip("...")                                   // ❌ sin motivo escrito ni ticket
```

**Por qué el snapshot está prohibido.** Un snapshot de la respuesta entera se
rompe con cada campo nuevo (ruido) y se actualiza con `-u` sin leerlo (silencio).
Se afirman los campos que importan, y la *forma* la verifica el contrato (§5).

**Obligatorio en cambio**

```ts
expect(res.status).toBe(403);                                  // el código exacto
expect(res.cuerpo.codigo).toBe("PERMISO_INSUFICIENTE");        // el error, por código
expect(await db.contarFacturas(clienteId)).toBe(1);            // el efecto real
await expect(api.post("/api/x", { cuerpo })).resolves.toMatchObject({ status: 422 });
```

**Umbral de flakiness.** Un test que falla ≥1 de 10 corridas está **roto**,
aunque a veces pase. Se diagnostica la causa; no se le suben retries.

**`retry: 0`, también en CI.** El frontend acepta 1 retry en CI porque el
navegador introduce variabilidad real. Una llamada HTTP no. Acá un retry es
esconder una carrera.

---

## 10. Anatomía de un test

```ts
/**
 * API de Facturas — POST /api/facturas — <ticket>.
 *
 * Cadena real que ejercita: test → API :3100 → servicio → PostgreSQL.
 * Requisitos: servicio arriba, DB migrada, usuarios de prueba sembrados.
 *
 * Mapa: docs/qa/api/mapa/facturas.md
 * Contrato: openapi.yaml #/paths/~1api~1facturas/post
 *
 * Dimensiones cubiertas acá: D1 D2 D5 D7 D8 (D3 D4 en facturas.seguridad.test.ts,
 * D6 y D9 más abajo en este archivo).
 */
import { test, expect, describe } from "./fixtures";
import { montoUnico, nombreUnico } from "./_helpers/datos";
import { NUMEROS } from "./_helpers/payloads";

describe("POST /api/facturas @critico", () => {
  test("crear una factura válida la deja PENDIENTE y consultable", async ({ api, db, contrato, rastro }) => {
    // Arrange — el estado del que se parte
    const cliente = await api.como("operador").post("/api/clientes", { cuerpo: { nombre: nombreUnico() } });
    rastro.anotar("clientes", cliente.cuerpo.id);

    // Act
    const res = await api.como("operador").post("/api/facturas", {
      cuerpo: { clienteId: cliente.cuerpo.id, monto: montoUnico() },
    });

    // Assert — tres capas (§3)
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/facturas/${res.cuerpo.id}`);
    await contrato.verificar("POST", "/api/facturas", 201, res.cuerpo);

    const enBase = await db.buscarFactura(res.cuerpo.id);
    expect(enBase).toMatchObject({ estado: "PENDIENTE", clienteId: cliente.cuerpo.id });
    rastro.anotar("facturas", res.cuerpo.id);
  });

  // Un caso por valor: el reporte dice CUÁL falló, no "el test de validación".
  const MONTOS_INVALIDOS: Array<[string, unknown]> = [
    ["negativo", NUMEROS.negativo],
    ["cero", NUMEROS.cero],
    ["texto", "mil"],
    ["overflow", NUMEROS.maxSafeMas2],
  ];

  for (const [etiqueta, valor] of MONTOS_INVALIDOS) {
    test(`monto ${etiqueta} → 422 sin crear nada`, async ({ api, db }) => {
      const antes = await db.contar("facturas");
      const res = await api.como("operador").post("/api/facturas", { cuerpo: { monto: valor } });

      expect(res.status).toBe(422);
      expect(res.cuerpo.codigo).toBe("VALIDACION");
      expect(await db.contar("facturas")).toBe(antes);   // el rechazo no dejó rastro
    });
  }
});
```

**Obligatorio en todo archivo de tests:**

- **Cabecera** con la cadena real que se ejercita, los requisitos para correr,
  el link al mapa, el link al contrato y **qué dimensiones cubre**. Sin
  cabecera, no pasa revisión.
- **Arrange / Act / Assert** explícito.
- **Un `test()` = un comportamiento.** Si el título necesita un "y", son dos.
- **Un caso por valor** en las familias de inputs (bucle o `test.for`), nunca
  un test con quince `expect`: cuando falla, el reporte tiene que decir **qué
  valor** falló, no "el test de validación".
- **El rol con el que se actúa, explícito** en cada llamada (`api.como(...)`).
  Un test que no dice con qué identidad opera no se puede revisar.

---

## 11. Etiquetas y niveles de suite

Se etiqueta en el título del `describe` o del `test`.

| Etiqueta | Qué es | Dónde corre | Presupuesto |
|---|---|---|---|
| `@smoke` | ¿El servicio está vivo y autenticando? | Cada push y cada deploy | < 30 s |
| `@critico` | Si se rompe, se pierde plata o se frena la operación | Cada PR | < 5 min |
| `@contrato` | Cumplimiento del contrato publicado | Cada PR | < 2 min |
| `@seguridad` | Authn, authz, IDOR, inyección, mass assignment | Cada PR + completo nightly | < 5 min en PR |
| `@integridad` | Transacciones, referencial, estados, agregados | Nightly y pre-release | — |
| `@concurrencia` | Carreras, doble submit, idempotencia | Nightly | — |
| `@lento` | Depende de terceros o de volumen | Nightly | — |
| `@destructivo` | Muta o borra de forma irreversible | **Sólo ambiente efímero** | — |

```bash
npm run test:api:smoke
npx vitest run -t "@seguridad"
npx vitest run --exclude "**/*.lento.test.ts"
```

Todo test nace `@regresion` implícito (sin etiqueta de nivel corre en la suite
completa). Se **promueve** a `@critico` cuando el endpoint tiene dueño de
negocio, y a `@smoke` cuando es la puerta de entrada del sistema.

---

## 12. Ambientes y secretos

- **Guardarraíl anti-producción obligatorio.** `_helpers/entorno.ts` corta la
  corrida si la URL base parece producción, salvo que se declare
  `API_PERMITIR_PRODUCCION=1` **y** la suite sea sólo lectura y `@smoke`. No es
  paranoia: el día que alguien exporte la variable equivocada, esto es lo único
  que hay entre el test de borrado masivo y los datos reales.
- **Credenciales sólo desde `process.env`**, cargadas de `.api-secrets.local`
  (gitignoreado) o del secret store de CI.
- **Un usuario por rol**, de servicio, creado para esto. Nunca las credenciales
  personales de nadie: si un test falla por permisos, hay que poder saber de
  quién es el permiso.
- **Si falta una credencial**, el test hace `skip` **con mensaje explicativo**.
  Nunca falla con un error críptico ni, peor, pasa vacío.
- **Prohibido** que un secreto aparezca en un reporte, en un log de corrida, en
  un mapa de endpoints o en un mensaje de error. El cliente HTTP redacta
  `Authorization`, `Cookie`, `password`, `token` y `secret` en toda su evidencia.

---

## 13. Definition of Done de un test de backend

- [ ] Existe el mapa del endpoint (`docs/qa/api/mapa/<recurso>.md`)
- [ ] Las nueve dimensiones tienen veredicto en `docs/qa/api/cobertura.md`
- [ ] Los tests que escriben datos afirman en **tres capas** (§3)
- [ ] Los tests de rechazo tienen **control positivo** (§4)
- [ ] Pasa 3 corridas seguidas y en orden aleatorio (`--sequence.shuffle`)
- [ ] Pasa corriendo solo y dentro de la suite completa
- [ ] **Falla de verdad si se rompe el servicio** (verificado rompiéndolo a propósito)
- [ ] Sin sleeps, sin aserciones vacías, sin snapshots del cuerpo, sin retries
- [ ] Cabecera con cadena, requisitos, mapa, contrato y dimensiones
- [ ] Limpia lo que creó
- [ ] Tiene etiqueta de nivel
- [ ] Ningún secreto en el código, en la salida ni en el reporte

Los dos que más se saltean son el **control positivo** y el **romper el servicio
a propósito**. Son también los dos que separan una suite que protege de una
suite que decora.

---

## 14. Qué NO automatizar acá

- **Reglas de negocio con muchas combinaciones** → tests unitarios. Un E2E de
  API por cada rama de un cálculo de impuestos es caro, lento y frágil.
- **Performance y carga** → herramienta de carga (k6, Artillery), no Vitest. Un
  test funcional que además mide tiempos falla por el ruido de la máquina.
- **Integraciones con terceros sin sandbox** → mockear el borde y marcar
  `@manual` el camino real.
- **La base de datos en sí** (que el índice exista, que la FK esté) → migraciones
  y linters de esquema, no tests de API.

**Un test de API prueba que las piezas están bien conectadas y bien defendidas,
no que cada pieza calcula bien.**

---

## 15. Cómo se hace cumplir

| Control | Cuándo | Herramienta |
|---|---|---|
| Prohibiciones, naming, cabeceras, tres capas | Antes de commitear | `/backend-standards-enforcer` |
| Contrato vs implementación | Cada PR | `/api-contract-validator` |
| Cobertura de las nueve dimensiones | Cada PR | `coverage-critic-agent` |
| Catálogo de seguridad | Cada PR (subset) + nightly | `/security-penetration-tester` |
| Flakiness | Nightly | `--sequence.shuffle` × 3 corridas |
| Que los tests puedan fallar | Antes de entregar | Romper el servicio a propósito |

Una excepción a este estándar se documenta **en el mismo archivo**, con el
motivo y qué haría falta para eliminarla. Excepción sin comentario = violación.
