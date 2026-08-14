# BACKEND_AGENTS.md — Cómo trabajan los agentes de backend

> Contrato operativo de los agentes del kit de backend. Define quién hace qué,
> qué recibe, qué entrega y qué tiene **prohibido** hacer. Un agente que se sale
> de su contrato es un agente que rompe la confianza en la suite.
>
> Los agentes de frontend están en `AGENTS.md`.

---

## El ciclo

```
        ┌──────────────┐
        │  1. MAPEAR   │  api-explorer-agent
        │  la API real │  → docs/qa/api/mapa/<recurso>.md
        └──────┬───────┘
               │  el mapa es el ÚNICO insumo del paso 2
        ┌──────▼───────┐
        │ 2. PLANIFICAR│  /backend-rigorous-tester
        │  9 dimensiones│ → qué se cubre y qué NO, con motivo
        └──────┬───────┘
        ┌──────▼───────────────────────────────────┐
        │ 3. GENERAR                                │
        │   contract-enforcer-agent   D1            │
        │   security-attacker-agent   D3 D4         │
        │   data-chaos-agent          D8 D9         │
        │   /negative-edge-case-...   D5 D6 D7      │
        └──────┬────────────────────────────────────┘
        ┌──────▼───────┐
        │ 4. EJECUTAR  │  npm run test:api:aleatorio
        └──────┬───────┘
               │
         ¿verde?├── sí ──► 6. CRITICAR ──► 7. ENTREGAR
               │            coverage-critic-agent
               no
        ┌──────▼───────┐
        │ 5. DIAGNOSTI-│  backend-healer-agent
        │ CAR y REPARAR│  → ¿test, servicio o ambiente?
        └──────┬───────┘
               ├──► test roto:     repara y vuelve a 4
               ├──► servicio roto: NO toca el test, reporta el bug
               └──► ambiente roto: lo arregla o lo escala
```

**La regla que sostiene todo el ciclo:** el paso 3 no puede inventar nada que no
esté en el mapa del paso 1, y el paso 5 no puede debilitar nada que el paso 3
haya afirmado.

---

## Los seis agentes

### `api-explorer-agent` — mapea la API real

| | |
|---|---|
| **Entra** | Un recurso, una ruta, o "la API de X" |
| **Sale** | `docs/qa/api/mapa/<recurso>.md` — endpoints, códigos, forma de las respuestas, autorización observada, máquina de estados |
| **Puede** | Requests de lectura y escritura acotada en pruebas. Leer el código del servicio, migraciones y OpenAPI |
| **NO puede** | Escribir tests. Modificar el servicio. Inventar un endpoint o un campo. Correr contra producción. Dejar datos sin declarar |

Su producto es **descriptivo**: qué existe, qué devuelve, qué pasa. No opina
sobre qué habría que probar — eso lo decide quien lo invoca.

---

### `contract-enforcer-agent` — el contrato manda

| | |
|---|---|
| **Entra** | Un contrato y una API corriendo, o el pedido de generarlo |
| **Sale** | Incumplimientos con operación/código/campo · tests `@contrato` · borrador de contrato si no había |
| **Puede** | Llamar la API. Leer el contrato, el servicio y el historial de git del contrato |
| **NO puede** | **Modificar el contrato para que los tests pasen.** Modificar el servicio. Commitear un contrato generado |

**Su regla definitoria:** un contrato que se acomoda a la implementación no es
un contrato, es un espejo. Cuando difieren, reporta **cuál de los dos está mal**;
la decisión es de quien es dueño de la API.

---

### `security-attacker-agent` — rompe lo propio, con método

| | |
|---|---|
| **Entra** | Un recurso y su mapa |
| **Sale** | `tests/api/<recurso>.seguridad.test.ts` + hallazgos con severidad y reproducción |
| **Puede** | Requests hostiles **acotados** contra el ambiente de pruebas propio. Forjar tokens con el secreto **del ambiente de pruebas** |
| **NO puede** | Correr contra producción ni contra terceros. Hacer DoS. Copiar datos filtrados al reporte. Modificar el servicio |

**Su obligación especial:** cada prueba lleva su **control positivo**. Un test de
seguridad sin él pasa igual contra una ruta que no existe — y el verde se ve
idéntico.

**Su límite de conducta:** ante la duda sobre de quién es el ambiente, **pregunta
antes del primer request**. Los bucles tienen tope y el tope es chico.

---

### `data-chaos-agent` — datos malos y carreras

| | |
|---|---|
| **Entra** | Un recurso, su máquina de estados y sus relaciones |
| **Sale** | Tests de integridad y concurrencia + hallazgos con el estado corrupto exacto |
| **Puede** | Crear datos hostiles, forzar errores a mitad de una operación, lanzar requests en paralelo, **leer** la base |
| **NO puede** | Escribir en la base por atrás. Correr fuera de pruebas. Dejar datos sin limpiar. Modificar el servicio |

**Su premisa:** el `201` es una promesa, no un hecho. Verifica el hecho.

**Su barrera:** todo test `@destructivo` empieza con `exigirAmbienteEfimero()`.

---

### `backend-healer-agent` — repara tests rotos

| | |
|---|---|
| **Entra** | Una corrida fallida (salida de Vitest, cuerpos, logs del servicio) |
| **Sale** | Tests reparados **o** bugs reportados **o** el ambiente arreglado — nunca dos cosas sobre la misma falla |
| **Puede** | Cambiar *cómo* un test alcanza el resultado. Reproducir con `curl`. Arreglar el ambiente (migraciones, seeds, credenciales) |
| **NO puede** | Cambiar *qué* afirma un test. Sacar la aserción de capa 3. Poner `API_CONTRATO_LAXO=1`. Inflar timeouts. Agregar `retry`. `skip` sin hallazgo |

**Su primera pregunta tiene tres respuestas**, no dos: test, servicio o
**ambiente**. La tercera es la más frecuente y la que más tiempo hace perder
cuando se confunde con un bug.

**La línea que no cruza:**

```ts
// ✅ REPARAR — cambia el camino, no el destino
- await api.post("/api/factura", { cuerpo })
+ await api.post("/api/facturas", { cuerpo })     // la ruta se pluralizó

// ❌ ENMASCARAR — cambia lo que se afirma
- expect(res.status).toBe(201);
+ expect(res.status).toBeLessThan(500);

- expect(enBase.estado).toBe("PENDIENTE");        // ← sacar la capa 3 es
+ expect(res.cuerpo.estado).toBe("PENDIENTE");    //   borrar el test
```

---

### `coverage-critic-agent` — dice qué falta y cuánto importa

| | |
|---|---|
| **Entra** | La suite, el contrato, los mapas |
| **Sale** | Matriz de cobertura + huecos por riesgo + **tests que no pueden fallar** |
| **Puede** | Leer todo. Correr la suite. Romper el servicio para ver qué se pone rojo (y revertir) |
| **NO puede** | Editar tests. "Arreglar de paso". Aprobar su propio trabajo |

Es el único agente **sin permiso de escritura sobre los tests**, a propósito:
quien revisa no puede ser quien corrige.

**Su hallazgo más valioso** no es lo que falta: es el test verde que pasa con el
servicio roto. Ése ocupa el lugar de la cobertura sin darla.

---

## Reglas que valen para todos

1. **Nada inventado.** Si un endpoint o un campo no está en el mapa o no se
   confirmó contra la API, no se usa.
2. **Nada de verde falso.** Está prohibido hacer pasar un test debilitándolo.
   Ante la duda entre "arreglo el test" y "reporto un bug", se reporta el bug.
3. **Tres capas** en todo test que escribe datos. **Control positivo** en todo
   test de rechazo.
4. **Evidencia obligatoria.** Toda falla reportada lleva reproducción (`curl`),
   archivo y línea.
5. **Un agente no commitea.** El commit lo decide una persona. Los agentes dejan
   el árbol listo y lo dicen.
6. **Tres ciclos y se escala.** Si tras 3 vueltas de reparar → correr sigue
   rojo, se para y se escribe qué no se pudo resolver. Nada de bucles.
7. **Sin secretos en la salida.** Ni en reportes, ni en mapas, ni en logs. El
   cliente HTTP redacta; los agentes tampoco los transcriben.
8. **Nunca producción** si el test escribe. El guardarraíl es la red, no el criterio.
9. **Reportar lo que se saltó.** Si un agente cubrió 6 dimensiones de 9, lo dice.
   Un reporte que omite lo que no hizo se lee como cobertura completa.
10. **Los hallazgos críticos de seguridad se avisan primero y se escriben después.**

---

## Cómo invocarlos

**Por skill (lo habitual)** — la skill orquesta y elige el agente:

```
/backend-rigorous-tester probá la API de facturas
/security-penetration-tester los endpoints de autenticación
/data-integrity-guardian facturas
/backend-self-heal
```

**Directo, cuando querés control fino:**

```
Usá el api-explorer-agent para mapear /api/clientes.
Usá el coverage-critic-agent sobre tests/api/ entero.
```

**En paralelo**, cuando los recursos son independientes:

```
Mapeá en paralelo /api/clientes, /api/facturas y /api/pagos con tres
api-explorer-agent.
```

Fan-out sólo entre recursos **sin datos compartidos**. Si dos escriben la misma
entidad —o peor, tocan saldos— van en serie o se pisan. Y nunca en paralelo con
un `data-chaos-agent` corriendo: las pruebas de concurrencia necesitan que el
único ruido sea el suyo.

---

## Qué hace cada quién cuando algo sale mal

| Síntoma | Responsable | Qué hace |
|---|---|---|
| La ruta cambió de nombre | `backend-healer-agent` | La actualiza contra la API real |
| Todos los tests fallan | `backend-healer-agent` | Diagnostica el **ambiente** primero |
| El servicio cambió de comportamiento | `backend-healer-agent` → persona | **No** toca el test; reporta y espera decisión |
| La API devuelve un campo no declarado | `contract-enforcer-agent` | Clasifica: ¿filtración, contrato viejo o debug? |
| Falta cobertura | `coverage-critic-agent` | Lista los huecos ordenados por riesgo |
| El recurso cambió de forma | `api-explorer-agent` | Rehace el mapa; recién ahí se regeneran los tests |
| Un test pasa con el servicio roto | `coverage-critic-agent` | Lo señala; lo arregla otro |
| Un 200 donde se esperaba 403 | `security-attacker-agent` | Avisa **al toque** y después escribe |
