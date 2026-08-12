---
name: regression-suite
description: Mantiene la suite de regresión sana — corre la suite completa, detecta y caza tests flaky, mide tiempos, encuentra huecos de cobertura y tests obsoletos o duplicados, y clasifica cada test en @smoke/@critico/@regresion. Usalo para el mantenimiento periódico de la suite, antes de un release, o cuando la suite esté lenta o poco confiable.
---

# Regression Suite — mantener la suite sana

Una suite de regresión se pudre sola: se llena de tests duplicados, se pone
lenta, acumula flakiness y deja de cubrir lo que el producto hace hoy. Tu
trabajo es que eso no pase.

**El indicador de salud es uno solo:** cuando la suite se pone roja, ¿el equipo
va a mirar, o va a volver a correrla?

---

## Proceso

### 1. Inventario

```bash
echo "Specs: $(ls tests/e2e/*.spec.ts | wc -l)"
echo "Tests: $(grep -rc '  test(' tests/e2e/*.spec.ts | awk -F: '{s+=$2} END {print s}')"
echo "@smoke:     $(grep -rl '@smoke' tests/e2e | wc -l)"
echo "@critico:   $(grep -rl '@critico' tests/e2e | wc -l)"
echo "@regresion: $(grep -rl '@regresion' tests/e2e | wc -l)"
echo "sin etiqueta:"; grep -Ln '@smoke\|@critico\|@regresion\|@lento\|@manual' tests/e2e/*.spec.ts
echo "fixme/skip:"; grep -rn 'test\.fixme\|test\.skip' tests/e2e --include="*.ts"
```

### 2. Corrida completa con medición

```bash
npx playwright test --reporter=list,json > /tmp/suite.json 2>&1
```

Del JSON sacá: tiempo total, los 10 tests más lentos, fallados, saltados.

```bash
npx playwright test --grep @smoke   --reporter=line   # debe dar < 60 s
npx playwright test --grep @critico --reporter=line   # debe dar < 5 min
```

Si un nivel se pasa de su presupuesto, eso es un hallazgo: o hay tests mal
clasificados, o hay tests lentos que hay que optimizar.

### 3. Caza de flakiness (lo más valioso que hacés)

```bash
npx playwright test --repeat-each=5 --reporter=line 2>&1 | tee /tmp/flaky.txt
grep -c "passed\|failed" /tmp/flaky.txt
```

Todo test que no pase 5 de 5 es flaky, **aunque haya pasado la corrida normal**.

Para cada uno:
1. Aislalo: `npx playwright test <spec> -g "<título>" --repeat-each=10`
2. Diagnosticá la causa con `/self-heal-tests`
3. Si no se puede resolver hoy: `test.fixme` + hallazgo escrito

**Nunca subas retries para tapar flakiness.** Un test flaky con `retries: 3` es
un test flaky que además tarda cuatro veces más.

### 4. Huecos de cobertura

Cruzá lo que la app tiene contra lo que la suite prueba:

```bash
# rutas declaradas
grep -rn 'path:\|<Route' src/ --include="*.tsx" --include="*.ts" | grep -o '"/[^"]*"' | sort -u
# rutas visitadas por los tests
grep -rn 'goto("' tests/e2e --include="*.ts" | grep -o '"/[^"]*"' | sort -u
```

Y priorizá por **riesgo, no por cantidad de rutas**:

| Prioridad | Qué |
|---|---|
| 🔴 | Flujos que mueven plata o datos críticos, sin ningún test |
| 🔴 | Bugs que ya se escaparon a producción y no tienen test de regresión |
| 🟡 | Flujos con happy path cubierto pero sin manejo de errores |
| 🟡 | Rutas de alto tráfico sin `@smoke` |
| 🔵 | Pantallas de configuración de uso esporádico |

Una ruta sin test no es automáticamente un problema. Un flujo de facturación
sin test, sí.

### 5. Tests obsoletos y duplicados

```bash
# specs que no se tocan hace más de 6 meses
git log --format="%ad %n" --date=short --name-only -- tests/e2e/*.spec.ts \
  | grep spec.ts | sort -u
# títulos repetidos = probable duplicación
grep -rh 'test("' tests/e2e --include="*.ts" | sort | uniq -d
```

Candidatos a eliminar:
- Tests de funcionalidad que ya no existe
- Duplicados que verifican lo mismo por dos caminos
- Tests que nunca fallaron y no pueden fallar (verificá rompiendo la funcionalidad)
- `fixme` de más de 3 meses sin dueño → o se arregla o se borra; los `fixme`
  eternos son ruido que entrena al equipo a ignorar la suite

**Proponé, no borres.** Eliminar cobertura es decisión de una persona.

### 6. Clasificación

Revisá que cada test esté en el nivel correcto:

- **Promover a `@critico`**: cubre un flujo con dueño de negocio, o es la
  regresión de un bug que ya se escapó a producción
- **Bajar de `@critico`**: tarda mucho, o cubre algo secundario
- **Promover a `@smoke`**: es la puerta de entrada del sistema (login, home)
- **Marcar `@lento`**: tarda más que la mediana × 3

### 7. Reporte

```markdown
# Salud de la suite E2E — 2026-08-12

## Resumen
| Métrica | Valor | Objetivo | |
|---|---|---|---|
| Tests | 87 | — | |
| Verde | 81 | 87 | 🔴 |
| Flaky (5 corridas) | 4 | 0 | 🔴 |
| fixme / skip | 6 | ≤ 3 | 🟡 |
| Suite completa | 14 min | < 15 min | ✅ |
| @smoke | 48 s | < 60 s | ✅ |
| @critico | 6 min | < 5 min | 🟡 |
| Sin etiqueta | 9 | 0 | 🟡 |

## 🔴 Flaky detectados (4)
| Test | Pasadas | Causa | Acción |
|---|---|---|---|
| `facturas.spec.ts:88` | 3/5 | Carrera refetch vs render | `fixme` + falta `estado-carga` |
| `checkout.spec.ts:45` | 4/5 | Datos compartidos entre tests | Reparado: datos únicos |

## 🔴 Fallas reales (2)
### El estado de la orden no se actualiza tras el pago
Reproducible 5/5. Bug de la app, no del test. Evidencia: `trace.zip`.

## 🔴 Huecos de cobertura por riesgo
| Flujo | Riesgo | Por qué importa |
|---|---|---|
| Anulación de factura | 🔴 | Mueve plata, cero tests |
| Recuperar contraseña | 🟡 | Alto tráfico, sin test |

## Tests a eliminar (propuesta — no ejecutada)
| Test | Motivo |
|---|---|
| `qa-co-natural2.spec.ts` | Duplica `qa-co-natural.spec.ts` |
| `wizard-mock.spec.ts:30` | Prueba un mock, no la app |

## Reclasificación
- ⬆️ `login.spec.ts` → `@smoke`
- ⬇️ `reportes.spec.ts` → `@regresion` (tarda 3 min de los 6 de @critico)

## Plan sugerido
1. 🔴 Bug del estado de la orden (bloquea release)
2. 🔴 Cubrir anulación de factura
3. 🟡 Sacar `reportes.spec.ts` de @critico
4. 🟡 Etiquetar los 9 sin etiqueta
```

---

## Cadencia

| Cuándo | Qué |
|---|---|
| Cada PR | `@critico` |
| Cada push a main | `@smoke` + `@critico` |
| Nightly | Suite completa + `--repeat-each=3` para cazar flakiness temprano |
| Semanal | Este mantenimiento entero |
| Pre-release | Suite completa + revisión de huecos por riesgo |

---

## Reglas duras

1. **Nunca subas `retries` para bajar el rojo.** Ataca la causa.
2. **No borres tests.** Proponé, con motivo; decide una persona.
3. **Flaky es roto**, aunque a veces pase.
4. **Priorizá por riesgo, no por porcentaje de cobertura.** El % es una métrica
   que se optimiza sola hacia lo fácil.
5. **`fixme` sin dueño ni fecha es deuda invisible.** Sacala a la luz en cada corrida.
6. **Reportá lo que no corriste** (tests `@manual`, suites saltadas por falta de
   credenciales). Un reporte que no los menciona simula cobertura que no hay.
