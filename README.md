# Kit de testing agentic

Skills y agentes para Claude Code que prueban **como lo haría una persona**:
exploran el sistema de verdad, escriben los tests, los corren, diagnostican lo
que falla y lo reparan.

Son **dos kits hermanos** que se instalan por separado:

| | Prueba | Herramienta | Instalador |
|---|---|---|---|
| 🖥️ **Frontend** | La app en un navegador real | Playwright | `setup-testing.sh` |
| ⚙️ **Backend** | La API contra el servicio y su base | Vitest | `setup-backend-testing.sh` |

Comparten las reglas de fondo: no se escribe un test sin haber explorado, un
test que no puede fallar no está terminado, y nunca se hace pasar un test
debilitándolo.

Local, gratis, versionado en tu repo. Sin servicios externos.

---

## Empezar en 10 minutos

El kit se clona **una vez** por máquina; desde ahí se instala en todos los
proyectos que quieras.

```bash
git clone https://github.com/skn-alarmas/agentic-testing.git ~/dev/agentic-testing
```

### 🖥️ Frontend

```bash
bash ~/dev/agentic-testing/setup-testing.sh /ruta/a/tu/repo

claude mcp add playwright -- npx -y @playwright/mcp@latest   # sin esto no hay navegador

cd /ruta/a/tu/repo
cp .e2e-secrets.local.example .e2e-secrets.local     # completar
npm run dev & npm run test:e2e:smoke                 # validar
```

Después, en Claude Code:

```
/human-tester probá el flujo de login
```

Explora en el navegador, deja el mapa en `docs/qa/mapa/`, escribe el test, lo
corre tres veces, rompe la funcionalidad a propósito para confirmar que se pone
rojo, y te reporta.

### ⚙️ Backend

```bash
bash ~/dev/agentic-testing/setup-backend-testing.sh /ruta/a/tu/repo

cd /ruta/a/tu/repo
cp .api-secrets.local.example .api-secrets.local     # completar identidades
# levantar el servicio y su base de pruebas
npm run test:api:smoke                               # validar
```

Después, en Claude Code:

```
/backend-rigorous-tester probá la API de facturas
```

Mapea los endpoints, planifica las nueve dimensiones, escribe los tests, los
corre, rompe el servicio a propósito, y te reporta con la matriz de cobertura.

> Cada instalación deja `.claude/testing-kit.version` o
> `.claude/backend-testing-kit.version` en el repo destino — **commiteálos**:
> son lo que le dice al equipo qué versión del estándar tiene ese proyecto.

Los instaladores son idempotentes: no pisan nada existente sin avisar y dejan
`.bak` de lo que modifican. Probalos con `--dry-run`.

---

## Qué se instala

<table>
<tr><th>🖥️ Frontend</th><th>⚙️ Backend</th></tr>
<tr valign="top"><td>

```
tu-repo/
├── CLAUDE.md
├── TESTING_STANDARDS.md
├── AGENTS.md
├── PROMPTS.md
├── playwright.config.ts
├── .e2e-secrets.local.example
├── .claude/
│   ├── skills/          # 7
│   └── agents/          # 4
├── tests/e2e/
│   ├── _helpers/
│   ├── fixtures/
│   ├── REFERENCIA.md
│   └── smoke.spec.ts
└── docs/qa/
    ├── mapa/
    └── reportes/
```

</td><td>

```
tu-repo/
├── CLAUDE.md
├── BACKEND_TESTING_STANDARDS.md
├── BACKEND_AGENTS.md
├── BACKEND_PROMPTS.md
├── vitest.config.ts
├── .api-secrets.local.example
├── .claude/
│   ├── skills/          # 8
│   └── agents/          # 6
├── tests/api/
│   ├── _helpers/
│   ├── fixtures/
│   ├── REFERENCIA.md
│   └── smoke.test.ts
└── docs/qa/api/
    ├── mapa/
    ├── cobertura.md
    └── reportes/
```

</td></tr>
</table>

---

## Las skills

### 🖥️ Frontend

| Skill | Para qué |
|---|---|
| **`/human-tester`** | **Punto de entrada.** Ciclo completo. Si dudás, usá esta. |
| `/explore-app` | Recorre la app y produce el mapa del flujo |
| `/generate-playwright-tests` | Escribe los tests desde el mapa |
| `/self-heal-tests` | Diagnostica y repara lo que falla |
| `/enforce-standards` | Audita cumplimiento de la norma |
| `/regression-suite` | Mantiene la suite sana, caza flakiness |
| `/team-onboarding` | Deja el entorno andando en minutos |

`explorer-agent` explora · `test-writer-agent` escribe · `healer-agent` repara ·
`reviewer-agent` revisa (el único sin permiso de escritura, a propósito).
→ [AGENTS.md](AGENTS.md)

### ⚙️ Backend

| Skill | Para qué |
|---|---|
| **`/backend-rigorous-tester`** | **Punto de entrada.** Ciclo completo, nueve dimensiones. |
| `/api-contract-validator` | Valida el contrato OpenAPI — o lo genera si no existe |
| `/security-penetration-tester` | Catálogo OWASP API sobre endpoints propios |
| `/data-integrity-guardian` | Transacciones, estados, agregados, concurrencia |
| `/negative-edge-case-generator` | Casos negativos y de borde, sistemáticos |
| `/backend-self-heal` | Diagnostica y repara: ¿test, servicio o ambiente? |
| `/backend-standards-enforcer` | 15 verificaciones de la norma |
| `/backend-onboarding` | Deja el entorno andando en minutos |

`api-explorer-agent` mapea · `contract-enforcer-agent` valida contratos ·
`security-attacker-agent` ataca · `data-chaos-agent` corrompe ·
`backend-healer-agent` repara · `coverage-critic-agent` critica (el único sin
permiso de escritura sobre los tests).
→ [BACKEND_AGENTS.md](backend/BACKEND_AGENTS.md)

---

## Las decisiones que sostienen el sistema

Tres reglas hacen la diferencia entre esto y un generador de tests.

**1. No se escribe un test sin haber explorado.**
El generador lee un mapa producido contra el sistema real; nunca su propia
memoria. Un selector —o un endpoint— inventado es un rojo garantizado en dos
semanas, y una suite que falla por su cuenta es una suite que el equipo aprende
a ignorar.

**2. Un test que no puede fallar no está terminado.**
Antes de entregar, se rompe la funcionalidad a propósito y se confirma el rojo.

**3. Reparar cambia el camino, nunca el destino.**
El healer puede actualizar un selector o una ruta; no puede tocar una aserción.
Si para poner el test en verde hay que aflojar lo que afirma, entonces el que se
rompió fue el sistema, y el rojo es correcto.

### Lo específico del frontend: la escalera de selectores

Se baja un peldaño sólo si el de arriba no aplica.

1. **Rol accesible + nombre** — `getByRole("button", { name: "Pagar" })`
2. **Label** — `getByLabel("Número de tarjeta")`
3. **`data-testid`** — **obligatorio** donde no hay semántica estable
4. **Texto visible** — sólo para aserciones, nunca para navegar
5. ~~CSS / XPath~~ — prohibido

> Priorizar rol sobre `data-testid` no es una concesión: es lo que hace que el
> test verifique lo mismo que percibe un usuario con lector de pantalla.

### Lo específico del backend: nueve dimensiones y tres capas

Ningún endpoint está cubierto hasta que las nueve tienen veredicto — incluido
"no aplica, porque X":

**D1** contrato · **D2** happy path · **D3** autenticación · **D4** autorización ·
**D5** validación · **D6** bordes · **D7** errores · **D8** integridad ·
**D9** concurrencia

Y dos reglas que no existen en el frontend:

> **`200 OK` no es evidencia.** Todo test que escribe afirma en tres capas:
> respuesta HTTP → contrato publicado → fuente de verdad. Un 201 devuelto antes
> del commit se ve idéntico a uno correcto.

> **Todo test de rechazo lleva control positivo.** Si el ataque falla, hay que
> demostrar que *podía* haber funcionado. Sin eso, un test de seguridad contra
> una ruta mal escrita pasa en verde probando nada — y el verde se ve idéntico.

---

## Actualizar el kit en un repo

```bash
git -C ~/dev/agentic-testing pull
bash ~/dev/agentic-testing/setup-testing.sh         /ruta/a/tu/repo   # frontend
bash ~/dev/agentic-testing/setup-backend-testing.sh /ruta/a/tu/repo   # backend
```

El instalador te dice de qué versión venís y a cuál vas:

```
Kit de testing agentic 1.1.0 (a3f9c21)
Instalado: 1.0.0 → se actualiza a 1.1.0
```

Qué se pisa y qué no:

| Se sobrescribe siempre | Nunca se pisa |
|---|---|
| Skills y agentes (`.claude/`) | `playwright.config.ts` · `vitest.config.ts` |
| Los documentos del estándar | Helpers y fixtures que hayas tocado |
| `REFERENCIA.md` | Tus specs y tus `.*-secrets.local.example` |

Si un archivo tuyo difiere del template, el instalador **no lo toca** y te dice
cómo compararlo. Para forzar la actualización de todo: `--forzar` (deja `.bak`).

## Contribuir al kit

El estándar es del equipo, no de una persona. Si una regla no funciona en tu
proyecto, esa es información sobre la regla.

1. Rama desde `main`, cambio, PR.
2. El CI instala los dos kits en proyectos de prueba, corre las suites, verifica
   idempotencia y typecheck, y **rompe la app y la API a propósito** para
   confirmar que las guardas se ponen rojas. Si eso no pasa, el PR no entra.
3. Subí `VERSION` y anotá el cambio en `CHANGELOG.md`. Cambiar una regla del
   estándar de forma incompatible es versión MAYOR.

## Documentos

| | |
|---|---|
| [TESTING_STANDARDS.md](TESTING_STANDARDS.md) | La norma de frontend. Leerla una vez, entera. |
| [backend/BACKEND_TESTING_STANDARDS.md](backend/BACKEND_TESTING_STANDARDS.md) | La norma de backend. Ídem. |
| [backend/ADOPCION.md](backend/ADOPCION.md) | Cómo ponerlo a andar en el equipo en 20 minutos |
| [AGENTS.md](AGENTS.md) · [backend/BACKEND_AGENTS.md](backend/BACKEND_AGENTS.md) | Qué puede y qué no puede cada agente |
| [PROMPTS.md](PROMPTS.md) · [backend/BACKEND_PROMPTS.md](backend/BACKEND_PROMPTS.md) | Prompts para copiar |
| [CLAUDE.md](CLAUDE.md) · [backend/CLAUDE.md](backend/CLAUDE.md) | Lo que se instala en el repo destino |
