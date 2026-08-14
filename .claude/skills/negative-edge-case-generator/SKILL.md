---
name: negative-edge-case-generator
description: Genera de forma sistemática y masiva los casos negativos y de borde de un endpoint — tipos equivocados, valores límite, unicode hostil, cuerpos malformados, paginación abusiva, ids inexistentes, campos faltantes y sobrantes. Deriva los casos del contrato y del modelo de datos, no de la imaginación. Usalo cuando pidan casos negativos, casos de borde, edge cases, o cobertura de validaciones de un endpoint.
---

# Negative & Edge Case Generator — sistemático, no creativo

El happy path lo prueba el desarrollador solo, sin que se lo pidan. Lo que
llega roto a producción es el otro 90 %, y ese 90 % no se cubre teniendo buenas
ideas un martes a las seis de la tarde: se cubre **recorriendo un método**.

Norma: `BACKEND_TESTING_STANDARDS.md` §9 y §10. Dimensiones **D5**, **D6**, **D7**.

---

## De dónde salen los casos

**Nunca de la imaginación.** En este orden:

1. **Del contrato** — cada campo declarado tiene tipo, formato, requerido/opcional,
   `enum`, `minLength`, `maximum`, `pattern`. Cada restricción es al menos dos
   casos: justo adentro y justo afuera.
2. **Del modelo de datos** — largos de columna, `NOT NULL`, `UNIQUE`, FKs,
   `CHECK`. Una columna `varchar(50)` genera el caso de 50 y el de 51.
3. **Del mapa de exploración** — los códigos de error que la API ya devolvió.
4. **Del corpus** (`_helpers/payloads.ts`) — lo que aplica a los tipos que
   maneja el endpoint.

Si el contrato no existe, los casos que "inventás" son en realidad **preguntas
sin responder**: se listan como tales y se preguntan, no se convierten en
aserciones.

---

## La matriz por tipo de campo

Para cada campo del request, se genera lo que corresponda a su tipo:

### Todo campo
ausente · `null` · `undefined` · vacío (`""`, `[]`, `{}`) · tipo equivocado
(los 12 de `TIPOS_EQUIVOCADOS`) · duplicado en el JSON · con espacios alrededor

### `string`
`""` · sólo espacios · en el límite (`maxLength`) · límite + 1 · 100 000 chars ·
unicode (`TEXTO.unicode`) · emoji compuesto · zero-width · homoglifos ·
byte nulo · RTL · el corpus de `INYECCION` · **y texto legítimo que parece
ataque** (`O'Brien & Cía.`)

### `number`
`0` · negativo · decimales donde se espera entero · `maxInt32` y `+1` ·
`MAX_SAFE_INTEGER` y `+2` · notación científica (`1e309` → `Infinity`) ·
string numérico (`"100"`) · `NaN` · precisión de centavos (`0.005`)

### `boolean`
`"true"` (string) · `1` · `0` · `"si"` · `null`

### fecha
`FECHAS` completo: día que no existe, mes inválido, año 0000 y 9999, hora 25,
formato local donde se espera ISO, string vacío · **y el rango**: fin anterior
al inicio, mismo instante, cruce de horario de verano

### `enum`
Cada valor válido (control positivo) · uno inválido · con otra capitalización ·
uno que fue válido y se removió · vacío

### id / FK
`IDS_HOSTILES` · id de **otro tenant** (esto además es D4) · id borrado
lógicamente · id en otro formato (UUID donde se espera entero)

### colección
vacía · un elemento · en el límite · límite + 1 · con un elemento inválido en
el medio · con duplicados · anidamiento profundo

### paginación
`PAGINACION_HOSTIL` completo · página más allá del final (debe dar lista vacía,
no 404) · `limit` en el límite documentado

---

## Los casos que no son de un campo

Se olvidan siempre y encuentran mucho:

| Caso | Esperado |
|---|---|
| Cuerpo vacío en un `POST` | 400 |
| Cuerpo malformado (`CUERPOS_MALFORMADOS`) | 400, **nunca 500** |
| `Content-Type: text/plain` con JSON adentro | 415 |
| Sin `Content-Type` | 400 o 415 |
| Campos **de más** no declarados | Ignorados o 400 — nunca aplicados (§6 S6) |
| Método no soportado en la ruta | 405, nunca 404 ni 500 |
| Ruta con barra final (`/api/facturas/`) | Consistente con la sin barra |
| Mayúsculas en la ruta | 404, no 500 |
| Query param repetido (`?id=1&id=2`) | Definido y consistente |
| Header `Accept: application/xml` | 406 o JSON igual — pero decidido |
| Petición con `Content-Length` enorme | 413 |

---

## Cómo se escriben

**Un caso por test, con nombre propio.** Un test con quince `expect` que falla
te dice "validación"; quince tests te dicen **cuál valor**.

```ts
const MONTOS_INVALIDOS: Array<[string, unknown]> = [
  ["negativo", NUMEROS.negativo],
  ["cero", NUMEROS.cero],
  ["texto", "mil"],
  ["overflow", NUMEROS.maxSafeMas2],
];

for (const [etiqueta, valor] of MONTOS_INVALIDOS) {
  test(`monto ${etiqueta} → 422 y no crea nada`, async ({ api, db }) => {
    const antes = await db.contar("facturas");
    const res = await api.como("operador").post("/api/facturas", { cuerpo: { monto: valor } });

    expect(res.status).toBe(422);              // el código EXACTO
    expect(res.cuerpo.codigo).toBe("VALIDACION"); // el error por CÓDIGO, no por texto
    expect(await db.contar("facturas")).toBe(antes); // el rechazo no dejó rastro
  });
}
```

**Las tres aserciones de todo caso negativo:**

1. **El código exacto.** `not.toBe(200)` no es una aserción: un 500 lo cumple, y
   un 500 por input inválido es un bug (§8).
2. **El error por código**, no por el texto del mensaje: el texto cambia con
   cada traducción y con cada revisión de UX.
3. **Que no dejó rastro.** El 422 que igual insertó la fila es el bug que nadie
   encuentra hasta que aparece en un reporte contable.

---

## Cuánto es suficiente

La tentación es generar 400 casos. No sirve: nadie los mantiene y la suite
tarda diez minutos.

**El criterio: un caso por clase de equivalencia, más los dos bordes.**

```
monto: number, minimum 1, maximum 999999999, 2 decimales

Clases:   negativo · cero · válido · sobre el máximo · no numérico · null · ausente
Bordes:   1 (mínimo válido) · 0.99 (justo abajo) · 999999999 · 1000000000
Corpus:   overflow, infinito, notación científica

→ 13 casos. No 400, y no 3.
```

Si un endpoint tiene 20 campos, no son 20 × 13: los campos independientes se
prueban de a uno con el resto válido, y **una sola vez** se prueba la
combinación "todos los requeridos ausentes".

---

## Reglas duras

1. **Los casos salen del contrato y del modelo**, no de la imaginación.
2. **Un caso por test**, con el valor en el nombre.
3. **Código exacto, error por código, y sin rastro.** Las tres, siempre.
4. **Un 500 ante input inválido es un hallazgo**, no un caso cubierto.
5. **El texto legítimo que parece ataque también se prueba.** Que `O'Brien` se
   guarde bien es tan importante como que `' OR 1=1` no rompa nada.
6. **No infles la suite.** Clases de equivalencia + bordes. Si agregás un caso,
   tenés que poder decir qué clase cubre que ningún otro cubre.

---

## Al terminar, respondé así

```
Endpoint: POST /api/facturas · 4 campos · contrato: openapi.yaml

Generados: 47 casos
  clienteId  9   (ausente, null, 0, -1, inexistente, de otro tenant, string, UUID, texto)
  monto     13   (clases + bordes 1 / 0.99 / 999999999 / 1000000000 + overflow)
  concepto  11   (vacío, límite 255, 256, unicode, apóstrofo legítimo, inyección×5)
  fecha      8   (FECHAS completo)
  cuerpo     6   (malformados, sin Content-Type, campos de más, método 405)

Resultado: 41 ✅ · 6 🐛

🐛 Hallazgos
  #1 alta   monto=1e309 → 500 (TypeError: Cannot convert Infinity to BigInt)
            Un input inválido nunca puede dar 500. Falta validar el rango.
  #2 alta   clienteId de otro tenant → 201. Se factura a un cliente ajeno.
            (esto además es S1 de seguridad — lo escalo en el reporte de seguridad)
  #3 media  concepto de 256 chars → 500 por el largo de la columna, esperado 422
  #4 media  cuerpo `{` → 500, esperado 400
  #5 baja   fecha "13/08/2026" se acepta y se guarda como 2026-01-13
  #6 baja   ?limit=999999 devuelve todo: sin tope de paginación

Preguntas sin responder (el contrato no las define)
  · ¿`concepto` acepta saltos de línea? Hoy sí, y rompe el PDF.
  · ¿`monto` en Gs admite decimales? Hoy sí. ¿Es correcto?

tests/api/facturas.test.ts (+47). No commiteé.
```
