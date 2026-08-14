/**
 * Configuración del entorno y guardarraíl anti-producción.
 *
 * Este archivo existe por una sola razón: el día que alguien exporte la
 * variable equivocada, esto es lo único que hay entre el test de borrado
 * masivo y los datos reales.
 *
 * Se ejecuta al importar el cliente HTTP, así que no hay forma de saltearlo
 * por olvido — que es exactamente el punto (§12 del estándar).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Hosts que se consideran seguros para escribir datos. */
const PISTAS_SEGURAS: RegExp[] = [
  /localhost/i,
  /^127\./,
  /^\[?::1\]?$/,
  /\.local(host)?$/i,
  /\.test$/i,
  /(^|[.\-_])(dev|desa|desarrollo|qa|stg|staging|sandbox|uat|test|pruebas|ephemeral)([.\-_]|$)/i,
];

/** Hosts que se consideran producción. Ante una coincidencia, se corta. */
const PISTAS_PRODUCCION: RegExp[] = [
  /(^|[.\-_])prod(uccion|uction)?([.\-_]|$)/i,
  /(^|\.)www\./i,
  /(^|\.)api\.[^.]+\.(com|net|org|io|app|py|ar|br)$/i,
];

export type Clasificacion = "seguro" | "produccion" | "desconocido";

export function clasificarUrl(url: string): Clasificacion {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return "desconocido";
  }
  if (PISTAS_SEGURAS.some((r) => r.test(host))) return "seguro";
  if (PISTAS_PRODUCCION.some((r) => r.test(host))) return "produccion";
  return "desconocido";
}

/**
 * Carga `.api-secrets.local` a `process.env` sin pisar lo que ya venga del
 * entorno (en CI mandan los secrets del runner).
 *
 * Parser mínimo a propósito: una dependencia menos que auditar, y el formato
 * es `CLAVE=valor`. Sin sustitución de variables, sin multilínea.
 */
export function cargarSecretos(archivo = ".api-secrets.local"): void {
  const ruta = resolve(process.cwd(), archivo);
  if (!existsSync(ruta)) return;

  for (const linea of readFileSync(ruta, "utf8").split("\n")) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const corte = limpia.indexOf("=");
    if (corte < 1) continue;
    const clave = limpia.slice(0, corte).trim();
    const valor = limpia.slice(corte + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[clave] === undefined) process.env[clave] = valor;
  }
}

export interface Entorno {
  /** URL base del servicio bajo prueba, sin barra final. */
  baseUrl: string;
  clasificacion: Clasificacion;
  /** Ruta al contrato OpenAPI/JSON Schema, o `"ninguno"` si se declaró que no hay. */
  contrato: string;
  /** Identificador de esta corrida — siembra los datos únicos. */
  runId: string;
  /** `true` si se permitió explícitamente correr contra producción. */
  produccionPermitida: boolean;
}

let cache: Entorno | undefined;

/**
 * Devuelve la configuración validada. Corta la corrida si la URL base parece
 * producción y nadie lo autorizó explícitamente.
 */
export function entorno(): Entorno {
  if (cache) return cache;

  cargarSecretos();

  const baseUrl = (process.env.API_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const clasificacion = clasificarUrl(baseUrl);
  const produccionPermitida = process.env.API_PERMITIR_PRODUCCION === "1";

  if (clasificacion === "produccion" && !produccionPermitida) {
    throw new Error(
      [
        "",
        "🛑 GUARDARRAÍL: la URL base parece PRODUCCIÓN y la suite escribe datos.",
        `   API_BASE_URL = ${baseUrl}`,
        "",
        "   Si es un error, apuntá a un ambiente de pruebas.",
        "   Si de verdad querés correr @smoke de sólo lectura contra producción,",
        "   exportá API_PERMITIR_PRODUCCION=1 y dejalo escrito en el reporte.",
        "",
      ].join("\n"),
    );
  }

  if (clasificacion === "desconocido") {
    console.warn(
      `⚠️  No pude clasificar el ambiente de ${baseUrl}. Si es producción, PARÁ AHORA.\n` +
        "   Agregá una pista al nombre del host (qa/staging/dev) o declaralo en el reporte.",
    );
  }

  if (clasificacion === "produccion" && produccionPermitida) {
    console.warn("⚠️  Corriendo contra PRODUCCIÓN con permiso explícito. Sólo lectura.");
  }

  cache = {
    baseUrl,
    clasificacion,
    contrato: process.env.API_CONTRATO ?? "openapi.yaml",
    runId: process.env.API_RUN_ID ?? String(Date.now() % 1_000_000),
    produccionPermitida,
  };
  return cache;
}

/**
 * Barrera para operaciones destructivas (`@destructivo`): borrados masivos,
 * truncados, reseteos. Sólo pasan en un ambiente clasificado como seguro.
 *
 *   test("@destructivo purga de facturas viejas", async () => {
 *     exigirAmbienteEfimero();
 *     ...
 *   });
 */
export function exigirAmbienteEfimero(): void {
  const { clasificacion, baseUrl } = entorno();
  if (clasificacion !== "seguro") {
    throw new Error(
      `🛑 Operación @destructivo bloqueada: ${baseUrl} no está clasificado como ambiente seguro ` +
        `(es "${clasificacion}"). Estas pruebas sólo corren en un ambiente efímero o local.`,
    );
  }
}

/** Claves cuyo valor nunca debe aparecer en evidencia, logs ni reportes. */
export const CLAVES_SENSIBLES = /^(authorization|cookie|set-cookie|x-api-key|password|pass|token|secret|refresh_token|clave)$/i;

/** Reemplaza valores sensibles por `****`. Se aplica a todo lo que se imprime. */
export function redactar<T>(valor: T): T {
  if (Array.isArray(valor)) return valor.map(redactar) as unknown as T;
  if (valor && typeof valor === "object") {
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      salida[k] = CLAVES_SENSIBLES.test(k) ? "****" : redactar(v);
    }
    return salida as unknown as T;
  }
  if (typeof valor === "string" && /^Bearer\s+\S+/i.test(valor)) return "Bearer ****" as unknown as T;
  return valor;
}
