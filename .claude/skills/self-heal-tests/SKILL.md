---
name: self-heal-tests
description: Diagnostica y repara tests Playwright que fallan. Distingue si se rompió el test o se rompió la aplicación, repara sólo lo primero y reporta lo segundo como bug sin tocar las aserciones. Usalo cuando la suite esté en rojo, cuando pidan arreglar tests rotos o flaky, o después de un cambio que rompió la suite.
---

# Self-Heal Tests — diagnosticar antes de reparar

Reparás tests rotos. Tu valor no está en poner la suite en verde: está en poner
la suite en verde **sólo cuando corresponde**.

> Un agente que hace pasar tests ajustando aserciones no arregla nada: destruye
> la única señal de calidad que el equipo tiene. La suite queda verde y el bug
> llega a producción.

---

## La pregunta que se responde primero

```
                    ¿Por qué falló?
                          │
        ┌─────────────────┴─────────────────┐
        │                                   │
  SE ROMPIÓ EL TEST                   SE ROMPIÓ LA APP
  (la app anda bien, el              (el test tenía razón)
   test la alcanza mal)
        │                                   │
   ✅ REPARÁS                          🐛 REPORTÁS
   cambiás el CAMINO                   NO tocás el test
                                       el rojo se queda
```

Y un tercer caso que se confunde con los dos:

```
  CAMBIÓ EL COMPORTAMIENTO A PROPÓSITO
  (el producto decidió otra cosa)
        │
   ⏸️ PARÁS y preguntás
   sólo una persona puede decidir que la nueva conducta es la correcta
```

**Ante la duda, nunca repares. Reportá.** El costo de un rojo de más es una
conversación. El costo de un verde de más es un bug en producción.

---

## Proceso

### 1. Reproducir y recolectar

```bash
npx playwright test <spec> --reporter=list 2>&1 | tee /tmp/falla.txt
npx playwright show-trace test-results/<...>/trace.zip   # el trace manda
```

Necesitás, sí o sí:
- El mensaje de error exacto y la línea que falló
- Qué se esperaba y qué se obtuvo
- El screenshot del momento de la falla
- Los errores de consola y las respuestas de red del trace

Sin trace estás adivinando. Si `trace` no estaba activo, activalo y volvé a correr.

### 2. Clasificar

| Síntoma | Casi siempre es | Acción |
|---|---|---|
| `locator resolved to 0 elements` y la app se ve bien | Test roto — cambió el nombre/rol | Reparar |
| `strict mode violation: resolved to N elements` | Test roto — selector ambiguo | Reparar |
| El elemento aparece después de lo esperado | Test roto — espera mal puesta | Reparar |
| Timeout esperando algo que **nunca** aparece, y la red devolvió 500 | **App rota** | Reportar |
| Aserción de valor fallida (`"Confirmada"` vs `"Pendiente"`) | **App rota** | Reportar |
| Error de consola nuevo + pantalla en blanco | **App rota** | Reportar |
| Falla 1 de cada 5 corridas | Flakiness — carrera | Diagnosticar la carrera |
| Falla sólo si corre después de otro test | Contaminación de estado | Reparar aislamiento |
| El texto cambió de "Guardar" a "Guardar cambios" | Depende: ¿fue a propósito? | Preguntar / reparar |

**Cómo decidir cuando no está claro:** abrí el navegador y hacé el flujo a mano
con el MCP de Playwright. Si vos, como usuario, lográs lo que el test esperaba
→ el test está roto. Si vos tampoco lográs → la app está rota. Es el desempate
más confiable que tenés.

### 3. Reparar — sólo el camino, nunca el destino

**La línea que no se cruza:**

```ts
// ✅ REPARAR — el destino sigue siendo el mismo
- page.getByRole("button", { name: "Guardar" })
+ page.getByRole("button", { name: "Guardar cambios" })

- page.locator(".fila-factura")                    // CSS, se rompió con el CSS
+ page.getByTestId(`fila-factura-${nro}`)          // + testid agregado a la app

- await page.waitForTimeout(2000);
- await expect(page.getByTestId("total")).toHaveText("1.500");
+ await expect(page.getByTestId("total")).toHaveText("1.500");   // web-first espera sola
```

```ts
// ❌ ENMASCARAR — todas estas son violaciones de contrato
- await expect(estado).toHaveText("Confirmada");
+ await expect(estado).toBeVisible();                    // afirma menos

+ await expect(estado).toHaveText("Confirmada", { timeout: 60_000 });  // tapa lentitud

+ test.skip();                                            // sin hallazgo escrito
+ retries: 3                                              // esconde flakiness
+ await expect(total).toContainText("1");                 // aserción vaciada
```

**Prueba del algodón:** si tu cambio hace que el test siga pasando cuando la
funcionalidad está rota, tu cambio está mal.

### 4. Diagnosticar flakiness

La flakiness no se "repara": se le encuentra la causa. Las cinco reales:

| Causa | Cómo se ve | Arreglo |
|---|---|---|
| Espera por tiempo | `waitForTimeout` antes de la aserción | Aserción web-first sobre el efecto |
| Espera por red | `networkidle` en una SPA con polling | Esperar la respuesta o el elemento concretos |
| Datos compartidos | Falla al correr en paralelo | Datos únicos por corrida |
| Orden de tests | Falla si corre segundo | Estado propio en `beforeEach` |
| Animación / transición | Click que "no hace nada" | Esperar el estado final, no el elemento |

```bash
npx playwright test <spec> --repeat-each=10 --reporter=line   # confirmar
```

Si tras diagnosticar no podés resolverla:

```ts
// FLAKY — falla ~2/10 por carrera entre el refetch y el render de la tabla.
// Hallazgo: docs/qa/reportes/2026-08-12-flaky-facturas.md
// Bloqueado por: la tabla no expone estado de carga. Requiere data-testid="estado-carga".
test.fixme("el listado refleja la factura recién creada", async ({ page }) => {
```

`fixme` con explicación, hallazgo escrito y qué haría falta para arreglarlo.
Nunca `skip` a secas: un `skip` sin motivo es un test que se muere en silencio.

### 5. Verificar la reparación

```bash
npx playwright test <spec> --repeat-each=3     # 3 verdes seguidas
npx playwright test                             # la suite entera, sin nuevos rojos
```

Y volvé a hacer la verificación de falla: rompé la funcionalidad y confirmá que
el test reparado **sigue detectándolo**. Es fácil reparar un test hasta dejarlo
inofensivo sin darse cuenta.

### 6. Reportar

```markdown
# Reparación de suite — 2026-08-12

## Reparados (3)
| Test | Causa | Qué cambié |
|---|---|---|
| `checkout.spec.ts:45` | La app renombró "Guardar" → "Guardar cambios" | Nombre del rol |
| `facturas.spec.ts:88` | Selector CSS roto por refactor de estilos | `data-testid="fila-factura-<nro>"` (agregado a la app) |
| `login.spec.ts:22` | `waitForTimeout(3000)` antes del redirect | Aserción web-first sobre la URL |

## NO reparados — son bugs de la app (2)
### 🐛 El estado de la orden queda "Pendiente" tras un pago aprobado
**Test:** `checkout.spec.ts:60` — se queda rojo, a propósito
**Evidencia:** `test-results/checkout-pagar/trace.zip`
**Qué vi:** `POST /api/pagos` devuelve 201 con `estado: "CONFIRMADA"`, la UI
muestra "Pendiente". El webhook de confirmación no actualiza el store.
**Severidad:** crítica — el usuario no sabe si pagó.

## Esperando decisión (1)
### ⏸️ El flujo de alta ahora pide confirmación por email
`registro.spec.ts:30` esperaba llegar al dashboard tras registrarse; ahora
aparece "Revisá tu correo". Parece un cambio de producto deliberado.
**Necesito confirmación** antes de actualizar el test.

## Archivos tocados
- `tests/e2e/checkout.spec.ts`, `tests/e2e/facturas.spec.ts`, `tests/e2e/login.spec.ts`
- `src/components/TablaFacturas.tsx` (+1 `data-testid`)
```

---

## Reglas duras

1. **Nunca cambies lo que un test afirma.** Sólo cómo llega.
2. **Ante la duda, reportá el bug.** No repares.
3. **Nada de `waitForTimeout` ni timeouts inflados como reparación.** Son el
   síntoma que estás arreglando, no la cura.
4. **Nada de subir `retries`.** Nunca es la respuesta.
5. **`fixme` sólo con hallazgo escrito**: causa, evidencia y qué haría falta.
6. **Tres ciclos y escalás.** Reparar → correr, tres veces. Si sigue rojo, parás
   y escribís qué no pudiste resolver.
7. **Verificá que el test reparado todavía puede fallar.**
8. **No commiteás.**

---

## Antipatrones que tenés prohibido cometer

| Antipatrón | Por qué es grave |
|---|---|
| Cambiar `toHaveText` por `toBeVisible` | Convierte el test en decoración |
| Subir timeouts hasta que pase | Esconde una regresión de performance real |
| `test.skip()` sin motivo | El test se muere y nadie se entera |
| Reescribir el test entero para que pase | Perdés la intención original y el bug |
| Reparar 10 tests sin mirar si comparten causa | 10 parches en vez de 1 arreglo |
| Reportar "reparado" sin correr `--repeat-each` | Volvés a entregar flakiness |
