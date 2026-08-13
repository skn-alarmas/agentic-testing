/**
 * Cliente HTTP de los tests.
 *
 * Resuelve tres cosas que, hechas a mano, se hacen mal en todos los proyectos:
 *
 *  1. **El mensaje de error.** `expected 201, got 400` sin el cuerpo obliga a
 *     reproducir a mano. Acá el fallo imprime método, ruta, rol, código y
 *     cuerpo — redactados.
 *  2. **La evidencia.** Cada llamada queda registrada para el reporte, sin
 *     secretos.
 *  3. **El rol.** `api.como("operador")` hace explícito con qué identidad actúa
 *     cada request. Un test que no dice con qué rol actúa no se puede revisar.
 *
 * Importar el cliente activa el guardarraíl anti-producción de `entorno.ts`.
 */
import { entorno, redactar } from "./entorno";
import { tokenDe, type Rol } from "./auth";

export interface Respuesta<T = any> {
  status: number;
  headers: Record<string, string>;
  /** Cuerpo parseado. `any` a propósito: en tests, castear cada acceso es ruido. */
  cuerpo: T;
  /** Cuerpo sin parsear — para cuando la respuesta no es JSON. */
  texto: string;
  /** Duración de la llamada. Para diagnóstico, NO para aserciones de performance. */
  ms: number;
  peticion: { metodo: string; ruta: string; rol: string };
}

export interface OpcionesPeticion {
  cuerpo?: unknown;
  /** Query string. Los valores se codifican solos. */
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  /** Token crudo. Pisa el del rol — se usa para los tokens adversarios. */
  token?: string | null;
  /** Manda el cuerpo tal cual, sin `JSON.stringify`: para probar JSON malformado. */
  cuerpoCrudo?: string;
  /** Corta la llamada a los N ms. Por defecto 10 s. */
  timeoutMs?: number;
}

/**
 * Registro de las llamadas, para la evidencia del reporte.
 *
 * Es **por archivo de tests**: Vitest aísla cada archivo en su propio worker,
 * así que no hay una bitácora global de la corrida. Sirve para diagnosticar un
 * archivo, no para el resumen final.
 */
export const BITACORA: Array<{
  metodo: string;
  ruta: string;
  rol: string;
  status: number;
  ms: number;
}> = [];

const METODOS_SIN_CUERPO = new Set(["GET", "HEAD"]);

export class ClienteApi {
  constructor(
    private readonly rol: Rol | "anonimo" = "anonimo",
    private readonly headersBase: Record<string, string> = {},
  ) {}

  /** Devuelve un cliente que actúa con la identidad de ese rol. */
  como(rol: Rol | "anonimo"): ClienteApi {
    return new ClienteApi(rol, this.headersBase);
  }

  /** Devuelve un cliente con headers fijos extra (tenant, idioma, trazas). */
  conHeaders(headers: Record<string, string>): ClienteApi {
    return new ClienteApi(this.rol, { ...this.headersBase, ...headers });
  }

  get<T = any>(ruta: string, o: OpcionesPeticion = {}) { return this.peticion<T>("GET", ruta, o); }
  post<T = any>(ruta: string, o: OpcionesPeticion = {}) { return this.peticion<T>("POST", ruta, o); }
  put<T = any>(ruta: string, o: OpcionesPeticion = {}) { return this.peticion<T>("PUT", ruta, o); }
  patch<T = any>(ruta: string, o: OpcionesPeticion = {}) { return this.peticion<T>("PATCH", ruta, o); }
  delete<T = any>(ruta: string, o: OpcionesPeticion = {}) { return this.peticion<T>("DELETE", ruta, o); }
  /** Verbos raros: para probar que un método no soportado da 405 y no 500. */
  metodo<T = any>(m: string, ruta: string, o: OpcionesPeticion = {}) { return this.peticion<T>(m, ruta, o); }

  async peticion<T = any>(metodo: string, ruta: string, o: OpcionesPeticion = {}): Promise<Respuesta<T>> {
    const { baseUrl } = entorno();
    const url = new URL(ruta.startsWith("http") ? ruta : baseUrl + ruta);
    for (const [k, v] of Object.entries(o.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }

    const headers: Record<string, string> = { Accept: "application/json", ...this.headersBase, ...o.headers };

    // `token: null` explícito = petición anónima aunque el cliente tenga rol.
    const token = o.token !== undefined ? o.token : await tokenDe(this.rol);
    if (token) headers.Authorization = `Bearer ${token}`;

    let body: string | undefined;
    if (o.cuerpoCrudo !== undefined) {
      body = o.cuerpoCrudo;
      headers["Content-Type"] ??= "application/json";
    } else if (o.cuerpo !== undefined && !METODOS_SIN_CUERPO.has(metodo.toUpperCase())) {
      body = JSON.stringify(o.cuerpo);
      headers["Content-Type"] ??= "application/json";
    }

    const inicio = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method: metodo.toUpperCase(),
        headers,
        body,
        signal: AbortSignal.timeout(o.timeoutMs ?? 10_000),
        redirect: "manual", // un 302 inesperado es un hallazgo, no algo a seguir
      });
    } catch (e) {
      const causa = e instanceof Error ? e.message : String(e);
      throw new Error(
        `🔌 ${metodo.toUpperCase()} ${ruta} no llegó a responder: ${causa}\n` +
          `   Base: ${baseUrl}\n` +
          "   ¿El servicio está levantado? Esto es un problema de AMBIENTE, no un bug de la app.",
      );
    }
    const ms = Date.now() - inicio;

    const texto = await res.text();
    let cuerpo: unknown = texto;
    const tipo = res.headers.get("content-type") ?? "";
    if (tipo.includes("json") && texto) {
      try {
        cuerpo = JSON.parse(texto);
      } catch {
        cuerpo = { _parseoFallido: true, _crudo: texto.slice(0, 500) };
      }
    }

    const headersPlanos: Record<string, string> = {};
    res.headers.forEach((v, k) => { headersPlanos[k] = v; });

    BITACORA.push({ metodo: metodo.toUpperCase(), ruta, rol: this.rol, status: res.status, ms });

    return {
      status: res.status,
      headers: headersPlanos,
      cuerpo: cuerpo as T,
      texto,
      ms,
      peticion: { metodo: metodo.toUpperCase(), ruta, rol: this.rol },
    };
  }
}

/** Cliente anónimo. Para actuar con identidad: `api.como("operador")`. */
export const api = new ClienteApi();

/**
 * Aserción de código con mensaje útil. Preferila a `expect(res.status).toBe(n)`
 * cuando el cuerpo del error importa para diagnosticar.
 *
 *   exigirStatus(res, 201);
 *
 * No reemplaza a las aserciones del test: es para el paso Arrange, donde una
 * precondición que falla tiene que decir por qué.
 */
export function exigirStatus(res: Respuesta, esperado: number | number[]): void {
  const ok = Array.isArray(esperado) ? esperado.includes(res.status) : res.status === esperado;
  if (ok) return;
  const { metodo, ruta, rol } = res.peticion;
  throw new Error(
    [
      `❌ ${metodo} ${ruta} (rol: ${rol})`,
      `   esperado: ${Array.isArray(esperado) ? esperado.join(" | ") : esperado}`,
      `   obtenido: ${res.status}`,
      `   cuerpo:   ${JSON.stringify(redactar(res.cuerpo)).slice(0, 800)}`,
    ].join("\n"),
  );
}

/** Resumen de la corrida para el reporte. Sin secretos: usa la bitácora. */
export function resumenBitacora(): string {
  const porStatus = BITACORA.reduce<Record<number, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(porStatus)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([status, n]) => `${status}: ${n}`)
    .join(" · ");
}
