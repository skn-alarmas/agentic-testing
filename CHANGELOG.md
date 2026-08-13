# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).
Versionado semántico aplicado al **kit**, no a los tests que genera.

Qué significa cada tipo de cambio acá:

- **MAYOR** — cambia el estándar de forma incompatible (una regla nueva deja
  tests existentes fuera de norma, o cambia la estructura de carpetas).
- **MENOR** — skills, agentes o helpers nuevos; reglas nuevas que no invalidan
  lo ya escrito.
- **PARCHE** — correcciones, redacción, mejoras del instalador.

Al actualizar el kit en un repo, `.claude/testing-kit.version` (frontend) y
`.claude/backend-testing-kit.version` (backend) dicen de qué versión venís, y el
instalador avisa el salto.

---

## [1.1.0] — 2026-08-13

Kit de **backend**. El repo pasa a tener dos kits hermanos que se instalan por
separado: frontend (`setup-testing.sh`) y backend (`setup-backend-testing.sh`).

### Agregado

**Skills de backend** (`.claude/skills/`)
- `backend-rigorous-tester` — punto de entrada, orquesta el ciclo completo
- `api-contract-validator` — valida (o genera) el contrato OpenAPI
- `security-penetration-tester` — catálogo OWASP API sobre endpoints propios
- `data-integrity-guardian` — transacciones, estados, agregados, concurrencia
- `negative-edge-case-generator` — casos negativos y de borde, sistemáticos
- `backend-self-heal` — diagnóstico y reparación con tres causas posibles
- `backend-standards-enforcer` — 15 verificaciones de la norma
- `backend-onboarding` — entorno andando en minutos

**Agentes de backend** (`.claude/agents/`)
- `api-explorer-agent`, `contract-enforcer-agent`, `security-attacker-agent`,
  `data-chaos-agent`, `backend-healer-agent`, `coverage-critic-agent`
- `coverage-critic-agent` sin permiso de escritura sobre los tests, a propósito

**Estándar de backend** (`backend/`)
- `BACKEND_TESTING_STANDARDS.md` — nueve dimensiones, aserción de tres capas,
  control positivo, tabla canónica de códigos HTTP, DoD
- `BACKEND_AGENTS.md`, `BACKEND_PROMPTS.md` (13 prompts), `CLAUDE.md`

**Infraestructura de tests** (`templates-backend/`)
- `vitest.config.ts` con los mínimos del estándar
- Helpers: `entorno` (guardarraíl anti-producción), `cliente` (roles, evidencia
  redactada), `auth` (tokens legítimos y adversarios), `contrato` (validación
  estricta contra OpenAPI), `db` (fuente de verdad), `datos`, `payloads`
  (corpus hostil), `concurrencia`
- Fixtures con limpieza automática de lo creado
- `smoke.test.ts` — valida el entorno, incluido el propio guardarraíl
- `REFERENCIA.md` — spec de referencia anotado

**Instalador**
- `setup-backend-testing.sh`, idempotente, con `--dry-run`, `--sin-npm`,
  `--forzar`. Detecta framework, puerto y contrato. Marca la versión en
  `.claude/backend-testing-kit.version`

**CI**
- Job de backend: instala el kit contra una API de prueba, corre la suite,
  verifica idempotencia y typecheck, y **rompe la API a propósito** para exigir
  que las guardas se pongan rojas

### Decisiones de diseño

- **`200 OK` no es evidencia.** Los tests que escriben afirman en tres capas:
  respuesta → contrato → fuente de verdad. Un 201 devuelto antes del commit se
  ve idéntico a uno correcto.
- **Todo test de rechazo lleva control positivo.** Es la versión backend de "un
  test que no puede fallar no está probando nada": un test de seguridad contra
  una ruta mal escrita pasa en verde probando nada, y el verde se ve idéntico.
- **La cobertura es una matriz, no un porcentaje.** Nueve dimensiones por
  endpoint. Se puede tener 90 % de líneas y cero tests de autorización.
- **`retry: 0` también en CI**, a diferencia del kit de frontend. Una llamada
  HTTP no tiene la variabilidad de un navegador: acá un retry esconde una carrera.
- **Validación de contrato estricta por defecto** (`additionalProperties: false`
  forzado). Es lo que detecta los campos internos filtrados.
- **El guardarraíl anti-producción corta la corrida**, no avisa. Es lo único
  que hay entre un test de borrado y los datos reales el día que alguien exporte
  la variable equivocada.
- **Sin contrato, D1 no se marca cubierta.** `API_CONTRATO=ninguno` es una deuda
  declarada, no una opción.

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
