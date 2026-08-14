---
name: backend-self-heal
description: Diagnostica y repara tests de API que fallan, distinguiendo las tres causas posibles — se rompió el test, se rompió el servicio o se rompió el ambiente. Repara sólo la primera, reporta la segunda como bug sin tocar las aserciones, y arregla o escala la tercera. Usalo cuando la suite de API esté en rojo, cuando pidan arreglar tests de backend rotos o inestables, o después de un cambio que rompió la suite.
---

# Backend Self-Heal — tres causas, tres respuestas

Tu valor **no** es poner la suite en verde. Es ponerla en verde sólo cuando
corresponde. Un healer que afloja aserciones hasta que todo pasa destruye la
única señal de calidad que el equipo tiene.

Norma: `BACKEND_TESTING_STANDARDS.md`.

---

## La primera pregunta, y tiene TRES respuestas

En frontend son dos (test roto o app rota). En backend hay una tercera que es
la **más frecuente** y la que más tiempo hace perder cuando se confunde:

```
        ¿Se rompió el TEST, el SERVICIO o el AMBIENTE?

  TEST roto      →  ✅ reparás (cambiás el camino, no el destino)
  SERVICIO roto  →  🐛 reportás, el rojo se queda
  AMBIENTE roto  →  🔧 lo arreglás o lo escalás — pero NO es un bug de la app
  CAMBIO deliberado de producto → ⏸️ parás y preguntás
```

**Ante la duda, nunca repares. Reportá.** El costo de un rojo de más es una
conversación. El de un verde de más es un bug en producción.

---

## Diagnóstico del ambiente: siempre primero

Antes de mirar una línea de código de tests. Es barato y descarta la mitad de
los rojos.

| Síntoma | Causa casi segura | Qué hacer |
|---|---|---|
| **Todos** los tests fallan | Servicio caído, puerto cambiado | Levantar / corregir `API_BASE_URL` |
| `no llegó a responder: fetch failed` | Servicio caído | Ídem |
| Todos los 401 | Credenciales vencidas o usuario borrado del ambiente | Renovar en `.api-secrets.local` |
| Fallan todos los de un recurso, con 500 | Migración pendiente | Correr migraciones |
| Fallan los que dependen de un dato base | Seed perdido | Re-sembrar; y después **arreglar el test** para que cree lo suyo |
| Falla sólo en CI | Variables de entorno faltantes | Revisar los secrets del runner |
| Falló hoy y ayer no, sin cambios | Datos de corridas viejas sin limpiar | Limpiar por prefijo `API-E2E` |
| `guardarraíl: parece PRODUCCIÓN` | **`API_BASE_URL` mal apuntada** | 🛑 Parar. No es un test roto: es un accidente evitado |

Regla práctica: **si fallan más de la mitad de los tests, es el ambiente.** Un
cambio de código rompe un grupo con algo en común; un ambiente roto rompe todo.

---

## Cómo distinguir test roto de servicio roto

El desempate más confiable es **reproducir a mano**:

```bash
curl -i -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/facturas/1042
```

Si vos conseguís lo que el test esperaba → el test está roto.
Si vos tampoco → el servicio está roto.

Segundo desempate: **`git log` del servicio**. Si el endpoint cambió en el
último commit y el test es viejo, el test se quedó atrás — pero eso todavía no
dice si el cambio del servicio era correcto.

| Síntoma | Casi siempre | Acción |
|---|---|---|
| 404 en una ruta que existe (mayúsculas, barra, prefijo) | Test roto | Reparar la ruta |
| Cambió el nombre de un campo del request | Test roto | Actualizar el request |
| El contrato declara `id` y ahora viene `uuid` | ⏸️ Cambio de producto | Preguntar |
| Aserción de valor: esperaba `"CONFIRMADA"`, vino `"PENDIENTE"` | **Servicio roto** | Reportar |
| 500 donde se esperaba 4xx | **Servicio roto** | Reportar |
| 200 donde se esperaba 403 | **Servicio roto**, y es de seguridad | Reportar y avisar YA |
| Campo no declarado en la respuesta | **Servicio roto** (o contrato viejo) | Clasificar: ¿filtración? |
| Falla 1 de cada 5 corridas | Carrera | Diagnosticar, ver abajo |
| Falla sólo después de otro test | Contaminación de estado | Reparar el aislamiento |
| Falla sólo en paralelo | Datos compartidos | Reparar con datos únicos |

---

## La línea que no cruzás

```ts
// ✅ REPARAR — mismo destino, otro camino
- await api.post("/api/factura", { cuerpo })          // la ruta se pluralizó
+ await api.post("/api/facturas", { cuerpo })

- cuerpo: { cliente_id: 1 }                            // el request cambió de forma
+ cuerpo: { clienteId: 1 }

- await new Promise(r => setTimeout(r, 3000));         // espera prohibida
+ await esperarQue(() => db.buscar("facturas", id), f => f?.estado === "PROCESADA",
+   { motivo: "la emisión se procesa por cola" });

// ❌ ENMASCARAR — violaciones de contrato, todas
- expect(res.status).toBe(201);
+ expect(res.status).toBeLessThan(500);

- expect(enBase.estado).toBe("PENDIENTE");
+ expect(enBase).toBeDefined();

- expect(res.status).toBe(403);
+ expect([200, 403]).toContain(res.status);            // "a veces pasa" no es un caso

+ expect(res.cuerpo).toMatchObject({ ... });           // sacando la verificación en base
+ API_CONTRATO_LAXO=1                                   // para que el contrato deje de fallar
+ test.skip(...)                                        // sin hallazgo escrito
```

**Prueba del algodón:** si tu cambio hace que el test siga pasando cuando la
funcionalidad está rota, tu cambio está mal.

**Y una específica de backend:** si para poner el test en verde tuviste que
sacar la aserción de capa 3 (la que mira la base), lo que encontraste es
exactamente el bug que el test existía para atrapar.

---

## Flakiness: causa, no parche

Las cinco causas reales, en orden de frecuencia:

1. **Datos compartidos entre tests.** Dos tests usan el mismo email/documento.
   Se arregla con `_helpers/datos.ts`, no con `fileParallelism: false`.
2. **Dependencia de orden.** El test B necesita lo que creó el A.
   Se arregla haciendo que B cree lo suyo.
3. **Consistencia eventual sin esperar la condición.** Se arregla con
   `esperarQue` y motivo escrito.
4. **Limpieza que no corre.** Un test que falla a mitad deja basura que rompe
   al siguiente. Se arregla usando la fixture `rastro` (limpia en el teardown,
   pase lo que pase).
5. **Carrera real en el servicio.** El test tiene razón: es un bug de
   concurrencia. **No se repara: se reporta.**

```bash
npm run test:api:aleatorio          # 3 corridas en orden aleatorio
npx vitest run tests/api/facturas.test.ts --sequence.shuffle
```

Si no la podés resolver hoy:

```ts
// INESTABLE — falla ~2/10 por carrera entre el commit y la lectura de la réplica.
// Hallazgo: docs/qa/api/reportes/2026-08-13-flaky-facturas.md
// Bloqueado por: la fuente de verdad es una réplica y no hay forma de leer del primario.
test.skip("el listado refleja la factura recién creada", async ({ api }) => {
```

Nunca `skip` a secas: un skip sin motivo es un test que se muere en silencio.

---

## Reglas duras

1. **Ambiente primero.** Descartalo antes de tocar código.
2. Nunca cambies **lo que** un test afirma.
3. Nunca saques la aserción de capa 3 para poner algo en verde.
4. Nunca pongas `API_CONTRATO_LAXO=1` como reparación.
5. Nada de `setTimeout`, timeouts inflados ni `retry` como arreglo.
6. `skip` sólo con causa, evidencia y qué haría falta para resolverlo.
7. **Tres ciclos y escalás.** Reparar → correr, tres veces. Si sigue rojo,
   parás y escribís qué no pudiste resolver.
8. Después de reparar, verificá que el test **todavía puede fallar**.
9. Buscá causa común: 30 rojos suelen ser 1 cambio, no 30 parches.
10. **Un 200 donde se esperaba 403 se avisa al toque**, antes de seguir
    diagnosticando el resto.
11. No commiteás.

---

## Al terminar, respondé así

```
Suite: 143 tests · 31 rojos al empezar · 4 rojos al terminar (a propósito)

🔧 Ambiente (22 de los 31)
  La base de pruebas no tenía las migraciones del último sprint.
  `npm run db:migrate` y volvieron a verde. NO eran bugs.

✅ Reparados (5)
  facturas.test.ts:34    la ruta se pluralizó: /api/factura → /api/facturas
  clientes.test.ts:88    el request pasó de cliente_id a clienteId
  pagos.test.ts:120      setTimeout(3000) → esperarQue con motivo
  usuarios.test.ts:45    email fijo → emailUnico() (chocaba en paralelo)
  facturas.test.ts:201   el test dependía de que corriera después de clientes.test.ts

🐛 NO reparados — son bugs del servicio (4). Quedan rojos, es correcto.
  #1 CRÍTICA  GET /api/facturas/{id} devuelve 200 a otro usuario (esperado 404)
              ⚠️ avisado apenas lo vi, antes de terminar el diagnóstico.
              facturas.seguridad.test.ts:41
  #2 alta     POST /api/facturas con monto=1e309 → 500 (esperado 422)
  #3 alta     Anular dos veces acredita dos veces — saldo del cliente 4471 duplicado
  #4 media    El contrato declara `total` number y la API devuelve string

⏸️ Esperando decisión (1)
  clientes.test.ts:12  El endpoint ahora exige `tipoDocumento`.
                       ¿Cambio de producto o regresión? No toqué el test.

Verificación: los 5 reparados pasan 3 corridas en orden aleatorio y siguen
fallando al romper el servicio a propósito. No commiteé.
```
