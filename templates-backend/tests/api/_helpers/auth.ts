/**
 * Identidades y tokens.
 *
 * Dos responsabilidades:
 *
 *  1. **Tokens legítimos por rol**, cacheados. Un login por rol y por corrida:
 *     si cada test hace login, la suite tarda el triple y el rate limit del
 *     login se convierte en la causa de fallos aleatorios.
 *  2. **Tokens adversarios** — vencidos, mal firmados, `alg: none`, con claims
 *     manipulados. Son la materia prima de las pruebas de autenticación (§6 S2)
 *     y de escalada de privilegios (§6 S10).
 *
 * ⚠️ COMPLETAR POR PROYECTO: `hacerLogin()` es lo único que cambia entre apps.
 */
import { createHmac } from "node:crypto";
import { entorno } from "./entorno";

/** Roles del proyecto. Ampliar según el modelo de permisos real. */
export type Rol = "admin" | "operador" | "lector" | "otroUsuario" | "otroTenant";

interface Credencial {
  usuario: string;
  clave: string;
}

/**
 * Credenciales por rol, desde el entorno.
 *   API_USER_ADMIN / API_PASS_ADMIN, API_USER_OPERADOR / API_PASS_OPERADOR, ...
 *
 * `otroUsuario` y `otroTenant` no son opcionales aunque lo parezcan: sin una
 * segunda identidad no se puede probar IDOR, y sin IDOR la suite de seguridad
 * es decorativa.
 */
export function credencialDe(rol: Rol): Credencial | undefined {
  const sufijo = rol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const usuario = process.env[`API_USER_${sufijo}`];
  const clave = process.env[`API_PASS_${sufijo}`];
  return usuario && clave ? { usuario, clave } : undefined;
}

/**
 * ⚠️ COMPLETAR: el login real del proyecto.
 *
 * Devuelve el token que después viaja en `Authorization: Bearer <token>`.
 * Si la app usa cookies de sesión en vez de bearer, devolvé la cookie y
 * ajustá `cliente.ts` para mandarla como header `Cookie`.
 */
async function hacerLogin({ usuario, clave }: Credencial): Promise<string> {
  const { baseUrl } = entorno();

  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario, clave }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(
      `🔑 Login fallido para "${usuario}" (${res.status}). ` +
        "Esto es un problema de AMBIENTE o de credenciales, no un bug de la app. " +
        "Revisá .api-secrets.local y que el usuario exista en el ambiente de pruebas.",
    );
  }

  const datos = (await res.json()) as Record<string, unknown>;
  const token = datos.token ?? datos.access_token ?? datos.accessToken ?? datos.jwt;

  if (typeof token !== "string" || !token) {
    throw new Error(
      `🔑 El login respondió 200 pero no encontré el token en el cuerpo. ` +
        `Claves recibidas: ${Object.keys(datos).join(", ")}. Ajustá hacerLogin() en _helpers/auth.ts.`,
    );
  }
  return token;
}

const cache = new Map<string, Promise<string>>();

/** Token del rol, cacheado por corrida. `"anonimo"` devuelve `null`. */
export function tokenDe(rol: Rol | "anonimo"): Promise<string | null> {
  if (rol === "anonimo") return Promise.resolve(null);

  if (!cache.has(rol)) {
    const cred = credencialDe(rol);
    if (!cred) {
      const sufijo = rol.toUpperCase();
      return Promise.reject(
        new Error(
          `🔑 Falta la credencial del rol "${rol}". Definí API_USER_${sufijo} y API_PASS_${sufijo} ` +
            "en .api-secrets.local (ver .api-secrets.local.example).",
        ),
      );
    }
    cache.set(rol, hacerLogin(cred));
  }
  return cache.get(rol)!.then((t) => t);
}

/** Descarta el token cacheado: para probar reautenticación o rotación. */
export function olvidarToken(rol: Rol): void {
  cache.delete(rol);
}

// ─── Tokens adversarios ────────────────────────────────────────────────────

const b64url = (o: unknown): string =>
  Buffer.from(JSON.stringify(o)).toString("base64url");

const firmarHS256 = (cabecera: string, cuerpo: string, secreto: string): string =>
  createHmac("sha256", secreto).update(`${cabecera}.${cuerpo}`).digest("base64url");

/** Partes de un JWT ya emitido, sin verificar la firma. */
export function desarmarJwt(token: string): { cabecera: any; cuerpo: any; firma: string } {
  const partes = token.split(".");
  if (partes.length !== 3) throw new Error("El token no tiene forma de JWT (3 partes).");
  const leer = (p: string) => JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  return { cabecera: leer(partes[0]!), cuerpo: leer(partes[1]!), firma: partes[2]! };
}

/** No es un JWT. Prueba que el servidor no explote con basura. */
export const TOKEN_BASURA = "esto.no.esJWT";

/** JWT sintácticamente válido pero completamente inventado. */
export const TOKEN_INVENTADO = [
  b64url({ alg: "HS256", typ: "JWT" }),
  b64url({ sub: "999999", rol: "admin", exp: Math.floor(Date.now() / 1000) + 3600 }),
  "firmaInventadaQueNoValida",
].join(".");

/**
 * `alg: none` — el clásico. Un servidor que lo acepta deja entrar a cualquiera.
 * Se construye a partir de un token real para que los claims sean plausibles.
 */
export async function tokenAlgNone(rol: Rol = "admin"): Promise<string> {
  const real = await tokenDe(rol);
  if (!real) throw new Error("Hace falta un token real de base.");
  const { cuerpo } = desarmarJwt(real);
  return `${b64url({ alg: "none", typ: "JWT" })}.${b64url(cuerpo)}.`;
}

/** Token real con la firma alterada. Debe dar 401 siempre. */
export async function tokenFirmaInvalida(rol: Rol = "operador"): Promise<string> {
  const real = await tokenDe(rol);
  if (!real) throw new Error("Hace falta un token real de base.");
  const [c, p, f] = real.split(".");
  const alterada = (f ?? "").split("").reverse().join("") || "xxxx";
  return `${c}.${p}.${alterada}`;
}

/**
 * Token vencido, **correctamente firmado**.
 *
 * Requiere el secreto de firma del ambiente de pruebas (`API_JWT_SECRET`) o un
 * token vencido pre-emitido (`API_TOKEN_EXPIRADO`). Sin una de las dos cosas
 * lanza, en vez de devolver un token mal firmado: un 401 por firma inválida
 * NO prueba que el servidor valide la expiración, y un test que no distingue
 * las dos causas da confianza falsa.
 */
export async function tokenExpirado(rol: Rol = "operador"): Promise<string> {
  const preEmitido = process.env.API_TOKEN_EXPIRADO;
  if (preEmitido) return preEmitido;

  const secreto = process.env.API_JWT_SECRET;
  if (!secreto) {
    throw new Error(
      "🔑 Para probar expiración hace falta API_JWT_SECRET (secreto del ambiente de PRUEBAS) " +
        "o API_TOKEN_EXPIRADO (token vencido pre-emitido).\n" +
        "   Sin eso sólo se puede mandar un token mal firmado, y un 401 por firma no prueba " +
        "que el servidor valide `exp`. Ver §6 S2 del estándar.",
    );
  }

  const real = await tokenDe(rol);
  if (!real) throw new Error("Hace falta un token real de base.");
  const { cabecera, cuerpo } = desarmarJwt(real);
  const ayer = Math.floor(Date.now() / 1000) - 86_400;
  const c = b64url({ ...cabecera, alg: "HS256" });
  const p = b64url({ ...cuerpo, exp: ayer, iat: ayer - 3600 });
  return `${c}.${p}.${firmarHS256(c, p, secreto)}`;
}

/**
 * Token con claims manipulados y **bien firmado con otro secreto**: simula a un
 * atacante que forjó su propio token. Debe dar 401.
 */
export async function tokenDeOtroEmisor(cambios: Record<string, unknown> = { rol: "admin" }): Promise<string> {
  const real = await tokenDe("lector").catch(() => null);
  const base = real ? desarmarJwt(real).cuerpo : { sub: "1" };
  const c = b64url({ alg: "HS256", typ: "JWT" });
  const p = b64url({ ...base, ...cambios, exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${c}.${p}.${firmarHS256(c, p, "secreto-del-atacante")}`;
}

/**
 * Escalada de privilegios: token **legítimamente firmado** (secreto del
 * ambiente de pruebas) con los claims cambiados. Si la app confía en el claim
 * `rol` del token sin revalidar contra la base, este token entra como admin.
 *
 * Sólo funciona con HS256. Con RS256 no se puede forjar sin la clave privada,
 * y eso ya es una mitigación: anotalo en el reporte y probá S10 por endpoint.
 */
export async function tokenConClaims(cambios: Record<string, unknown>, rol: Rol = "lector"): Promise<string> {
  const secreto = process.env.API_JWT_SECRET;
  if (!secreto) {
    throw new Error(
      "🔑 tokenConClaims() necesita API_JWT_SECRET del ambiente de PRUEBAS. " +
        "Si la app firma con RS256, esta prueba no aplica: anotalo como mitigación en el reporte.",
    );
  }
  const real = await tokenDe(rol);
  if (!real) throw new Error("Hace falta un token real de base.");
  const { cuerpo } = desarmarJwt(real);
  const c = b64url({ alg: "HS256", typ: "JWT" });
  const p = b64url({ ...cuerpo, ...cambios });
  return `${c}.${p}.${firmarHS256(c, p, secreto)}`;
}
