#!/usr/bin/env bash
#
# setup-testing.sh — instala el kit de testing agentic en un repo.
#
#   bash /ruta/al/kit/setup-testing.sh [directorio-destino]
#
# Sin argumento, instala en el directorio actual.
#
# Es idempotente: se puede correr las veces que haga falta. Nunca pisa un
# archivo existente sin avisar; de lo que modifica, deja `.bak`.
#
# Para actualizar el kit en un repo que ya lo tiene:
#   git -C /ruta/al/kit pull && bash /ruta/al/kit/setup-testing.sh /repo
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
    -h|--help) sed -n '2,22p' "$0" | sed 's/^# \?//'; exit 0 ;;
    -*) error "Opción desconocida: $1"; exit 1 ;;
    *)  DESTINO="$1" ;;
  esac
  shift
done

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Versión del kit: VERSION + el commit desde el que se instala. Queda anotada
# en el repo destino para saber, meses después, qué versión tiene cada proyecto.
VERSION_KIT="$(cat "$KIT/VERSION" 2>/dev/null || echo "0.0.0")"
COMMIT_KIT="$(git -C "$KIT" rev-parse --short HEAD 2>/dev/null || echo "sin-git")"

if [ "${VER_SOLO:-0}" = 1 ]; then
  printf 'kit de testing agentic %s (%s)\n' "$VERSION_KIT" "$COMMIT_KIT"
  exit 0
fi

DESTINO="$(cd "${DESTINO:-$PWD}" && pwd)"

[ "$KIT" = "$DESTINO" ] && { error "El destino no puede ser el propio kit."; exit 1; }

MARCA_VERSION="$DESTINO/.claude/testing-kit.version"
VERSION_PREVIA="$(sed -n 's/^version=//p' "$MARCA_VERSION" 2>/dev/null || true)"
# Sólo un sha: la marca vive en el repo destino, y el valor termina como argumento de git.
COMMIT_PREVIO="$(sed -n 's/^commit=\([0-9a-f]\{4,40\}\)$/\1/p' "$MARCA_VERSION" 2>/dev/null || true)"

titulo "Kit de testing agentic $VERSION_KIT ($COMMIT_KIT)"
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

# El <ruta-en-el-kit> que instaló la versión anterior del kit, según el commit
# anotado en .claude/testing-kit.version. Falla si no se puede saber: sin marca,
# un kit sin git, o un commit que este clon del kit no tiene.
anterior_del_kit() {
  [ -n "$COMMIT_PREVIO" ] && git -C "$KIT" show "$COMMIT_PREVIO:$1" 2>/dev/null
}

# copiar <origen-relativo-al-kit> <destino-relativo> [--siempre | --si-no-lo-editaron]
#
# Sin modo, un archivo que ya existe no se toca. --siempre lo pisa (deja .bak):
# es del kit. --si-no-lo-editaron lo pisa sólo si es el que instaló la versión
# anterior del kit; si el repo lo editó, lo respeta y dice qué cambió el kit.
copiar() {
  local origen="$KIT/$1" destino="$DESTINO/$2" modo="${3:-}"
  [ -f "$origen" ] || { error "Falta en el kit: $1"; return 1; }

  if [ -f "$destino" ] && [ "$modo" = "--si-no-lo-editaron" ] && [ "$FORZAR" != 1 ] \
     && ! cmp -s "$origen" "$destino"; then
    if ! anterior_del_kit "$1" >/dev/null; then
      OMITIDOS+=("$2")
      aviso "$2 difiere del kit y no hay cómo saber si el repo lo editó — NO se pisó."
      PENDIENTES+=("Compará \`$2\` con el del kit (diff '$origen' '$destino'); si no tiene nada del repo: cp '$origen' '$destino'")
      return 0
    fi
    if ! anterior_del_kit "$1" | cmp -s - "$destino"; then
      if anterior_del_kit "$1" | cmp -s - "$origen"; then
        info "$2 (con cambios del repo; el kit no lo cambió desde $COMMIT_PREVIO)"
      else
        OMITIDOS+=("$2")
        aviso "$2 tiene cambios del repo — NO se pisó."
        PENDIENTES+=("Traé a \`$2\` lo que cambió el kit desde tu versión: git -C '$KIT' diff $COMMIT_PREVIO -- $1")
      fi
      return 0
    fi
  fi

  if [ -f "$destino" ] && [ -z "$modo" ] && [ "$FORZAR" != 1 ]; then
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
  error "Node $(node -v) — hace falta ≥ 20 (Playwright lo requiere)."
  exit 1
fi
ok "Node $(node -v)"

if [ ! -f package.json ]; then
  error "No hay package.json en $DESTINO. ¿Es la raíz del proyecto frontend?"
  exit 1
fi
ok "package.json encontrado"

git -C "$DESTINO" rev-parse --show-toplevel >/dev/null 2>&1 \
  && ok "repo git: $(git -C "$DESTINO" rev-parse --show-toplevel)" \
  || aviso "No es un repo git — los tests no van a quedar versionados"

# ─── 2. Detección del proyecto ───────────────────────────────────────────
titulo "2. Detección del proyecto"

FRAMEWORK="desconocido"; PUERTO="5173"
if   [ -f next.config.js ] || [ -f next.config.mjs ] || [ -f next.config.ts ]; then
  FRAMEWORK="next"; PUERTO="3000"
elif [ -f nuxt.config.ts ] || [ -f nuxt.config.js ]; then
  FRAMEWORK="nuxt"; PUERTO="3000"
elif ls vite.config.* >/dev/null 2>&1; then
  FRAMEWORK="vite"; PUERTO="5173"
elif grep -q '"react-scripts"' package.json 2>/dev/null; then
  FRAMEWORK="cra"; PUERTO="3000"
fi

# Puerto explícito en el script `dev`, si lo hay
PUERTO_DEV="$(node -e '
  try {
    const p = require("./package.json").scripts || {};
    const dev = p.dev || p.start || "";
    const m = dev.match(/--port[= ](\d+)|-p[= ](\d+)|PORT=(\d+)/);
    if (m) process.stdout.write(m[1] || m[2] || m[3]);
  } catch {}
' 2>/dev/null || true)"
[ -n "$PUERTO_DEV" ] && PUERTO="$PUERTO_DEV"

ok "framework: $FRAMEWORK · puerto asumido: $PUERTO"
[ "$FRAMEWORK" = "desconocido" ] && PENDIENTES+=("Verificar el puerto y el comando \`webServer\` en playwright.config.ts")

# ─── 3. Dependencias ─────────────────────────────────────────────────────
titulo "3. Playwright"

if [ "$SIN_NPM" = 1 ]; then
  info "omitido por --sin-npm"
elif [ -d node_modules/@playwright/test ]; then
  ok "@playwright/test ya instalado ($(node -p "require('@playwright/test/package.json').version" 2>/dev/null || echo '?'))"
else
  info "instalando @playwright/test…"
  ejecutar npm install -D @playwright/test
  ok "@playwright/test instalado"
fi

if [ "$SIN_NPM" = 1 ]; then
  info "navegador: omitido por --sin-npm"
elif [ "$DRY_RUN" = 1 ]; then
  info "npx playwright install chromium"
else
  info "instalando Chromium (puede tardar)…"
  npx --yes playwright install chromium >/dev/null 2>&1 && ok "Chromium instalado" \
    || aviso "No se pudo instalar Chromium. Correr a mano: npx playwright install chromium"
fi

# ─── 4. Configuración ────────────────────────────────────────────────────
titulo "4. Configuración"

if [ -f playwright.config.ts ] || [ -f playwright.config.js ]; then
  aviso "Ya existe playwright.config — NO se pisó."
  CFG="$(ls playwright.config.* | head -1)"
  for clave in forbidOnly 'trace' testIdAttribute; do
    grep -q "$clave" "$CFG" || PENDIENTES+=("Agregar \`$clave\` a $CFG (§6 del estándar)")
  done
  grep -q 'retries.*2' "$CFG" && PENDIENTES+=("$CFG usa retries: 2 — el estándar pide 1 (§6)")
else
  copiar templates/playwright.config.ts playwright.config.ts
  if [ "$PUERTO" != "5173" ] && [ "$DRY_RUN" = 0 ]; then
    ejecutar sed -i.tmp "s|localhost:5173|localhost:$PUERTO|g" playwright.config.ts
    ejecutar rm -f playwright.config.ts.tmp
    ok "puerto ajustado a $PUERTO"
  fi
  PENDIENTES+=("Revisar \`webServer.command\` en playwright.config.ts (asumido: npm run dev)")
fi

# ─── 5. Estructura de tests ──────────────────────────────────────────────
titulo "5. Estructura de tests"

ejecutar mkdir -p tests/e2e/_helpers tests/e2e/fixtures docs/qa/mapa docs/qa/reportes

copiar templates/tests/e2e/_helpers/session.ts   tests/e2e/_helpers/session.ts
copiar templates/tests/e2e/_helpers/evidencia.ts tests/e2e/_helpers/evidencia.ts
copiar templates/tests/e2e/_helpers/red.ts       tests/e2e/_helpers/red.ts
copiar templates/tests/e2e/_helpers/datos.ts     tests/e2e/_helpers/datos.ts
copiar templates/tests/e2e/fixtures/index.ts     tests/e2e/fixtures/index.ts
copiar templates/tests/e2e/REFERENCIA.md         tests/e2e/REFERENCIA.md --siempre
copiar templates/tests/e2e/smoke.spec.ts         tests/e2e/smoke.spec.ts
copiar templates/.e2e-secrets.local.example      .e2e-secrets.local.example

[ "$DRY_RUN" = 0 ] && { [ -f docs/qa/mapa/.gitkeep ] || touch docs/qa/mapa/.gitkeep; \
                        [ -f docs/qa/reportes/.gitkeep ] || touch docs/qa/reportes/.gitkeep; }

# ─── 6. Skills y agentes ─────────────────────────────────────────────────
titulo "6. Skills y agentes"

ejecutar mkdir -p .claude/skills .claude/agents

for skill in human-tester explore-app generate-playwright-tests self-heal-tests \
             enforce-standards team-onboarding regression-suite; do
  copiar ".claude/skills/$skill/SKILL.md" ".claude/skills/$skill/SKILL.md" --siempre
done

for agente in explorer-agent test-writer-agent healer-agent reviewer-agent; do
  copiar ".claude/agents/$agente.md" ".claude/agents/$agente.md" --siempre
done

# ─── 7. Documentos del estándar ──────────────────────────────────────────
titulo "7. Documentos del estándar"

# El §10 del estándar pide documentar cada excepción en el mismo archivo, así que
# TESTING_STANDARDS.md lleva cosas del repo. Hasta 1.0.2 se pisaba en cada
# actualización y las excepciones se perdían, con un `.bak` como único rastro.
copiar TESTING_STANDARDS.md TESTING_STANDARDS.md --si-no-lo-editaron
copiar PROMPTS.md           PROMPTS.md           --siempre

# El contrato de los agentes va a docs/qa/, al lado de los mapas y los reportes
# que producen esos agentes. La raíz no se toca: `AGENTS.md` es el archivo que
# Codex, Cursor y Copilot leen como las reglas del repo —y Claude Code, cuando
# CLAUDE.md lo importa—, así que es del proyecto, no del kit. Hasta 1.0.1 se
# pisaba en cada actualización, y un repo con sus reglas ahí las perdía.
copiar AGENTS.md docs/qa/CONTRATO-DE-LOS-AGENTES.md --siempre

if [ ! -f AGENTS.md ]; then
  PENDIENTES+=("Este repo no tiene AGENTS.md (las reglas que lee cualquier IA). Si lo creás, que apunte a \`docs/qa/CONTRATO-DE-LOS-AGENTES.md\`")
elif [ "$(head -n 1 AGENTS.md)" = "$(head -n 1 "$KIT/AGENTS.md")" ]; then
  aviso "AGENTS.md es la copia del contrato que instalaba el kit hasta 1.0.1 — NO se tocó."
  PENDIENTES+=("Tu AGENTS.md es el contrato viejo del kit, que ahora vive en \`docs/qa/CONTRATO-DE-LOS-AGENTES.md\`: reemplazalo por las reglas del repo")
elif ! grep -q "docs/qa/CONTRATO-DE-LOS-AGENTES.md" AGENTS.md; then
  PENDIENTES+=("Referenciá \`docs/qa/CONTRATO-DE-LOS-AGENTES.md\` desde tu AGENTS.md")
fi

# Los archivos que Claude Code carga como instrucciones del repo: CLAUDE.md, lo
# que importa con `@ruta` (fuera de bloques de código, hasta cinco saltos) y
# .claude/rules/. Hasta 1.0.2 se miraba sólo CLAUDE.md, y uno que dice sólo
# `@AGENTS.md` parecía no nombrar el estándar aunque AGENTS.md lo nombrara.
instrucciones_de_claude() {
  local cola="CLAUDE.md" siguiente archivo dir ruta vistos="|" salto=0
  if [ -d .claude/rules ]; then
    cola="$cola"$'\n'"$(find .claude/rules -type f -name '*.md')"
  fi
  while [ -n "$cola" ] && [ "$salto" -le 5 ]; do
    siguiente=""
    while IFS= read -r archivo; do
      [ -f "$archivo" ] || continue
      case "$vistos" in *"|$archivo|"*) continue ;; esac
      vistos="$vistos$archivo|"
      printf '%s\n' "$archivo"
      dir="$(dirname "$archivo")"
      while IFS= read -r ruta; do
        case "$ruta" in
          /*) ;;
          \~/*) ruta="$HOME/${ruta#\~/}" ;;
          *) ruta="$dir/$ruta" ;;
        esac
        siguiente="$siguiente$ruta"$'\n'
      done < <(awk '/^[ \t]*(```|~~~)/ { codigo = !codigo; next }
                    !codigo { for (i = 1; i <= NF; i++) if ($i ~ /^@[^@]/) print substr($i, 2) }' "$archivo")
    done <<< "$cola"
    cola="$siguiente"
    salto=$((salto + 1))
  done
}

nombra_el_estandar() {
  local archivo
  while IFS= read -r archivo; do
    grep -q "TESTING_STANDARDS" "$archivo" && return 0
  done < <(instrucciones_de_claude)
  return 1
}

if [ -f CLAUDE.md ]; then
  aviso "Ya existe CLAUDE.md — NO se pisó."
  if ! nombra_el_estandar; then
    copiar CLAUDE.md .claude/CLAUDE-testing.md --siempre
    PENDIENTES+=("Fusionar \`.claude/CLAUDE-testing.md\` con las reglas del repo (tu CLAUDE.md, o el AGENTS.md que importa), o referenciarlo")
  fi
else
  copiar CLAUDE.md CLAUDE.md
fi

# ─── 8. Scripts npm ──────────────────────────────────────────────────────
titulo "8. Scripts npm"

if [ "$DRY_RUN" = 1 ]; then
  info "se agregarían: test:e2e, test:e2e:smoke, test:e2e:critico, test:e2e:ui, test:e2e:repite, test:e2e:report"
else
  node - <<'JS'
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.scripts = pkg.scripts || {};

const nuevos = {
  "test:e2e":         "playwright test",
  "test:e2e:smoke":   "playwright test --grep @smoke",
  "test:e2e:critico": "playwright test --grep \"@smoke|@critico\"",
  "test:e2e:ui":      "playwright test --ui",
  "test:e2e:repite":  "playwright test --repeat-each=3",
  "test:e2e:report":  "playwright show-report",
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

IGNORAR=(".e2e-secrets.local" ".e2e-session-state.json" "test-results/"
         "playwright-report/" "playwright/.cache/" ".playwright-mcp/")

if [ "$DRY_RUN" = 1 ]; then
  info "se agregarían: ${IGNORAR[*]}"
else
  [ -f .gitignore ] || touch .gitignore
  FALTAN=()
  for pat in "${IGNORAR[@]}"; do
    grep -qxF "$pat" .gitignore || FALTAN+=("$pat")
  done
  if [ ${#FALTAN[@]} -gt 0 ]; then
    { echo ""; echo "# Testing E2E (kit agentic)"; printf '%s\n' "${FALTAN[@]}"; } >> .gitignore
    ok "agregados a .gitignore: ${FALTAN[*]}"
  else
    info ".gitignore ya cubre todo"
  fi

  if git -C "$DESTINO" rev-parse --git-dir >/dev/null 2>&1; then
    if git -C "$DESTINO" ls-files --error-unmatch .e2e-secrets.local >/dev/null 2>&1; then
      error "PARAR: .e2e-secrets.local está TRACKEADO en git. Sacalo ya:"
      error "  git rm --cached .e2e-secrets.local"
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
      printf '%s     !.claude/testing-kit.version%s\n' "$GRIS" "$FIN"
      PENDIENTES+=("Destapar .claude/skills, .claude/agents y .claude/testing-kit.version en .gitignore")
    fi
  fi
fi

# ─── 10. MCP de Playwright ───────────────────────────────────────────────
titulo "10. MCP de Playwright"

if command -v claude >/dev/null 2>&1; then
  if claude mcp list 2>/dev/null | grep -qi playwright; then
    ok "MCP de Playwright configurado"
  else
    aviso "MCP de Playwright NO configurado — sin esto los agentes no pueden explorar."
    printf '%s   claude mcp add playwright -- npx -y @playwright/mcp@latest%s\n' "$GRIS" "$FIN"
    PENDIENTES+=("Configurar el MCP de Playwright: claude mcp add playwright -- npx -y @playwright/mcp@latest")
  fi
else
  info "CLI de claude no encontrado — verificá el MCP a mano"
fi

# ─── 11. Marca de versión ────────────────────────────────────────────────
titulo "11. Marca de versión"

if [ "$DRY_RUN" = 1 ]; then
  info "se escribiría .claude/testing-kit.version ($VERSION_KIT)"
else
  mkdir -p "$DESTINO/.claude"
  cat > "$MARCA_VERSION" <<EOF
# Versión del kit de testing agentic instalada en este repo.
# Generado por setup-testing.sh — no editar a mano.
version=$VERSION_KIT
commit=$COMMIT_KIT
instalado=$(date +%Y-%m-%d)
origen=$KIT
EOF
  ok ".claude/testing-kit.version → $VERSION_KIT ($COMMIT_KIT)"
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
  1. cp .e2e-secrets.local.example .e2e-secrets.local   ${GRIS}# y completar${FIN}
  2. npm run dev                                        ${GRIS}# levantar la app${FIN}
  3. npm run test:e2e:smoke                             ${GRIS}# validar la instalación${FIN}
  4. Leer TESTING_STANDARDS.md ${GRIS}(una vez, entero)${FIN}
  5. En Claude Code:  ${NEGRITA}/human-tester probá el flujo de login${FIN}

  Prompts del día a día: PROMPTS.md
EOF

[ "$DRY_RUN" = 1 ] && aviso "Fue un dry-run: no se escribió nada."
exit 0
