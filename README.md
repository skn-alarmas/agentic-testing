# Kit de testing agentic

Sistema de skills y agentes para Claude Code que prueban el frontend **como lo
probaría una persona**: exploran la app en un navegador real, escriben los tests,
los corren, diagnostican lo que falla y lo reparan.

Local, gratis, versionado en tu repo. Sin servicios externos.

---

## Cómo empezar en 10 minutos

### Minuto 0–2 · Clonar el kit e instalarlo en tu proyecto

El kit se clona **una vez** por máquina; desde ahí se instala en todos los
proyectos que quieras.

```bash
git clone https://github.com/skn-alarmas/agentic-testing.git ~/dev/agentic-testing
bash ~/dev/agentic-testing/setup-testing.sh /ruta/a/tu/repo
```

Idempotente: no pisa nada existente sin avisar y deja `.bak` de lo que modifica.
Probalo con `--dry-run` si querés ver qué haría antes de tocar el repo.

> Cada instalación deja `.claude/testing-kit.version` en el repo destino —
> **commiteálo**: es lo que le dice al equipo qué versión del estándar tiene
> ese proyecto.

### Minuto 2–4 · MCP de Playwright

Sin esto los agentes no pueden abrir un navegador.

```bash
claude mcp list                                          # ¿ya está?
claude mcp add playwright -- npx -y @playwright/mcp@latest
```

### Minuto 4–5 · Credenciales

```bash
cd /ruta/a/tu/repo
cp .e2e-secrets.local.example .e2e-secrets.local     # completar
git check-ignore .e2e-secrets.local                  # debe estar ignorado
```

Sólo credenciales de **ambientes de prueba**. Nunca de producción, nunca las tuyas.

### Minuto 5–7 · Validar

```bash
npm run dev &
npm run test:e2e:smoke
```

Verde → el entorno está listo. Rojo → arreglalo ahora; los tres motivos
habituales están en la skill `team-onboarding`.

### Minuto 7–10 · El primer ciclo real

En Claude Code:

```
/human-tester probá el flujo de login
```

Mirá lo que hace: explora en el navegador, deja el mapa en `docs/qa/mapa/`,
escribe el test, lo corre tres veces, rompe la funcionalidad a propósito para
confirmar que el test se pone rojo, y te reporta.

**Ese es todo el sistema.** El resto son variantes con más control.

---

## Qué se instala

```
tu-repo/
├── CLAUDE.md                    # instrucciones para Claude Code
├── TESTING_STANDARDS.md         # la norma
├── AGENTS.md                    # contrato de los agentes
├── PROMPTS.md                   # prompts para copiar
├── playwright.config.ts         # config con los mínimos del estándar
├── .e2e-secrets.local.example
├── .claude/
│   ├── skills/                  # 7 skills
│   └── agents/                  # 4 agentes
├── tests/e2e/
│   ├── _helpers/                # session · evidencia · red · datos
│   ├── fixtures/                # guardas automáticas de consola y 5xx
│   ├── REFERENCIA.md            # spec de referencia anotado
│   └── smoke.spec.ts            # validación del entorno
└── docs/qa/
    ├── mapa/                    # mapas de exploración
    └── reportes/                # reportes de corrida
```

---

## Las 7 skills

| Skill | Para qué |
|---|---|
| **`/human-tester`** | **Punto de entrada.** Ciclo completo. Si dudás, usá esta. |
| `/explore-app` | Recorre la app y produce el mapa del flujo |
| `/generate-playwright-tests` | Escribe los tests desde el mapa |
| `/self-heal-tests` | Diagnostica y repara lo que falla |
| `/enforce-standards` | Audita cumplimiento de la norma |
| `/regression-suite` | Mantiene la suite sana, caza flakiness |
| `/team-onboarding` | Deja el entorno andando en minutos |

## Los 4 agentes

`explorer-agent` explora · `test-writer-agent` escribe · `healer-agent` repara ·
`reviewer-agent` revisa (y es el único sin permiso de escritura, a propósito).

Contratos completos en [AGENTS.md](AGENTS.md).

---

## Las decisiones que sostienen el sistema

Tres reglas hacen la diferencia entre esto y un generador de tests.

**1. No se escribe un test sin haber explorado.**
El generador lee un mapa producido en un navegador real; nunca su propia
memoria. Un selector inventado es un rojo garantizado en dos semanas, y una
suite que falla por su cuenta es una suite que el equipo aprende a ignorar.

**2. Un test que no puede fallar no está terminado.**
Antes de entregar, se rompe la funcionalidad a propósito y se confirma el rojo.
El error más común de los tests generados es afirmar algo tan débil
(`toBeVisible()` sobre un contenedor que siempre existe) que pasan con la app
rota.

**3. Reparar cambia el camino, nunca el destino.**
El healer puede actualizar un selector; no puede tocar una aserción. Si para
poner el test en verde hay que aflojar lo que afirma, entonces el que se rompió
fue la app, y el rojo es correcto. Un healer sin este límite convierte la suite
en decoración.

---

## La escalera de selectores

Se baja un peldaño sólo si el de arriba no aplica.

1. **Rol accesible + nombre** — `getByRole("button", { name: "Pagar" })`
2. **Label** — `getByLabel("Número de tarjeta")`
3. **`data-testid`** — **obligatorio** donde no hay semántica estable: filas,
   celdas, estados de carga/vacío/error, textos formateados o traducibles
4. **Texto visible** — sólo para aserciones, nunca para navegar
5. ~~CSS / XPath~~ — prohibido

> Priorizar rol sobre `data-testid` no es una concesión: es lo que hace que el
> test verifique lo mismo que percibe un usuario con lector de pantalla. Cuando
> un elemento *debería* tener rol y no lo tiene, se agrega el `data-testid`
> **y** se reporta el problema de accesibilidad.

---

## Actualizar el kit en un repo

```bash
git -C ~/dev/agentic-testing pull
bash ~/dev/agentic-testing/setup-testing.sh /ruta/a/tu/repo
```

El instalador te dice de qué versión venís y a cuál vas:

```
Kit de testing agentic 1.1.0 (a3f9c21)
Instalado: 1.0.0 → se actualiza a 1.1.0
```

Qué se pisa y qué no:

| Se sobrescribe siempre | Nunca se pisa |
|---|---|
| Skills y agentes (`.claude/`) | `playwright.config.ts` |
| `TESTING_STANDARDS.md`, `AGENTS.md`, `PROMPTS.md` | Helpers y fixtures que hayas tocado |
| `REFERENCIA.md`, `.e2e-secrets.local.example` | Tus specs |

Si un archivo tuyo difiere del template, el instalador **no lo toca** y te dice
cómo compararlo. Para forzar la actualización de todo: `--forzar` (deja `.bak`).

## Contribuir al kit

El estándar es del equipo, no de una persona. Si una regla no funciona en tu
proyecto, esa es información sobre la regla.

1. Rama desde `main`, cambio, PR.
2. El CI instala el kit en un proyecto de prueba, corre la suite, verifica
   idempotencia y typecheck, y **rompe la app a propósito** para confirmar que
   las guardas se ponen rojas. Si eso no pasa, el PR no entra.
3. Subí `VERSION` y anotá el cambio en `CHANGELOG.md`. Cambiar una regla del
   estándar de forma incompatible es versión MAYOR.

## Documentos

| | |
|---|---|
| [TESTING_STANDARDS.md](TESTING_STANDARDS.md) | La norma. Leerla una vez, entera. |
| [AGENTS.md](AGENTS.md) | Qué puede y qué no puede cada agente |
| [PROMPTS.md](PROMPTS.md) | 12 prompts para copiar |
| [CLAUDE.md](CLAUDE.md) | Lo que se instala en el repo destino |
