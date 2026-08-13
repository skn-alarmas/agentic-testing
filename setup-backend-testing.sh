#!/usr/bin/env bash
#
# setup-backend-testing.sh — instala el kit de testing de backend en un repo.
#
#   bash /ruta/al/kit/setup-backend-testing.sh [directorio-destino]
#
# Sin argumento, instala en el directorio actual.
#
# Es idempotente: se puede correr las veces que haga falta. Nunca pisa un
# archivo existente sin avisar; de lo que modifica, deja `.bak`.
#
# Para actualizar el kit en un repo que ya lo tiene:
#   git -C /ruta/al/kit pull && bash /ruta/al/kit/setup-backend-testing.sh /repo
#
# Opciones:
#   --dry-run     muestra qué haría, sin tocar nada
#   --sin-npm     no instala dependencias (útil en CI o sin red)
#   --forzar      sobrescribe archivos existentes (deja .bak)
#   -v, --version muestra la versión del kit y sale

set -euo pipefail

# ─── Presentación ────────────────────────────────────────────────────────
if [ -t 1 ]; then
  ROJO=$'\033[0;31m'; VERDE=$'\033[0;32m'; AMAR=$'\033[0;33m'
  AZUL=$'\033[0;34m'; GRIS=$'\033[0;90m'; NEGRITA=$'\033[1m'; FIN=$'\033[0m'
else
  ROJO=""; VERDE=""; AMAR=""; AZUL=""; GRIS=""; NEGRITA=""; FIN=""
fi

ok()     { printf '%s✅ %s%s\n' "$VERDE" "$1" "$FIN"; }
info()   { printf '%s○  %s%s\n' "$GRIS" "$1" "$FIN"; }
aviso()  { printf '%s⚠️  %s%s\n' "$AMAR" "$1" "$FIN"; }
error()  { printf '%s🔴 %s%s\n' "$ROJO" "$1" "$FIN" >&2; }
titulo() { printf '\n%s%s%s\n' "$NEGRITA$AZUL" "$1" "$FIN"; }

CREADOS=(); MODIFICADOS=(); OMITIDOS=(); PENDIENTES=()

# ─── Argumentos ──────────────────────────────────────────────────────────
DRY_RUN=0; SIN_NPM=0; FORZAR=0; DESTINO=""

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --sin-npm) SIN_NPM=1 ;;
    --forzar)  FORZAR=1 ;;
    -v|--version) VER_SOLO=1 ;;
    -h|--help) sed -n '2,21p' "$0" | sed 's/^# \?//'; exit 0 ;;
    -*) error "Opción desconocida: $1"; exit 1 ;;
    *)  DESTINO="$1" ;;
  esac
  shift
done

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

VERSION_KIT="$(cat "$KIT/VERSION" 2>/dev/null || echo "0.0.0")"
COMMIT_KIT="$(git -C "$KIT" rev-parse --short HEAD 2>/dev/null || echo "sin-git")"

if [ "${VER_SOLO:-0}" = 1 ]; then
  printf 'kit de testing de backend %s (%s)\n' "$VERSION_KIT" "$COMMIT_KIT"
  exit 0
fi

DESTINO="$(cd "${DESTINO:-$PWD}" && pwd)"

[ "$KIT" = "$DESTINO" ] && { error "El destino no puede ser el propio kit."; exit 1; }

MARCA_VERSION="$DESTINO/.claude/backend-testing-kit.version"
VERSION_PREVIA="$(sed -n 's/^version=//p' "$MARCA_VERSION" 2>/dev/null || true)"

titulo "Kit de testing de backend $VERSION_KIT ($COMMIT_KIT)"
printf '%sKit:     %s%s\n' "$GRIS" "$KIT" "$FIN"
printf '%sDestino: %s%s\n' "$GRIS" "$DESTINO" "$FIN"
if [ -n "$VERSION_PREVIA" ]; then
  if [ "$VERSION_PREVIA" = "$VERSION_KIT" ]; then
    printf '%sInstalado: %s (misma versión — se revalida)%s\n' "$GRIS" "$VERSION_PREVIA" "$FIN"
  else
    printf '%sInstalado: %s → se actualiza a %s%s\n' "$AMAR" "$VERSION_PREVIA" "$VERSION_KIT" "$FIN"
  fi
fi
[ "$DRY_RUN" = 1 ] && aviso "DRY RUN — no se escribe nada"

cd "$DESTINO"

# ─── Utilidades ──────────────────────────────────────────────────────────
ejecutar() { [ "$DRY_RUN" = 1 ] && { printf '%s   $ %s%s\n' "$GRIS" "$*" "$FIN"; return 0; }; "$@"; }

# copiar <origen-relativo-al-kit> <destino-relativo> [--siempre]
copiar() {
  local origen="$KIT/$1" destino="$DESTINO/$2" siempre="${3:-}"
  [ -f "$origen" ] || { error "Falta en el kit: $1"; return 1; }

  if [ -f "$destino" ] && [ "$siempre" != "--siempre" ] && [ "$FORZAR" != 1 ]; then
    if cmp -s "$origen" "$destino"; then
      info "$2 (ya estaba, idéntico)"
    else
      OMITIDOS+=("$2")
      aviso "$2 ya existe y difiere — NO se pisó. Comparar: diff '$origen' '$destino'"
    fi
    return 0
  fi

  if [ -f "$destino" ]; then
    cmp -s "$origen" "$destino" && { info "$2 (sin cambios)"; return 0; }
    ejecutar cp "$destino" "$destino.bak"
    MODIFICADOS+=("$2")
  else
    CREADOS+=("$2")
  fi

  ejecutar mkdir -p "$(dirname "$destino")"
  ejecutar cp "$origen" "$destino"
  ok "$2"
}

# ─── 1. Requisitos ───────────────────────────────────────────────────────
titulo "1. Requisitos"

command -v node >/dev/null || { error "Node no está instalado. Hace falta Node ≥ 20."; exit 1; }
NODE_MAYOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAYOR" -lt 20 ]; then
  error "Node $(node -v) — hace falta ≥ 20 (por fetch y AbortSignal.timeout)."
  exit 1
fi
ok "Node $(node -v)"

if [ ! -f package.json ]; then
  error "No hay package.json en $DESTINO."
  printf '%s   Si el servicio no es Node (Java, Python, PHP...), la suite igual\n' "$GRIS"
  printf '   corre en Node contra la API por HTTP. Creá el package.json primero:\n'
  printf '     npm init -y\n%s' "$FIN"
  exit 1
fi
ok "package.json encontrado"

git -C "$DESTINO" rev-parse --show-toplevel >/dev/null 2>&1 \
  && ok "repo git: $(git -C "$DESTINO" rev-parse --show-toplevel)" \
  || aviso "No es un repo git — los tests no van a quedar versionados"

# ─── 2. Detección del proyecto ───────────────────────────────────────────
titulo "2. Detección del proyecto"

FRAMEWORK="desconocido"; PUERTO="3000"
if   [ -f nest-cli.json ]; then FRAMEWORK="nest";    PUERTO="3000"
elif grep -q '"fastify"'  package.json 2>/dev/null; then FRAMEWORK="fastify"; PUERTO="3000"
elif grep -q '"express"'  package.json 2>/dev/null; then FRAMEWORK="express"; PUERTO="3000"
elif grep -q '"hono"'     package.json 2>/dev/null; then FRAMEWORK="hono";    PUERTO="8787"
elif grep -q '"koa"'      package.json 2>/dev/null; then FRAMEWORK="koa";     PUERTO="3000"
elif grep -q '"@adonisjs/core"' package.json 2>/dev/null; then FRAMEWORK="adonis"; PUERTO="3333"
elif [ -f next.config.js ] || [ -f next.config.mjs ] || [ -f next.config.ts ]; then
  FRAMEWORK="next (rutas de API)"; PUERTO="3000"
fi

# Puerto explícito en los scripts, si lo hay
PUERTO_DETECTADO="$(node -e '
  try {
    const p = require("./package.json").scripts || {};
    const s = [p.dev, p.start, p["start:dev"], p.serve].filter(Boolean).join(" ");
    const m = s.match(/--port[= ](\d+)|-p[= ](\d+)|PORT=(\d+)/);
    if (m) process.stdout.write(m[1] || m[2] || m[3]);
  } catch {}
' 2>/dev/null || true)"
[ -n "$PUERTO_DETECTADO" ] && PUERTO="$PUERTO_DETECTADO"

ok "framework: $FRAMEWORK · puerto asumido: $PUERTO"
[ "$FRAMEWORK" = "desconocido" ] && \
  PENDIENTES+=("Verificar API_BASE_URL en .api-secrets.local (puerto asumido: $PUERTO)")

# Contrato: se busca en los lugares habituales
CONTRATO=""
for c in openapi.yaml openapi.yml openapi.json swagger.yaml swagger.yml swagger.json \
         docs/openapi.yaml docs/openapi.json api/openapi.yaml src/openapi.yaml; do
  [ -f "$c" ] && { CONTRATO="$c"; break; }
done
if [ -n "$CONTRATO" ]; then
  ok "contrato encontrado: $CONTRATO"
else
  aviso "No encontré OpenAPI/Swagger — la dimensión D1 (contrato) queda sin cubrir."
  printf '%s   Se instala con API_CONTRATO=ninguno. Para generar un borrador:%s\n' "$GRIS" "$FIN"
  printf '%s     /api-contract-validator%s\n' "$GRIS" "$FIN"
  PENDIENTES+=("Generar el contrato OpenAPI (hoy D1 queda sin cubrir) — /api-contract-validator")
fi

# ─── 3. Dependencias ─────────────────────────────────────────────────────
titulo "3. Dependencias"

if [ "$SIN_NPM" = 1 ]; then
  info "omitido por --sin-npm"
else
  FALTANTES=""
  for dep in vitest ajv ajv-formats yaml; do
    [ -d "node_modules/$dep" ] || FALTANTES="$FALTANTES $dep"
  done
  if [ -n "$FALTANTES" ]; then
    info "instalando:$FALTANTES"
    # shellcheck disable=SC2086
    ejecutar npm install -D $FALTANTES
    ok "dependencias instaladas"
  else
    ok "vitest, ajv, ajv-formats y yaml ya estaban"
  fi
fi

# ─── 4. Configuración ────────────────────────────────────────────────────
titulo "4. Configuración"

CFG="$(ls vitest.config.* 2>/dev/null | head -1 || true)"

if [ -z "$CFG" ]; then
  # No hay config: se instala el del kit.
  copiar templates-backend/vitest.config.ts vitest.config.ts
elif [ -n "$VERSION_PREVIA" ] && [ -f vitest.config.ts ]; then
  # Ya instalamos acá antes: el config es nuestro (o el usuario lo ajustó).
  # `copiar` respeta lo que difiera y avisa cómo compararlo.
  copiar templates-backend/vitest.config.ts vitest.config.ts
else
  # Hay un config previo que no pusimos nosotros: no se toca, se instala aparte.
  aviso "Ya existe $CFG — NO se pisó."
  copiar templates-backend/vitest.config.ts vitest.api.config.ts
  PENDIENTES+=("Fusionar vitest.api.config.ts con tu $CFG, o correr la suite con: vitest --config vitest.api.config.ts")
fi

# `retry` distinto de 0 esconde flakiness: el estándar pide 0, también en CI.
if [ -n "$CFG" ] && grep -Eq 'retry:[[:space:]]*[1-9]' "$CFG" 2>/dev/null; then
  PENDIENTES+=("$CFG define retries — el estándar pide retry: 0 (§9)")
fi

# ─── 5. Estructura de tests ──────────────────────────────────────────────
titulo "5. Estructura de tests"

ejecutar mkdir -p tests/api/_helpers tests/api/fixtures docs/qa/api/mapa docs/qa/api/reportes

for h in entorno cliente auth contrato db datos payloads concurrencia; do
  copiar "templates-backend/tests/api/_helpers/$h.ts" "tests/api/_helpers/$h.ts"
done
copiar templates-backend/tests/api/fixtures/index.ts tests/api/fixtures/index.ts
copiar templates-backend/tests/api/setup.ts          tests/api/setup.ts
copiar templates-backend/tests/api/REFERENCIA.md     tests/api/REFERENCIA.md --siempre
copiar templates-backend/tests/api/smoke.test.ts     tests/api/smoke.test.ts
copiar templates-backend/.api-secrets.local.example  .api-secrets.local.example

if [ "$DRY_RUN" = 0 ]; then
  [ -f docs/qa/api/mapa/.gitkeep ]     || touch docs/qa/api/mapa/.gitkeep
  [ -f docs/qa/api/reportes/.gitkeep ] || touch docs/qa/api/reportes/.gitkeep
  if [ ! -f docs/qa/api/cobertura.md ]; then
    cat > docs/qa/api/cobertura.md <<'EOF'
# Cobertura de la API — matriz de dimensiones

La mantiene el `coverage-critic-agent`. Un endpoint no está cubierto hasta que
las nueve dimensiones tienen veredicto.

`✅` cubierto · `⬜` pendiente · `—` no aplica (**con motivo al pie, siempre**)

| Endpoint | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 |
|---|---|---|---|---|---|---|---|---|---|
| _(sin endpoints mapeados todavía)_ | | | | | | | | | |

D1 contrato · D2 happy path · D3 autenticación · D4 autorización ·
D5 validación · D6 bordes · D7 errores · D8 integridad · D9 concurrencia

## Motivos de los "no aplica"

_(uno por línea; un `—` sin motivo es un `⬜` disfrazado)_
EOF
    ok "docs/qa/api/cobertura.md"
    CREADOS+=("docs/qa/api/cobertura.md")
  fi
fi

# ─── 6. Skills y agentes ─────────────────────────────────────────────────
titulo "6. Skills y agentes"

ejecutar mkdir -p .claude/skills .claude/agents

for skill in backend-rigorous-tester api-contract-validator security-penetration-tester \
             data-integrity-guardian negative-edge-case-generator backend-self-heal \
             backend-standards-enforcer backend-onboarding; do
  copiar ".claude/skills/$skill/SKILL.md" ".claude/skills/$skill/SKILL.md" --siempre
done

for agente in api-explorer-agent contract-enforcer-agent security-attacker-agent \
              data-chaos-agent backend-healer-agent coverage-critic-agent; do
  copiar ".claude/agents/$agente.md" ".claude/agents/$agente.md" --siempre
done

# ─── 7. Documentos del estándar ──────────────────────────────────────────
titulo "7. Documentos del estándar"

copiar backend/BACKEND_TESTING_STANDARDS.md BACKEND_TESTING_STANDARDS.md --siempre
copiar backend/BACKEND_AGENTS.md            BACKEND_AGENTS.md            --siempre
copiar backend/BACKEND_PROMPTS.md           BACKEND_PROMPTS.md           --siempre

if [ -f CLAUDE.md ]; then
  aviso "Ya existe CLAUDE.md — NO se pisó."
  if ! grep -q "BACKEND_TESTING_STANDARDS" CLAUDE.md 2>/dev/null; then
    copiar backend/CLAUDE.md .claude/CLAUDE-backend-testing.md --siempre
    PENDIENTES+=("Fusionar \`.claude/CLAUDE-backend-testing.md\` dentro de tu CLAUDE.md (o referenciarlo)")
  fi
else
  copiar backend/CLAUDE.md CLAUDE.md
fi

# ─── 8. Scripts npm ──────────────────────────────────────────────────────
titulo "8. Scripts npm"

if [ "$DRY_RUN" = 1 ]; then
  info "se agregarían: test:api, test:api:smoke, test:api:critico, test:api:seguridad, test:api:contrato, test:api:aleatorio, test:api:ui"
else
  node - <<'JS'
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.scripts = pkg.scripts || {};

// Si ya había un vitest.config del proyecto, la suite corre con el suyo aparte.
const cfg = fs.existsSync("vitest.api.config.ts") ? " --config vitest.api.config.ts" : "";

const nuevos = {
  "test:api":           `vitest run${cfg}`,
  "test:api:smoke":     `vitest run${cfg} -t "@smoke"`,
  "test:api:critico":   `vitest run${cfg} -t "@critico"`,
  "test:api:seguridad": `vitest run${cfg} -t "@seguridad"`,
  "test:api:contrato":  `vitest run${cfg} -t "@contrato"`,
  "test:api:aleatorio": `vitest run${cfg} --sequence.shuffle`,
  "test:api:ui":        `vitest${cfg} --ui`,
};

const agregados = [];
for (const [k, v] of Object.entries(nuevos)) {
  if (!pkg.scripts[k]) { pkg.scripts[k] = v; agregados.push(k); }
}

if (agregados.length) {
  fs.copyFileSync("package.json", "package.json.bak");
  fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
  console.log(`\x1b[0;32m✅ scripts agregados: ${agregados.join(", ")}\x1b[0m`);
  console.log("\x1b[0;90m   (backup en package.json.bak)\x1b[0m");
} else {
  console.log("\x1b[0;90m○  los scripts ya estaban\x1b[0m");
}
JS
fi

# ─── 9. .gitignore ───────────────────────────────────────────────────────
titulo "9. .gitignore"

IGNORAR=(".api-secrets.local" "test-results/" ".vitest/" "coverage/")

if [ "$DRY_RUN" = 1 ]; then
  info "se agregarían: ${IGNORAR[*]}"
else
  [ -f .gitignore ] || touch .gitignore
  FALTAN=()
  for pat in "${IGNORAR[@]}"; do
    grep -qxF "$pat" .gitignore || FALTAN+=("$pat")
  done
  if [ ${#FALTAN[@]} -gt 0 ]; then
    { echo ""; echo "# Testing de API (kit agentic)"; printf '%s\n' "${FALTAN[@]}"; } >> .gitignore
    ok "agregados a .gitignore: ${FALTAN[*]}"
  else
    info ".gitignore ya cubre todo"
  fi

  if git -C "$DESTINO" rev-parse --git-dir >/dev/null 2>&1; then
    if git -C "$DESTINO" ls-files --error-unmatch .api-secrets.local >/dev/null 2>&1; then
      error "PARAR: .api-secrets.local está TRACKEADO en git. Sacalo ya:"
      error "  git rm --cached .api-secrets.local"
      error "  Y rotá esas credenciales: ya están en el historial."
    fi

    # Muchos repos ignoran `.claude/` entero por los worktrees y los ajustes
    # locales. Con eso, las skills y los agentes quedan sólo en la máquina de
    # quien instaló: el estándar deja de ser del equipo.
    if git -C "$DESTINO" check-ignore -q .claude/skills 2>/dev/null; then
      aviso ".claude/ está gitignoreado: el estándar NO se va a versionar."
      printf '%s   Reemplazá `.claude/` por esto en .gitignore:%s\n' "$GRIS" "$FIN"
      printf '%s     .claude/*%s\n' "$GRIS" "$FIN"
      printf '%s     !.claude/skills/%s\n' "$GRIS" "$FIN"
      printf '%s     !.claude/agents/%s\n' "$GRIS" "$FIN"
      printf '%s     !.claude/backend-testing-kit.version%s\n' "$GRIS" "$FIN"
      PENDIENTES+=("Destapar .claude/skills, .claude/agents y .claude/backend-testing-kit.version en .gitignore")
    fi
  fi
fi

# ─── 10. Semilla de .api-secrets.local ───────────────────────────────────
titulo "10. Credenciales"

if [ "$DRY_RUN" = 1 ]; then
  info "se sugeriría crear .api-secrets.local"
elif [ -f .api-secrets.local ]; then
  ok ".api-secrets.local ya existe (no se toca)"
  grep -q "^API_USER_OTROUSUARIO=.\+" .api-secrets.local 2>/dev/null \
    || PENDIENTES+=("Completar API_USER_OTROUSUARIO — sin una segunda identidad no se puede probar IDOR")
else
  aviso ".api-secrets.local no existe todavía."
  printf '%s   cp .api-secrets.local.example .api-secrets.local%s\n' "$GRIS" "$FIN"
  PENDIENTES+=("Crear .api-secrets.local desde el .example y completar las identidades")
fi

# ─── 11. Marca de versión ────────────────────────────────────────────────
titulo "11. Marca de versión"

if [ "$DRY_RUN" = 1 ]; then
  info "se escribiría .claude/backend-testing-kit.version ($VERSION_KIT)"
else
  mkdir -p "$DESTINO/.claude"
  cat > "$MARCA_VERSION" <<EOF
# Versión del kit de testing de backend instalada en este repo.
# Generado por setup-backend-testing.sh — no editar a mano.
version=$VERSION_KIT
commit=$COMMIT_KIT
instalado=$(date +%Y-%m-%d)
origen=$KIT
EOF
  ok ".claude/backend-testing-kit.version → $VERSION_KIT ($COMMIT_KIT)"
fi

# ─── Resumen ─────────────────────────────────────────────────────────────
titulo "Resumen"

printf '%sCreados:     %d%s\n' "$VERDE" "${#CREADOS[@]}" "$FIN"
printf '%sModificados: %d%s\n' "$AMAR" "${#MODIFICADOS[@]}" "$FIN"
if [ ${#OMITIDOS[@]} -gt 0 ]; then
  printf '%sNo pisados (ya existían y difieren): %d%s\n' "$AMAR" "${#OMITIDOS[@]}" "$FIN"
  for f in "${OMITIDOS[@]}"; do printf '%s  - %s%s\n' "$GRIS" "$f" "$FIN"; done
fi

if [ ${#PENDIENTES[@]} -gt 0 ]; then
  titulo "Pendientes para vos"
  i=1; for p in "${PENDIENTES[@]}"; do printf '  %d. %s\n' "$i" "$p"; i=$((i+1)); done
fi

titulo "Siguientes pasos"
cat <<EOF
  1. cp .api-secrets.local.example .api-secrets.local   ${GRIS}# y completar${FIN}
     ${GRIS}API_BASE_URL=http://localhost:$PUERTO${FIN}
     ${GRIS}API_CONTRATO=${CONTRATO:-ninguno}${FIN}
  2. Levantar el servicio y su base de pruebas
  3. npm run test:api:smoke                             ${GRIS}# validar la instalación${FIN}
  4. Leer BACKEND_TESTING_STANDARDS.md ${GRIS}(una vez, entero)${FIN}
  5. En Claude Code:  ${NEGRITA}/backend-rigorous-tester probá la API de <recurso>${FIN}

  Prompts del día a día: BACKEND_PROMPTS.md
EOF

[ "$DRY_RUN" = 1 ] && aviso "Fue un dry-run: no se escribió nada."
exit 0
