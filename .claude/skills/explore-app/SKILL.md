---
name: explore-app
description: Exploración agentic de la aplicación con el MCP de Playwright. Recorre la app en un navegador real como un usuario, descubre rutas, estados, selectores reales y comportamientos, y produce un mapa de flujo versionado en docs/qa/mapa/ que es el único insumo válido para generar tests. Usalo antes de escribir cualquier test, o cuando pidan explorar, relevar o entender una pantalla o flujo.
---

# Explore App — exploración agentic

Recorrés la aplicación en un navegador real y dejás un **mapa del flujo**: qué
existe, cómo se llama, cómo se alcanza y qué pasa cuando se usa.

Tu producto es **descriptivo**. No escribís tests. No opinás sobre qué habría
que probar. Registrás lo que *observaste*, y sólo eso — porque todo lo que
escribas acá se va a convertir en un selector de un test, y un selector inventado
es una falla garantizada dentro de dos semanas.

---

## Herramientas

MCP de Playwright. Según cómo esté instalado, el prefijo es
`mcp__playwright__browser_*` o `mcp__plugin_playwright_playwright__browser_*`.
Las que usás:

| Herramienta | Para qué |
|---|---|
| `browser_navigate` | Ir a una URL |
| `browser_snapshot` | **Tu herramienta principal.** Árbol de accesibilidad: roles, nombres, estados |
| `browser_click` / `browser_type` / `browser_fill_form` / `browser_select_option` | Interactuar |
| `browser_press_key` | Navegación por teclado (Tab, Enter, Escape) |
| `browser_console_messages` | Errores de JS que el usuario no ve pero rompen igual |
| `browser_network_requests` | Qué endpoints se llaman, con qué método, qué devuelven |
| `browser_take_screenshot` | Evidencia de estados relevantes |
| `browser_wait_for` | Esperar texto o condición |

`browser_snapshot` **antes** que `browser_take_screenshot`: el snapshot te da los
roles y nombres accesibles, que es exactamente lo que necesitan los selectores.
La captura de pantalla es evidencia para humanos, no insumo de tests.

---

## Proceso

### 1. Preparar

- Confirmá que la app está levantada (`curl -s -o /dev/null -w "%{http_code}" <url>`).
  Si no, buscá cómo se levanta (`package.json`, `README.md`, `CLAUDE.md`) y decilo
  — no la levantes sin avisar.
- Si el flujo necesita sesión, resolvé el login primero y anotá cómo lo hiciste.
- Leé el mapa anterior si existe (`docs/qa/mapa/<flujo>.md`): tu trabajo puede
  ser actualizarlo, no rehacerlo.

### 2. Recorrer el camino principal

Hacé el flujo **completo, de punta a punta**, como lo haría un usuario que sabe
lo que quiere. En cada pantalla:

1. `browser_snapshot` → registrá rol, nombre accesible y `data-testid` de cada
   control relevante
2. `browser_network_requests` → qué llamadas dispara la pantalla
3. `browser_console_messages` → errores o warnings
4. Interactuá y observá **qué cambia**: qué aparece, qué desaparece, a dónde navega

### 3. Explorar los bordes

Volvé y probá lo que un usuario real hace sin querer:

| Sonda | Qué buscás |
|---|---|
| Enviar el formulario vacío | Mensajes de validación y cómo se anuncian |
| Datos inválidos (email sin `@`, monto negativo, fecha imposible) | Validación real vs. sólo visual |
| Doble click en el botón de acción | ¿Se duplica la operación? |
| Botón "atrás" del navegador a mitad del flujo | ¿Se pierde el estado? ¿Queda inconsistente? |
| Refresh (F5) a mitad del flujo | ¿Sobrevive? |
| Sólo teclado (Tab / Enter / Escape) | Accesibilidad real, foco visible, trampas de foco |
| Ventana angosta (`browser_resize` 375×667) | ¿Se rompe? ¿Desaparecen controles? |
| Lista vacía / sin resultados | ¿Existe un estado vacío o queda en blanco? |
| Mientras carga | ¿Hay indicador? ¿Se puede clickear dos veces? |

No hace falta agotar la lista en cada flujo. Elegí las que apliquen y **anotá
cuáles probaste y cuáles no**.

### 4. Mirar el código para confirmar

Después de observar, confirmá contra el fuente:

```bash
grep -rn "data-testid" src/ --include="*.tsx" --include="*.vue" | head -40
```

Sirve para dos cosas: confirmar que el `data-testid` que viste es el que está en
el código, y **detectar los que faltan**. Cada control que sólo se puede alcanzar
por CSS es un `data-testid` faltante, y va anotado como tal.

### 5. Escribir el mapa

En `docs/qa/mapa/<flujo>.md`, con esta estructura exacta:

````markdown
---
flujo: checkout
ruta-base: /checkout
explorado: 2026-08-12
ambiente: local (:5173) → BFF :3100
sesion: requiere login (E2E_KC_USER)
---

# Mapa de exploración — Checkout

## Qué hace este flujo, en criollo
El usuario revisa el carrito, elige medio de pago, confirma y recibe una orden.

## Rutas
| Ruta | Qué es | Necesita sesión |
|---|---|---|
| `/checkout` | Resumen del carrito | sí |
| `/checkout/pago` | Datos de la tarjeta | sí |
| `/checkout/confirmacion/:id` | Comprobante | sí |

## Selectores OBSERVADOS
> Copiados de `browser_snapshot`. Todo lo de acá se vio en el navegador.

| Elemento | Selector recomendado | Peldaño | Nota |
|---|---|---|---|
| Título | `getByRole("heading", { name: "Checkout" })` | 1 | |
| Botón pagar | `getByRole("button", { name: "Pagar" })` | 1 | se deshabilita mientras envía |
| Nº de tarjeta | `getByLabel("Número de tarjeta")` | 2 | |
| Fila de ítem | `getByTestId("fila-item-<id>")` | 3 | ⚠️ NO EXISTE — hay que agregarlo |
| Estado de orden | `getByTestId("estado-orden")` | 3 | ⚠️ NO EXISTE — hay que agregarlo |
| Total | `getByTestId("checkout-total")` | 3 | ⚠️ NO EXISTE — el texto es formateado ("Gs 1.500.000") |

## data-testid faltantes (para el test-writer)
| Archivo | Elemento | testid propuesto |
|---|---|---|
| `src/pages/Checkout.tsx:88` | fila de la tabla | `fila-item-${item.id}` |
| `src/pages/Checkout.tsx:140` | badge de estado | `estado-orden` |

## Red
| Acción | Endpoint | Método | Respuesta OK |
|---|---|---|---|
| Cargar la página | `/api/carrito` | GET | 200, `{items:[...]}` |
| Confirmar pago | `/api/pagos` | POST | 201, `{ordenId}` |

## Comportamientos observados
- El botón "Pagar" se deshabilita al enviar y vuelve si hay error. Sirve como
  señal de espera determinista.
- No hay estado vacío: con el carrito vacío la página queda en blanco. 🐛
- El total se formatea con separador de miles → **no asertar por texto**.

## Bordes probados
| Sonda | Resultado |
|---|---|
| Formulario vacío | ✅ valida los 3 campos, mensajes bajo cada input |
| Doble click en Pagar | 🐛 **crea dos órdenes** |
| Botón atrás desde confirmación | ✅ vuelve al carrito, ya vacío |
| Sólo teclado | ⚠️ el botón "quitar ítem" es un `<div>`, no se alcanza con Tab |
| 375×667 | ✅ |
| Refresh en /pago | no probado — pendiente |

## Hallazgos
| # | Severidad | Qué |
|---|---|---|
| 1 | 🔴 alta | Doble click en Pagar crea dos órdenes |
| 2 | 🟡 media | Carrito vacío = página en blanco, sin estado vacío |
| 3 | 🟡 media | a11y: "quitar ítem" es un `div` sin rol ni acceso por teclado |
| 4 | 🔵 baja | Consola: warning de key duplicada en la lista de ítems |

## Escenarios candidatos a automatizar
> Sugerencias. Quien invoca decide.
1. Happy path — pagar con tarjeta válida deja la orden confirmada
2. Tarjeta vencida muestra el error del emisor
3. Carrito vacío no permite llegar al pago
4. Doble click en Pagar genera una sola orden ← cubre el hallazgo 1

## Qué NO exploré
- Pago con transferencia (necesita cuenta de sandbox)
- Flujo de cupones
````

---

## Reglas duras

1. **Todo selector del mapa fue observado.** Si no lo viste en un snapshot o en
   el código, no va. Un mapa con selectores supuestos envenena todos los tests
   que salgan de él.
2. **Marcá lo que falta.** Los `data-testid` inexistentes van con ⚠️ y su archivo:línea.
3. **No escribas tests.** Ni siquiera "de ejemplo".
4. **No modifiques la app.** Ni un `data-testid`. Los anotás; los agrega el test-writer.
5. **Registrá los bugs que encuentres**, aunque nadie te los haya pedido.
   Explorar es la actividad que más bugs encuentra por hora invertida.
6. **Anotá lo que no exploraste.** Un mapa que no dice sus límites se lee como completo.
7. **Cuidado con lo que escribís.** Si el flujo crea datos, decí qué creaste y
   si quedó colgado. Nunca explores flujos destructivos en producción.
8. **Sin credenciales en el mapa.** El mapa se commitea.

---

## Errores típicos

| Error | Por qué duele |
|---|---|
| Anotar `getByText("Pagar")` para un botón | El texto cambia con el idioma; el rol no |
| Anotar el total como texto exacto | Formato y moneda cambian; se rompe sin que nada esté roto |
| Explorar sólo el happy path | Los bugs viven en los bordes |
| No mirar la consola | Los errores de JS son bugs reales que no se ven en pantalla |
| Dar por vigente un mapa viejo | El código cambió; tu mapa no |
