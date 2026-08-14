/**
 * La fuente de verdad — capa 3 de la aserción (§3).
 *
 * Por qué existe: un endpoint puede devolver 201 con un cuerpo perfecto y no
 * haber guardado nada (commit que falla después de responder, transacción que
 * hace rollback, cola que se pierde). Preguntarle a la respuesta que estás
 * probando si hizo bien su trabajo es preguntarle al acusado si es inocente.
 *
 * Dos implementaciones:
 *
 *  · `fuenteViaApi()`  — lee por otro endpoint, con otro token. Sin dependencias.
 *                        Es lo que se usa cuando el equipo de tests no tiene
 *                        acceso a la base. Más débil, pero infinitamente mejor
 *                        que confiar en el eco de la escritura.
 *  · `fuenteViaSql()`  — ⚠️ COMPLETAR: conexión de sólo lectura a la base del
 *                        ambiente de pruebas. Es la versión fuerte.
 */
import { ClienteApi, exigirStatus } from "./cliente";
import type { Rol } from "./auth";

export interface FuenteDeVerdad {
  /** Descripción legible, para el reporte: "vía API (rol admin)" / "vía SQL". */
  readonly descripcion: string;
  /** Devuelve el recurso, o `null` si no existe. */
  buscar<T = any>(recurso: string, id: string | number): Promise<T | null>;
  /** Lista el recurso con filtro opcional. */
  listar<T = any>(recurso: string, filtro?: Record<string, string | number>): Promise<T[]>;
  /** Cuenta. Lo más usado: "el rechazo no dejó rastro". */
  contar(recurso: string, filtro?: Record<string, string | number>): Promise<number>;
  /** Consulta cruda. Sólo disponible en la implementación SQL. */
  crudo?(sql: string, params?: unknown[]): Promise<any[]>;
}

/**
 * Lee por la propia API, con un rol de lectura amplia distinto al que escribió.
 *
 * Limitación honesta: si el bug está en la capa de persistencia y la API lee
 * del mismo caché que escribió, esto no lo ve. Anotalo en el reporte y pedí
 * acceso de sólo lectura a la base.
 */
export function fuenteViaApi(rol: Rol = "admin", prefijo = "/api"): FuenteDeVerdad {
  const api = new ClienteApi().como(rol);

  const desempaquetar = (cuerpo: any): any[] => {
    if (Array.isArray(cuerpo)) return cuerpo;
    for (const clave of ["datos", "data", "items", "resultados", "results", "content"]) {
      if (Array.isArray(cuerpo?.[clave])) return cuerpo[clave];
    }
    return [];
  };

  return {
    descripcion: `vía API (rol ${rol})`,

    async buscar(recurso, id) {
      const res = await api.get(`${prefijo}/${recurso}/${id}`);
      if (res.status === 404) return null;
      exigirStatus(res, 200);
      return res.cuerpo;
    },

    async listar(recurso, filtro = {}) {
      const res = await api.get(`${prefijo}/${recurso}`, { query: filtro });
      exigirStatus(res, 200);
      return desempaquetar(res.cuerpo);
    },

    async contar(recurso, filtro = {}) {
      const res = await api.get(`${prefijo}/${recurso}`, { query: filtro });
      exigirStatus(res, 200);
      const c = res.cuerpo;
      // Muchas APIs devuelven el total en el sobre: usarlo evita paginar.
      for (const clave of ["total", "totalItems", "count", "totalElements"]) {
        if (typeof c?.[clave] === "number") return c[clave];
      }
      return desempaquetar(c).length;
    },
  };
}

/**
 * ⚠️ COMPLETAR POR PROYECTO — la versión fuerte de la capa 3.
 *
 * Reglas:
 *  · Usuario de **sólo lectura**. Un test no escribe en la base por atrás:
 *    si lo hace, deja de probar la API y empieza a probar SQL.
 *  · Sólo contra el ambiente de pruebas. El guardarraíl de `entorno.ts` cubre
 *    la URL de la API, no la cadena de conexión: cuidala vos.
 *  · La cadena viene de `API_DB_URL`, en `.api-secrets.local`. Nunca en el código.
 *
 * Ejemplo con `pg` (instalar la dependencia si se usa):
 *
 *   import { Pool } from "pg";
 *   const pool = new Pool({ connectionString: process.env.API_DB_URL, max: 4 });
 *
 *   export function fuenteViaSql(): FuenteDeVerdad {
 *     return {
 *       descripcion: "vía SQL (sólo lectura)",
 *       async buscar(tabla, id) {
 *         const { rows } = await pool.query(`select * from ${tabla} where id = $1`, [id]);
 *         return rows[0] ?? null;
 *       },
 *       async listar(tabla, filtro = {}) { ... },
 *       async contar(tabla, filtro = {}) {
 *         const { rows } = await pool.query(`select count(*)::int as n from ${tabla}`);
 *         return rows[0].n;
 *       },
 *       async crudo(sql, params) { return (await pool.query(sql, params)).rows; },
 *     };
 *   }
 */
export function fuenteViaSql(): FuenteDeVerdad {
  throw new Error(
    "⚠️ fuenteViaSql() no está implementada en este proyecto.\n" +
      "   Completala en tests/api/_helpers/db.ts (hay un ejemplo con `pg` en el comentario),\n" +
      "   o usá fuenteViaApi() y anotá la limitación en el reporte.",
  );
}

/** La fuente que usa la fixture `db`. Cambiala acá cuando implementes SQL. */
export const fuenteDeVerdad: FuenteDeVerdad = fuenteViaApi();
