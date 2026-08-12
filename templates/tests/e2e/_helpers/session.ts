/**
 * Sesión para los E2E, con cache en disco.
 *
 * El cache existe porque hacer login en cada test es lento y, si el endpoint
 * de login tiene rate-limit, una suite mediana lo agota a mitad de camino.
 *
 * ⚠️ COMPLETAR POR PROYECTO: `hacerLogin()` es lo único que cambia entre apps.
 * Hay dos variantes abajo (por API y por formulario) — dejá la que corresponda
 * y borrá la otra.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { BrowserContext, Page } from "@playwright/test";

/** Carga `.e2e-secrets.local` (gitignoreado) a `process.env`. */
function cargarSecretosLocales(): void {
  const candidatos = [
    path.resolve(process.cwd(), ".e2e-secrets.local"),
    path.resolve(process.cwd(), "../.e2e-secrets.local"),
  ];
  for (const p of candidatos) {
    if (!fs.existsSync(p)) continue;
    for (const linea of fs.readFileSync(p, "utf8").split("\n")) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
    return;
  }
}
cargarSecretosLocales();

export const E2E_USER = process.env.E2E_USER ?? "";
export const E2E_PASS = process.env.E2E_PASS ?? "";

/** Mensaje único para los `test.skip` — así el motivo queda claro en el reporte. */
export const MOTIVO_SIN_CREDENCIALES =
  "Faltan E2E_USER / E2E_PASS. Copiá .e2e-secrets.local.example a .e2e-secrets.local.";

export const hayCredenciales = (): boolean => Boolean(E2E_USER && E2E_PASS);

const RUTA_ESTADO = path.resolve(process.cwd(), ".e2e-session-state.json");
const VIGENCIA_MS = 10 * 60 * 1000; // 10 min

/* ────────────────────────────────────────────────────────────────────────
 * VARIANTE A — login por API (preferida)
 * Más rápida y más estable: no depende de la UI de login, que puede cambiar.
 * ──────────────────────────────────────────────────────────────────────── */
async function hacerLogin(context: BrowserContext): Promise<void> {
  const resp = await context.request.post("/api/auth/login", {
    data: { username: E2E_USER, password: E2E_PASS },
  });
  if (!resp.ok()) {
    const cuerpo = await resp.text().catch(() => "");
    throw new Error(
      `POST /api/auth/login devolvió ${resp.status()}. ` +
        `¿Está levantado el backend y son válidas las credenciales? ${cuerpo.slice(0, 200)}`,
    );
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * VARIANTE B — login por formulario
 * Usala si no hay endpoint de password grant. Más lenta y más frágil, pero
 * ejercita el login real (que también hay que probar, en su propio spec).
 *
 * async function hacerLogin(context: BrowserContext): Promise<void> {
 *   const page = await context.newPage();
 *   await page.goto("/login");
 *   await page.getByLabel("Usuario").fill(E2E_USER);
 *   await page.getByLabel("Contraseña").fill(E2E_PASS);
 *   await page.getByRole("button", { name: "Ingresar" }).click();
 *   await page.waitForURL((u) => !u.pathname.startsWith("/login"));
 *   await page.close();
 * }
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Deja el contexto con sesión iniciada. Reusa el estado en disco si sigue
 * vigente; si no, hace login y lo guarda.
 *
 *   test.beforeEach(async ({ context, page }) => {
 *     await asegurarSesion(context);
 *     await page.goto("/checkout");
 *   });
 */
export async function asegurarSesion(context: BrowserContext): Promise<void> {
  if (!hayCredenciales()) throw new Error(MOTIVO_SIN_CREDENCIALES);

  if (fs.existsSync(RUTA_ESTADO)) {
    const edad = Date.now() - fs.statSync(RUTA_ESTADO).mtimeMs;
    if (edad < VIGENCIA_MS) {
      try {
        const { cookies } = JSON.parse(fs.readFileSync(RUTA_ESTADO, "utf8"));
        if (Array.isArray(cookies) && cookies.length) {
          await context.addCookies(cookies);
          return;
        }
      } catch {
        /* estado corrupto: se ignora y se vuelve a loguear */
      }
    }
  }

  await hacerLogin(context);
  const cookies = await context.cookies();
  fs.writeFileSync(RUTA_ESTADO, JSON.stringify({ cookies }, null, 2));
}

/** Borra el cache. Útil en tests que necesitan una sesión limpia de verdad. */
export function invalidarSesion(): void {
  fs.rmSync(RUTA_ESTADO, { force: true });
}

/** Deja el contexto SIN sesión: para probar guards y redirecciones. */
export async function sinSesion(context: BrowserContext): Promise<void> {
  await context.clearCookies();
}

/** Simula que la sesión venció mientras el usuario estaba usando la app. */
export async function vencerSesion(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}
