# BACKEND_PROMPTS.md — Prompts del día a día

Copiar, pegar, cambiar lo que está `<entre ángulos>`. Están ordenados por
frecuencia de uso real.

> **Si sólo te acordás de uno:** el #1. Arranca el ciclo completo y las skills
> se encadenan solas.

---

## 1 · Probar una API de punta a punta

```
/backend-rigorous-tester probá la API de <facturas / clientes / pagos>.

Mapeá los endpoints primero, planificá las nueve dimensiones, escribí los tests,
corrélos y decime qué encontraste. Antes de darlos por buenos, rompé el servicio
a propósito y confirmá que se ponen rojos.
```

Es el prompt principal. Hace todo el ciclo y termina con un reporte y la matriz
de cobertura.

**Variante con foco:**
```
/backend-rigorous-tester probá la API de pagos, poniendo el foco en qué pasa
cuando dos pagos del mismo cliente llegan al mismo tiempo.
```

---

## 2 · Ataque de seguridad completo a autenticación

```
/security-penetration-tester hacé un ataque completo a los endpoints de
autenticación y autorización de <recurso>.

Recorré el catálogo entero: IDOR con ids adyacentes, tokens vencidos y con
alg:none, escalada de privilegios, mass assignment. Cada prueba con su control
positivo. Si encontrás algo crítico, avisame antes de seguir.

Ambiente: <url de pruebas>. Nada de DoS: acotá los bucles.
```

---

## 3 · Todos los casos negativos de un endpoint

```
/negative-edge-case-generator generá todos los casos negativos y de borde de
<POST /api/facturas>.

Derivalos del contrato y del modelo de datos, no de la imaginación. Un caso por
test, con el valor en el nombre. Cada uno tiene que afirmar el código exacto, el
error por código, y que no dejó rastro en la base.

Decime también qué preguntas te quedaron sin responder porque el contrato no las
define.
```

---

## 4 · Validar el contrato OpenAPI

```
/api-contract-validator validá el contrato contra la API real y generá los tests
de cumplimiento.

Quiero saber sobre todo: ¿qué campos devuelve la API que nadie declaró? ¿Alguno
es interno? Y qué códigos de respuesta son alcanzables y no están documentados.

No toques el contrato para que pase: si difieren, decime cuál de los dos cambió.
```

**Si no hay contrato:**
```
/api-contract-validator no tenemos OpenAPI. Generá un borrador desde la API real
con lo que puedas observar, y marcá explícitamente lo que no pudiste confirmar.
No lo commitees.
```

---

## 5 · Integridad de datos y transacciones

```
/data-integrity-guardian probá la integridad de <facturas>.

Me importa sobre todo: si falla el último paso de la operación, ¿queda basura de
los anteriores? ¿Se puede anular dos veces? ¿El saldo cuadra contra el detalle?

Verificá todo contra la base, no contra la respuesta.
```

---

## 6 · Condiciones de carrera

```
/data-integrity-guardian probá concurrencia en <POST /api/pagos>.

Doble submit simultáneo, 10 pagos en paralelo del mismo cliente, y dos
actualizaciones del mismo recurso a la vez. Con requests de verdad simultáneos,
no secuenciales.

Lo que quiero saber: ¿el saldo final es el correcto?
```

---

## 7 · Reparar la suite en rojo

```
/backend-self-heal

Corré la suite, diagnosticá cada falla y decime cuáles son tests rotos, cuáles
son bugs del servicio y cuáles son problemas de ambiente. Reparás sólo los
primeros; los bugs los reportás y el test se queda rojo.

Empezá descartando el ambiente.
```

**Sobre un archivo:**
```
/backend-self-heal tests/api/facturas.test.ts está fallando desde el último merge.
```

---

## 8 · Auditar antes de commitear

```
/backend-standards-enforcer

Revisá los tests que toqué contra BACKEND_TESTING_STANDARDS.md. Corregí lo
mecánico y listame lo que necesita decisión mía.

Me importa especialmente: ¿hay tests que escriben datos sin verificar en la
base? ¿Hay tests de seguridad sin control positivo?
```

**Sobre una suite heredada:**
```
/backend-standards-enforcer sobre tests/api/ entero. Es una suite vieja que
nunca siguió el estándar — quiero saber el tamaño del problema antes de
arreglarlo, priorizado, no una lista de 300 hallazgos.
```

---

## 9 · ¿Estos tests pueden fallar?

```
Usá el coverage-critic-agent sobre tests/api/.

Quiero saber sobre todo dos cosas:
  1. ¿Qué tests pasan aunque el servicio esté roto? Comprobalo rompiéndolo:
     sacá un filtro de autorización, sacá una validación, quitá el commit.
     Revertí todo cuando termines.
  2. ¿Qué endpoints que mueven plata o datos personales no tienen tests de
     autorización?
```

Es el prompt que más deuda oculta destapa.

---

## 10 · Cubrir un bug que se escapó a producción

```
Se nos escapó este bug a producción: <descripción>.

Reproducilo contra el ambiente de pruebas, confirmá que pasa, y escribí el test
de regresión que lo hubiera atajado. Que falle contra el código actual: quiero
verlo rojo antes de que lo arreglemos.

Si el bug fue de datos, el test tiene que verificar contra la base, no contra la
respuesta.
```

Un test de regresión que nace verde no prueba que atajaba el bug.

---

## 11 · Sumar a alguien al equipo

```
/backend-onboarding

Soy nuevo en el proyecto y nunca escribí tests de API. Dejame el entorno andando
y explicame el flujo de trabajo con un ejemplo real de este servicio.
```

---

## 12 · Instalar el kit en otro repo

```
Instalá el kit de testing de backend en <ruta-al-repo>:

  bash ~/dev/agentic-testing/setup-backend-testing.sh <ruta-al-repo>

Después revisá los pendientes que reporte el instalador y corré el smoke.
```

---

## 13 · Mapear varios recursos en paralelo

```
Mapeá en paralelo <clientes>, <facturas> y <pagos> con tres api-explorer-agent,
uno por recurso. Cuando terminen, resumime los hallazgos de los tres juntos,
ordenados por severidad.
```

⚠️ Sólo entre recursos que **no comparten datos**. Si dos escriben la misma
entidad —o tocan saldos— van en serie. Y nunca en paralelo con pruebas de
concurrencia: ésas necesitan que el único ruido sea el suyo.

---

## Cómo pedir bien

| En vez de | Pedí |
|---|---|
| "Escribí tests para la API de facturas" | "Mapeá la API de facturas y cubrí las nueve dimensiones. Me importa sobre todo que un usuario no pueda ver las facturas de otro." |
| "Arreglá los tests" | "Diagnosticá por qué fallan y decime cuáles son bugs del servicio y cuáles son del ambiente, antes de tocar nada." |
| "Mejorá la cobertura" | "¿Qué endpoints que mueven plata no tienen tests de autorización?" |
| "Probá la seguridad" | "Recorré el catálogo entero sobre estos 4 endpoints, cada prueba con su control positivo." |
| "Que pasen los tests de contrato" | "¿Por qué fallan? ¿Cambió la API o quedó viejo el contrato?" |
| "Hacé que pase" | (nunca) — es exactamente lo que el sistema tiene prohibido hacer |

**El último es en serio.** Pedir "hacé que pase" empuja al agente contra su
propio contrato. Lo correcto es **"decime por qué no pasa"**.

---

## Frases que activan el comportamiento correcto

Agregalas a cualquier prompt:

- *"Mapeá primero, no escribas tests sobre supuestos."*
- *"Verificá contra la base, no contra la respuesta."*
- *"Cada test de rechazo con su control positivo."*
- *"El código exacto, no `toBeLessThan(500)`."*
- *"Rompé el servicio a propósito y confirmá que se pone rojo."*
- *"Si es un bug del servicio, no toques el test: reportalo."*
- *"Corré 3 veces en orden aleatorio antes de darlo por bueno."*
- *"Decime qué dimensiones NO cubriste y por qué."*
- *"No commitees, dejámelo para revisar."*
