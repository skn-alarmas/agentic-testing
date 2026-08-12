---
name: enforce-standards
description: Audita que los tests E2E cumplan el estándar del equipo — escalera de selectores, prohibición de esperas por tiempo, naming, cabeceras, aislamiento, secretos y data-testid. Devuelve hallazgos con archivo y línea, y corrige los mecánicos. Usalo antes de commitear tests, al revisar un PR con tests, o para auditar una suite heredada.
---

# Enforce Standards — auditoría del estándar

Hacés cumplir `TESTING_STANDARDS.md`. Auditás, señalás con archivo y línea, y
corregís **sólo lo mecánico**. Lo que requiere criterio lo reportás.

---

## Qué corregís vos y qué no

| Podés corregir solo | Requiere decisión humana |
|---|---|
| `waitForTimeout` → aserción web-first | Un test que no prueba nada |
| CSS/XPath → rol o `data-testid` **si el selector existe** | Falta de cobertura |
| Cabecera faltante | Reescribir un test mal concebido |
| Import sin usar, `console.log` olvidado | Borrar un spec duplicado |
| Timeout inflado sin justificación | Cambiar la lógica de la app |
| Renombrar un archivo `qa-final-fix.spec.ts` | Un `data-testid` que no existe todavía |

Regla: **si tu corrección puede cambiar lo que el test verifica, no la hagas** —
reportala.

---

## Las 12 verificaciones

### 1. Selectores prohibidos

```bash
grep -rn 'page\.\(locator\|\$\|\$\$\)("' tests/e2e --include="*.ts" \
  | grep -v 'getByTestId' | grep -v '_helpers'
grep -rn 'xpath=\|css=\|>>' tests/e2e --include="*.ts"
grep -rn 'nth(\|\.first()\|\.last()' tests/e2e --include="*.ts"
```
🔴 **Bloqueante.** CSS y XPath están prohibidos. `.first()` sólo con comentario
que explique por qué la ambigüedad es legítima.

### 2. Esperas por tiempo

```bash
grep -rn 'waitForTimeout\|networkidle\|sleep(' tests/e2e --include="*.ts"
```
🔴 **Bloqueante, sin excepciones.**

### 3. Timeouts inflados

```bash
grep -rn 'timeout: *[0-9]\{5,\}\|setTimeout(\|test.setTimeout' tests/e2e --include="*.ts"
```
🟡 Cada uno necesita un comentario que justifique por qué ese flujo es
genuinamente lento. Sin comentario → hallazgo.

### 4. Condicionales sobre timing

```bash
grep -rn 'if *(await.*isVisible\|if *(await.*count()\|catch *( *) *{ *}' tests/e2e --include="*.ts"
```
🔴 Un `if` sobre visibilidad es un test que a veces no prueba nada. Un `catch`
vacío es un test que se traga su propia falla.

### 5. `.only` y `.skip` huérfanos

```bash
grep -rn '\.only(\|test\.skip(\|test\.fixme(' tests/e2e --include="*.ts"
```
🔴 `.only` nunca se commitea. Todo `skip`/`fixme` necesita un motivo escrito al lado.

### 6. Naming de archivos

```bash
ls tests/e2e/*.spec.ts | grep -E '(qa-|test-|debug-|final|fix-|nuevo|copy|v[0-9]|tmp)'
```
🟡 El nombre dice **qué prueba**, no cuándo se escribió. Proponé el renombre.

### 7. Naming de tests

```bash
grep -rn 'test(\"\|test(`' tests/e2e --include="*.ts" | head -50
```
🟡 Debe ser **acción → resultado esperado**, en español.
`test("funciona")`, `test("caso 3")`, `test("test login")` → hallazgo.

### 8. Cabecera del spec

Cada `*.spec.ts` arranca con el bloque `/** ... */` que declara flujo, ruta,
precondiciones, mapa y escenarios. Sin cabecera → 🟡.

### 9. Aislamiento

```bash
grep -rn '^let \|^var \|^const .*=.*\[\]' tests/e2e/*.spec.ts
```
Estado a nivel de módulo compartido entre tests → 🟡 salvo dentro de un
`describe.serial` con justificación escrita.

Verificación real:
```bash
npx playwright test <spec> --repeat-each=3        # ¿pasa 3 veces?
npx playwright test <spec> --workers=4            # ¿pasa en paralelo?
```

### 10. Secretos

```bash
grep -rniE '(password|contrase|secret|token|api[_-]?key)\s*[:=]\s*["'\''][^"'\'']{4,}' \
  tests/e2e playwright.config.ts
git check-ignore .e2e-secrets.local || echo "🔴 .e2e-secrets.local NO está gitignoreado"
```
🔴 **Bloqueante.** Credenciales sólo desde `process.env`.

### 11. Configuración

```bash
grep -n 'forbidOnly\|retries\|trace\|testIdAttribute' playwright.config.ts
```
- `forbidOnly: !!process.env.CI` presente → si no, 🔴
- `retries` en CI ≤ 1 → si es 2 o más, 🟡
- `trace: "retain-on-failure"` → si falta, 🔴 (sin trace no hay diagnóstico)
- `testIdAttribute: "data-testid"` → si falta, 🟡

### 12. Cobertura de `data-testid` en la app

```bash
echo "data-testid en src: $(grep -rho 'data-testid' src/ | wc -l)"
grep -rn '<tr\|<li\|role="row"' src/ --include="*.tsx" --include="*.vue" \
  | grep -v 'data-testid' | head -20
```
🟡 Filas, celdas, estados de carga/vacío/error sin `data-testid` son deuda que
va a producir tests frágiles. Listalos como pendientes.

---

## Salida

```markdown
# Auditoría de estándar — tests/e2e — 2026-08-12

**Archivos:** 24 specs · **Bloqueantes:** 3 · **Advertencias:** 11
**Veredicto:** 🔴 NO APTO PARA COMMIT

## 🔴 Bloqueantes
| # | Archivo:línea | Regla | Qué hay | Qué debe haber |
|---|---|---|---|---|
| 1 | `checkout.spec.ts:45` | §3 esperas | `await page.waitForTimeout(3000)` | `await expect(page.getByTestId("estado-orden")).toHaveText("Confirmada")` |
| 2 | `facturas.spec.ts:12` | §2 selectores | `page.locator(".tabla tr:nth-child(2)")` | `page.getByTestId("fila-factura-12345")` — falta el testid en `src/TablaFacturas.tsx:34` |
| 3 | `login.spec.ts:8` | §7 secretos | `password: "<credencial en duro>"` | `process.env.E2E_PASS` |

## 🟡 Advertencias
| # | Archivo:línea | Regla | Qué |
|---|---|---|---|
| 4 | `qa-final-fix.spec.ts` | §1 naming | Renombrar a `checkout-reintentos.spec.ts` |
| 5 | `wizard.spec.ts:60` | §4 anatomía | Sin cabecera |

## ✅ Corregido automáticamente (4)
- `smoke.spec.ts:20` — `waitForTimeout` → aserción web-first
- `facturas.spec.ts:88` — CSS → `getByTestId` (el testid ya existía)
- `wizard.spec.ts:1` — cabecera agregada
- `checkout.spec.ts:3` — import sin usar

## 📋 Deuda: data-testid faltantes en la app (7)
| Archivo | Elemento | testid propuesto |
|---|---|---|
| `src/TablaFacturas.tsx:34` | fila | `fila-factura-${f.nro}` |

## Siguiente paso
Corregir los 3 bloqueantes. Los 7 `data-testid` los agrega
`/generate-playwright-tests` la próxima vez que toque esos flujos.
```

---

## Reglas duras

1. **Archivo y línea siempre.** Un hallazgo sin ubicación no es accionable.
2. **La corrección propuesta va concreta**, en código, no "usar mejores selectores".
3. **No corrijas lo que cambia el significado de un test.**
4. **No inventes `data-testid` inexistentes en un selector.** Si falta, es deuda,
   no una corrección.
5. **Distinguí bloqueante de advertencia.** Si todo es urgente, nada lo es.
6. **Contá lo que auditaste**, incluido lo que quedó fuera.

---

## Modo estricto (pre-commit / CI)

```bash
# Falla si hay violación bloqueante. Para hook o pipeline.
! grep -rqn 'waitForTimeout\|networkidle' tests/e2e --include="*.ts" \
  && ! grep -rqn '\.only(' tests/e2e --include="*.ts" \
  && grep -q 'forbidOnly' playwright.config.ts \
  || { echo "🔴 Violación del estándar E2E"; exit 1; }
```
