# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).
Versionado semántico aplicado al **kit**, no a los tests que genera.

Qué significa cada tipo de cambio acá:

- **MAYOR** — cambia el estándar de forma incompatible (una regla nueva deja
  tests existentes fuera de norma, o cambia la estructura de carpetas).
- **MENOR** — skills, agentes o helpers nuevos; reglas nuevas que no invalidan
  lo ya escrito.
- **PARCHE** — correcciones, redacción, mejoras del instalador.

Al actualizar el kit en un repo, `.claude/testing-kit.version` dice de qué
versión venís y el instalador avisa el salto.

---

## [1.0.2] — 2026-09-14

### Corregido

- **El instalador ya no pisa `AGENTS.md`.** Lo copiaba siempre a la raíz del repo
  destino, pero `AGENTS.md` es el archivo que Codex, Cursor y Copilot leen como las
  reglas del proyecto (y Claude Code, cuando `CLAUDE.md` lo importa). Un repo que
  tuviera sus reglas ahí las perdía en cada actualización del kit, con un `.bak` como
  único rastro. El contrato de los agentes ahora se instala en
  `docs/qa/CONTRATO-DE-LOS-AGENTES.md`, al lado de los mapas y los reportes que
  producen esos agentes.
- **El README decía que `.e2e-secrets.local.example` se pisa siempre**; desde 1.0.1 se
  respeta el del proyecto.

### Agregado

- **Avisos sobre `AGENTS.md`**: si el repo no lo tiene, si todavía es la copia vieja del
  contrato, o si no apunta a `docs/qa/CONTRATO-DE-LOS-AGENTES.md`.

### Migrar desde 1.0.1

Si la primera línea de tu `AGENTS.md` es `# AGENTS.md — Cómo trabajan los agentes de
testing`, es la copia del contrato que instalaba el kit. Actualizá el kit —el contrato
queda en `docs/qa/`— y reemplazá `AGENTS.md` por las reglas del repo, o borralo.

---

## [1.0.1] — 2026-08-12

Correcciones salidas de la primera instalación real (`gestion-empresarial-front`).

### Corregido

- **El instalador ya no pisa `.e2e-secrets.local.example`.** Estaba marcado
  como "sobrescribir siempre", pero es un archivo específico de cada proyecto:
  documenta qué credenciales necesita *esa* app y cómo se llaman sus variables.
  Al instalar sobre un repo que ya lo tenía, se perdió documentación que el kit
  no puede reponer (el realm, y que el usuario debe existir además en el ERP o
  el permiso da 403). Ahora se respeta el existente, como el resto de los
  archivos del proyecto.

### Agregado

- **Aviso cuando `.claude/` está gitignoreado.** Varios repos lo ignoran entero
  por los worktrees y los ajustes locales. Con eso, las skills y los agentes
  quedan sólo en la máquina de quien instaló y el estándar deja de ser del
  equipo. El instalador lo detecta y da el patrón exacto para destapar sólo lo
  compartido, sin dejar de ignorar lo local.

---

## [1.0.0] — 2026-08-12

Primera versión. Sistema completo de testing agentic para frontend.

### Agregado

**Skills** (`.claude/skills/`)
- `human-tester` — punto de entrada, orquesta el ciclo completo
- `explore-app` — exploración en navegador real, produce el mapa del flujo
- `generate-playwright-tests` — genera tests desde el mapa
- `self-heal-tests` — diagnostica y repara, distinguiendo test roto de app rota
- `enforce-standards` — auditoría del estándar, 12 verificaciones
- `regression-suite` — mantenimiento de la suite y caza de flakiness
- `team-onboarding` — entorno andando en minutos

**Agentes** (`.claude/agents/`)
- `explorer-agent`, `test-writer-agent`, `healer-agent`, `reviewer-agent`
- `reviewer-agent` sin permiso de escritura, a propósito

**Estándar**
- `TESTING_STANDARDS.md` — escalera de selectores, anti-flakiness, naming,
  niveles de suite, Definition of Done
- `AGENTS.md` — contrato de cada agente
- `PROMPTS.md` — 12 prompts de uso diario
- `CLAUDE.md` — se instala en el repo destino

**Infraestructura de tests** (`templates/`)
- `playwright.config.ts` con los mínimos del estándar
- Helpers: `session`, `evidencia`, `red`, `datos`
- Fixtures con guardas automáticas de errores de consola y respuestas 5xx
- `smoke.spec.ts` — valida el entorno recién instalado
- `REFERENCIA.md` — spec de referencia anotado

**Instalador**
- `setup-testing.sh` idempotente, con `--dry-run`, `--sin-npm`, `--forzar`
- Detecta framework y puerto desde `package.json` y los configs
- Nunca pisa archivos existentes sin avisar; deja `.bak`
- Marca la versión instalada en `.claude/testing-kit.version`
- Probado en bash 3.2 (el que trae macOS) y bash 5

**CI**
- Instala el kit en un proyecto de prueba y corre la suite que instala
- Verifica idempotencia, typecheck y frontmatter de skills y agentes
- Rompe la app a propósito y exige que las guardas se pongan rojas

### Decisiones de diseño

- **Rol accesible por encima de `data-testid`.** `data-testid` es obligatorio
  donde no hay semántica estable (filas, celdas, estados, textos formateados),
  pero el peldaño 1 es `getByRole`: hace que el test verifique lo mismo que
  percibe alguien usando un lector de pantalla.
- **`retries: 1` en CI, no 2.** Dos retries esconden flakiness en vez de
  resolverla.
- **El healer no puede tocar aserciones.** Puede cambiar cómo un test alcanza
  un elemento, nunca qué afirma. Sin ese límite, la suite se convierte en
  decoración.
- **Las fixtures de consola y 5xx no son `auto` por defecto.** Activarlas de
  golpe sobre una suite existente pone en rojo tests que hoy pasan sobre
  errores preexistentes. Se activan cuando esa deuda está saldada.
