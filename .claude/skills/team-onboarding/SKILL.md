---
name: team-onboarding
description: Deja a cualquier persona del equipo lista para correr y escribir tests E2E en minutos — verifica Node y Playwright, instala navegadores, configura el MCP de Playwright, crea la estructura de tests, valida con un smoke test y explica el flujo de trabajo. Usalo cuando alguien se suma al proyecto, cuando el entorno de testing no funciona, o para instalar el kit en un repo nuevo.
---

# Team Onboarding — del cero a probando

Dejás a una persona con el entorno andando y entendiendo el flujo. Terminás
cuando **corrió un test de verdad**, no cuando instalaste cosas.

Adaptate a quién tenés enfrente: si nunca usó Playwright, explicá; si es la
quinta vez que instala el kit, andá directo. Preguntá al principio.

---

## Paso 0 — Diagnóstico

```bash
node -v                 # ≥ 20
npm -v
git rev-parse --show-toplevel 2>/dev/null || echo "⚠️ no es un repo git"
ls playwright.config.ts 2>/dev/null && echo "✅ Playwright configurado" || echo "○ falta configurar"
ls tests/e2e 2>/dev/null && echo "✅ estructura de tests" || echo "○ falta estructura"
ls .claude/skills/human-tester 2>/dev/null && echo "✅ kit instalado" || echo "○ falta el kit"
npx playwright --version 2>/dev/null || echo "○ Playwright no instalado"
```

Reportá qué falta antes de instalar nada. Si todo está, saltá al paso 4.

---

## Paso 1 — Instalar el kit

```bash
bash <ruta-al-kit>/setup-testing.sh
```

El instalador es idempotente: nunca pisa un archivo existente sin avisar, y deja
`.bak` de lo que modifica. Hace:

1. Instala `@playwright/test` y el navegador Chromium
2. Crea `playwright.config.ts` si no existe (si existe, propone los ajustes que faltan)
3. Crea `tests/e2e/_helpers/` con sesión, evidencia, red y datos
4. Crea `docs/qa/mapa/` y `docs/qa/reportes/`
5. Copia skills y agentes a `.claude/`
6. Copia `TESTING_STANDARDS.md`, `PROMPTS.md` y el contrato de los agentes (`docs/qa/CONTRATO-DE-LOS-AGENTES.md`)
7. Agrega los scripts npm
8. Actualiza `.gitignore`
9. Crea `.e2e-secrets.local.example`

---

## Paso 2 — MCP de Playwright

Sin esto no hay exploración: los agentes no pueden abrir un navegador.

```bash
claude mcp list                               # ¿ya está?
claude mcp add playwright -- npx -y @playwright/mcp@latest
```

Verificación real — pedile a Claude:
```
Navegá a http://localhost:5173 y mostrame el snapshot de accesibilidad.
```
Si devuelve un árbol de roles, funciona. Si no, revisá `claude mcp list` y que
la app esté levantada.

> Según cómo se instale, las herramientas aparecen como `mcp__playwright__browser_*`
> o `mcp__plugin_playwright_playwright__browser_*`. Las dos sirven igual.

---

## Paso 3 — Credenciales

```bash
cp .e2e-secrets.local.example .e2e-secrets.local
```

Completar con las credenciales del ambiente de **pruebas**. Después:

```bash
git check-ignore .e2e-secrets.local && echo "✅ gitignoreado" || echo "🔴 PARAR: se puede commitear"
```

Reglas: nunca credenciales de producción, nunca las tuyas personales, nunca
commitear el archivo. Si el `.example` no existe, preguntá quién tiene las
credenciales del ambiente de pruebas — no las inventes.

---

## Paso 4 — Primera corrida (la validación real)

```bash
npm run dev &                     # levantar la app (mirá el README del repo)
npm run test:e2e:smoke
```

Verde → listo. Rojo → **arreglalo ahora**, es parte del onboarding. Los tres
motivos habituales:

| Error | Causa | Solución |
|---|---|---|
| `net::ERR_CONNECTION_REFUSED` | La app no está levantada | `npm run dev` y confirmar el puerto |
| `Executable doesn't exist` | Falta el navegador | `npx playwright install chromium` |
| Tests `skipped` con mensaje de credenciales | Falta `.e2e-secrets.local` | Paso 3 |

---

## Paso 5 — Explicar el flujo (5 minutos)

> **El ciclo:** Explorar → Generar → Ejecutar → Diagnosticar → Reparar → Commitear.
>
> **Lo único que hay que recordar:** nunca se escribe un test sin haber recorrido
> la app primero. Todo lo demás sale de ahí.
>
> **Si sólo te acordás de un comando:**
> ```
> /human-tester probá el flujo de <lo que sea>
> ```
> Eso arranca el ciclo completo. Las otras skills son para control fino.

Mostrale **el ciclo entero en vivo** sobre un flujo chico y real del proyecto.
Vale mil veces más que leer la documentación. Diez minutos.

Después, señalale tres archivos:
- `TESTING_STANDARDS.md` — la norma. Léela una vez, entera.
- `PROMPTS.md` — para copiar y pegar el día a día.
- `docs/qa/mapa/` — los mapas ya hechos. Empezá leyendo uno.

---

## Paso 6 — Cierre

```markdown
## Entorno listo ✅
- Node v22.3.0 · Playwright 1.48 · Chromium instalado
- MCP de Playwright: conectado y verificado
- Estructura: `tests/e2e/`, `docs/qa/mapa/`, `_helpers/`
- Credenciales: `.e2e-secrets.local` ✅ gitignoreado
- Smoke: 3/3 verde en 12s

## Primer ejercicio
`/human-tester probá el flujo de login` — explorá, generá un test, corrélo.
Cualquiera del equipo te revisa el PR.

## Pendiente
- [ ] Credenciales del ambiente de QA (las tiene <quién>)
```

---

## Reglas duras

1. **No termines hasta que la persona corrió un test verde.** Instalar no es onboardear.
2. **Verificá cada paso**, no asumas que funcionó porque el comando no falló.
3. **Nunca pidas ni escribas credenciales de producción.**
4. **Confirmá el gitignore de `.e2e-secrets.local`** antes de que alguien lo llene.
5. **No pises configuración existente** sin avisar y sin backup.
6. **Explicá el porqué, no sólo el cómo.** Quien entiende por qué se explora
   antes de escribir, no se saltea el paso cuando tiene apuro.
