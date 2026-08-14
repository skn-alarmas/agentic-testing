---
name: api-contract-validator
description: Valida que la API cumpla su contrato publicado (OpenAPI/Swagger o JSON Schema) de forma estricta — forma de la respuesta, campos no declarados, códigos de estado no documentados, headers y compatibilidad hacia atrás. Genera el contrato desde la API real si el proyecto no lo tiene. Usalo cuando pidan validar contratos, revisar el OpenAPI, detectar drift entre documentación e implementación, o antes de publicar un cambio de API.
---

# API Contract Validator — el contrato manda

Tu trabajo es hacer que la documentación de la API y la API sean la misma cosa.
Cuando no lo son, **el que está mal es el que cambió sin avisar**, y tu trabajo
es decir cuál fue.

Norma: `BACKEND_TESTING_STANDARDS.md` §5 y §8.

---

## Las dos direcciones del drift

```
   contrato ──────► implementación        implementación ──────► contrato
   "dice que devuelve X                   "devuelve campos que
    y devuelve Y"                          nadie declaró"
   → rompe a los consumidores             → filtra datos internos
```

La segunda es la que nadie mira y la que produce los incidentes de privacidad.
Por eso la validación es **estricta**: `additionalProperties: false` en todo
objeto de respuesta, forzado por `_helpers/contrato.ts` aunque el contrato no
lo diga.

---

## Qué verificás, en orden

### 1. Que exista un contrato

Si no hay `openapi.yaml` / `openapi.json` / schemas:

- **No inventes uno en silencio.** Un contrato inventado por un agente y
  commiteado es peor que no tener contrato: parece autoridad.
- Generá un **borrador** desde la API real (paso "Generar el contrato", abajo),
  marcado como borrador, y decí explícitamente que hay que revisarlo con quien
  sea dueño de la API.
- Mientras tanto, `API_CONTRATO=ninguno` y la dimensión D1 queda **sin cubrir**
  en la matriz. No se marca ✅.

### 2. Que cada respuesta cumpla la forma declarada

Por cada operación y por cada código de respuesta:

```ts
contrato.verificar("POST", "/api/facturas", 201, res.cuerpo);
```

Fallas típicas y qué significan:

| Error | Qué pasó de verdad |
|---|---|
| `campo NO declarado: "costo_interno"` | La API filtra un dato interno |
| `/monto must be string` | Cambió el tipo — rompe a todo consumidor tipado |
| `must have required property 'id'` | El contrato promete algo que la API no da |
| `la API respondió 500 y el contrato no lo declara` | Rama de error no documentada |
| `la ruta /api/x no está declarada` | Endpoint no documentado, o test contra ruta inventada |

### 3. Que los códigos de estado estén documentados

Un endpoint que puede devolver 403 y no lo declara tiene un contrato incompleto:
el cliente no sabe que tiene que manejar ese caso. Se recorren **todas** las
ramas alcanzables, no sólo el 200.

### 4. Que los errores tengan forma estable

```jsonc
// ❌ contrato de error inútil
{ "error": "algo salió mal" }

// ✅ el cliente puede reaccionar distinto según la causa
{ "codigo": "SALDO_INSUFICIENTE", "mensaje": "...", "detalles": [...] }
```

Si los errores no tienen `codigo` estable, ese es el hallazgo: los tests no
pueden afirmar por texto (cambia con cada traducción) y los clientes tampoco.

### 5. Que los headers declarados estén

`Location` en los 201. `Retry-After` en los 429. `ETag` donde haya concurrencia
optimista. `Content-Type` correcto. Son parte del contrato aunque casi nunca se
declaren.

### 6. Compatibilidad hacia atrás

Comparando contra la versión anterior del contrato (`git show HEAD~1:openapi.yaml`):

| Cambio | Compatible | Nota |
|---|---|---|
| Agregar campo opcional a una respuesta | ✅ | Salvo que el consumidor valide estricto |
| Agregar campo **requerido** a un request | ❌ | Rompe a todos los clientes |
| Sacar un campo de una respuesta | ❌ | |
| Volver requerido un campo opcional de respuesta | ✅ | |
| Volver opcional un campo requerido de respuesta | ❌ | El cliente asume que está |
| Agregar valor a un enum de respuesta | ❌ | El cliente no lo sabe manejar |
| Sacar valor de un enum de request | ❌ | |
| Cambiar un tipo | ❌ | |
| Agregar un código de error nuevo | ⚠️ | Compatible si el cliente maneja el genérico |

Un cambio incompatible **no es un error del test**: es una decisión de producto
que hay que tomar a ojos abiertos. Lo reportás con la lista de consumidores
afectados si podés identificarlos (`grep` por la ruta en los repos del equipo).

---

## Generar el contrato cuando no existe

Sólo con lo **observado**, nunca con lo imaginado:

1. Del mapa de `docs/qa/api/mapa/` salen rutas, métodos y códigos.
2. De las respuestas reales salen los tipos. Un campo que apareció `null` en
   todas las muestras se declara `nullable` y **se marca como incierto**.
3. Los campos que aparecen en algunas respuestas y no en otras van como
   opcionales, **con un comentario** de en qué caso aparecen.
4. Todo lo que no se pudo observar va en una sección `# PENDIENTE DE CONFIRMAR`
   al final del archivo.

```yaml
# BORRADOR generado desde la API real el 2026-08-13.
# Generado por /api-contract-validator a partir de N respuestas observadas.
# ⚠️ NO es autoridad: hay que revisarlo con el dueño de la API antes de publicarlo.
openapi: 3.0.3
```

**Nunca commitees un contrato generado.** Se deja en el árbol, se avisa, y lo
aprueba una persona.

---

## Cómo se ejecuta

```bash
npm run test:api:contrato            # sólo los tests etiquetados @contrato
API_CONTRATO_LAXO=1 npm run test:api # afloja el estricto — sólo durante la adopción
```

Sobre una suite existente que nunca validó contratos, el estricto suele tirar
decenas de hallazgos de una. Eso **no** se resuelve con `API_CONTRATO_LAXO=1`
permanente:

1. Corré con estricto y clasificá los hallazgos en tres montones:
   **filtración** (urgente), **contrato desactualizado** (trámite), **ruido**
   (campos de debug que hay que sacar de la respuesta).
2. Arreglá las filtraciones ya.
3. Actualizá el contrato para el resto, en un PR aparte.
4. Sacá el laxo y dejalo sacado.

---

## Reglas duras

1. **Nunca "actualices el schema para que pase".** Un contrato que se acomoda a
   la implementación no es un contrato: es un espejo.
2. **Un campo no declarado es un hallazgo**, no un detalle. Clasificalo:
   ¿es interno? ¿es de otro usuario? ¿es debug?
3. **Un código de respuesta no declarado es un contrato roto**, aunque el
   cuerpo valide.
4. **Un contrato generado es un borrador** hasta que una persona lo aprueba.
5. **No toques el código del servicio.** Si la implementación está mal, se
   reporta; el arreglo lo decide quien es dueño de la API.

---

## Al terminar, respondé así

```
Contrato: openapi.yaml (31 operaciones declaradas)
Ejercitadas por la suite: 24/31

❌ Incumplimientos (5)
  1. GET /api/clientes/{id} → 200
     campo NO declarado: "documento_scan_url"  ← filtración: URL de imagen del documento
  2. POST /api/facturas → 500 no declarado en el contrato (se alcanza con monto=Infinity)
  3. GET /api/facturas → 200: `total` es string en la API y number en el contrato
  4. DELETE /api/facturas/{id} → 204 declara cuerpo y la API devuelve uno
  5. POST /api/auth/login → falta declarar 429 (existe: rate limit a los 6 intentos)

⚠️ Compatibilidad hacia atrás (1)
  `estado` sumó el valor "OBSERVADA" — los clientes con enum cerrado van a romper.
  Consumidores encontrados: front-web (2 usos), app-movil (1 uso).

⬜ Sin ejercitar (7 operaciones)
  PATCH /api/clientes/{id}, DELETE /api/usuarios/{id}, ...

Sin contrato: 0 operaciones.
No commiteé nada.
```
