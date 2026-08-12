# PROMPTS.md — Prompts del día a día

Copiar, pegar, cambiar lo que está `<entre ángulos>`. Están ordenados por
frecuencia de uso real.

> **Si sólo te acordás de uno:** el #1. Arranca el ciclo completo y las skills
> se encadenan solas.

---

## 1 · Probar un flujo de punta a punta

```
/human-tester probá el flujo de <checkout / alta de cliente / facturación>.
Explorá primero, generá los tests, corrélos y decime qué encontraste.
```

Es el prompt principal. Hace todo el ciclo: explora, decide qué automatizar,
escribe, corre, verifica que los tests puedan fallar y reporta.

**Variante con foco:**
```
/human-tester probá el flujo de checkout, poniendo el foco en qué pasa cuando
la pasarela de pagos falla o tarda.
```

---

## 2 · Explorar una pantalla que no conocés

```
/explore-app http://localhost:5173/<ruta>

Recorré el flujo completo como un usuario, probá los bordes (formulario vacío,
doble click, botón atrás, sólo teclado) y dejame el mapa en docs/qa/mapa/.
No escribas tests todavía.
```

Úsalo cuando llegás a una pantalla heredada y no sabés qué hace. Es la actividad
que más bugs encuentra por hora invertida.

---

## 3 · Generar tests desde un mapa existente

```
/generate-playwright-tests <flujo>

Usá el mapa de docs/qa/mapa/<flujo>.md. Automatizá el happy path, las
validaciones y el error de servidor. Agregá los data-testid que falten.
Verificá que cada test falla si rompo la funcionalidad.
```

---

## 4 · Reparar la suite en rojo

```
/self-heal-tests

Corré la suite, diagnosticá cada falla y decime cuáles son tests rotos y cuáles
son bugs de la app. Reparás sólo los tests rotos; los bugs los reportás y el
test se queda rojo.
```

**Sobre un solo spec:**
```
/self-heal-tests tests/e2e/checkout.spec.ts está fallando desde el último merge.
```

---

## 5 · Auditar antes de commitear

```
/enforce-standards

Revisá los tests que toqué contra TESTING_STANDARDS.md. Corregí lo mecánico y
listame lo que necesita decisión mía.
```

**Sobre una suite heredada:**
```
/enforce-standards sobre tests/e2e/ entero. Es una suite vieja que nunca siguió
el estándar — quiero saber el tamaño del problema antes de arreglarlo.
```

---

## 6 · Revisar tests antes del PR

```
Usá el reviewer-agent sobre <tests/e2e/checkout.spec.ts | los tests de este PR>.

Quiero saber sobre todo: ¿estos tests PUEDEN fallar? ¿Qué escenarios de riesgo
quedaron sin cubrir?
```

---

## 7 · Cazar tests flaky

```
/regression-suite

Corré la suite con --repeat-each=5 y decime qué tests no pasan 5 de 5.
Para cada uno quiero la causa, no un parche. Nada de subir retries.
```

---

## 8 · Mantenimiento semanal de la suite

```
/regression-suite

Inventario completo: tiempos por nivel, flaky, fixme viejos, tests duplicados
u obsoletos, y huecos de cobertura ordenados por riesgo (no por porcentaje).
Proponé qué borrar; no borres nada.
```

---

## 9 · Cubrir un bug que se escapó a producción

```
Se nos escapó este bug a producción: <descripción>.

Reproducilo con el MCP de Playwright, confirmá que pasa, y escribí el test de
regresión que lo hubiera atajado. Que falle contra el código actual: quiero
verlo rojo antes de que lo arreglemos.
```

Un test de regresión que nace verde no prueba que atajaba el bug.

---

## 10 · Sumar a alguien al equipo

```
/team-onboarding

Soy nuevo en el proyecto y nunca usé Playwright. Dejame el entorno andando y
explicame el flujo de trabajo con un ejemplo real del proyecto.
```

---

## 11 · Instalar el kit en otro repo

```
Instalá el kit de testing agentic en <ruta-al-repo>:

  bash ~/dev/agentic-testing/setup-testing.sh <ruta-al-repo>

Después revisá los pendientes que reporte el instalador y corré el smoke.
```

---

## 12 · Explorar varios flujos en paralelo

```
Explorá en paralelo <checkout>, <facturas> y <clientes> con tres explorer-agent,
uno por flujo. Cuando terminen, resumime los hallazgos de los tres juntos,
ordenados por severidad.
```

⚠️ Sólo entre flujos que **no comparten datos**. Si dos escriben en la misma
entidad, se pisan: van en serie.

---

## Cómo pedir bien

| En vez de | Pedí |
|---|---|
| "Escribí tests para el login" | "Explorá el login y generá tests. Me importa sobre todo qué pasa con credenciales inválidas y sesión vencida." |
| "Arreglá los tests" | "Diagnosticá por qué fallan y decime cuáles son bugs de la app antes de tocar nada." |
| "Mejorá la cobertura" | "¿Qué flujos que mueven plata no tienen ningún test?" |
| "Hacé que pase" | (nunca) — es exactamente lo que el sistema tiene prohibido hacer |

**El último es en serio.** Pedir "hacé que pase" empuja al agente contra su
propio contrato. Lo correcto es "decime por qué no pasa".

---

## Frases que activan el comportamiento correcto

Agregalas a cualquier prompt:

- *"Explorá primero, no escribas tests sobre supuestos."*
- *"Verificá que cada test falla si rompo la funcionalidad."*
- *"Si es un bug de la app, no toques el test: reportalo."*
- *"Corré con --repeat-each=3 antes de darlo por bueno."*
- *"Decime qué NO cubriste y por qué."*
- *"No commitees, dejámelo para revisar."*
