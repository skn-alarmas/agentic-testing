/**
 * Datos únicos por corrida y rastro de limpieza.
 *
 * El problema que resuelven: un test que crea `"cliente@test.com"` fijo choca
 * con la corrida anterior, con la de tu compañero y con la de CI. Falla de a
 * ratos, nadie sabe por qué, y termina con `retry: 3` encima.
 *
 * Cada corrida tiene su `RUN_ID` y cada llamada agrega un contador: dos tests
 * en paralelo nunca generan el mismo valor.
 */
import { entorno } from "./entorno";

/** Identificador de esta corrida. Corto, para que entre en campos con límite. */
export const RUN_ID = entorno().runId;

let contador = 0;
const siguiente = (): string => `${RUN_ID}${(++contador).toString().padStart(3, "0")}`;

/** Marca reconocible, para poder limpiar a mano lo que quede colgado. */
export const PREFIJO = "API-E2E";

export const emailUnico = (): string => `api.${siguiente()}@ejemplo.test`;
export const nombreUnico = (base = "Prueba"): string => `${PREFIJO} ${base} ${siguiente()}`;
export const documentoUnico = (largo = 8): string => siguiente().padStart(largo, "0").slice(-largo);
export const telefonoUnico = (): string => `09${documentoUnico(8)}`;

/** Monto con centavos, siempre distinto: sirve para identificar el registro. */
export const montoUnico = (base = 10_000): number => base + (contador % 900) + 0.01 * ((contador % 90) + 1);

/** Fecha relativa a hoy en ISO (`YYYY-MM-DD`). Nunca hardcodear fechas: expiran. */
export const fechaRelativa = (dias: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

/** Identificador de correlación por test, para cruzar con los logs del servicio. */
export const trazaUnica = (): string => `${PREFIJO}-${RUN_ID}-${siguiente()}`;

/**
 * Registro de lo que el test creó, para limpiarlo al terminar.
 *
 * La fixture `rastro` lo drena sola en el teardown: no hay que acordarse de
 * llamarlo — que es el punto, porque una limpieza que hay que recordar, tarde
 * o temprano no se hace.
 */
export class Rastro {
  private readonly items: Array<{ recurso: string; id: string | number }> = [];

  anotar(recurso: string, id: string | number | undefined | null): void {
    if (id === undefined || id === null) return;
    this.items.push({ recurso, id });
  }

  /** Devuelve y vacía. Se borra en orden inverso: los hijos antes que los padres. */
  drenar(): Array<{ recurso: string; id: string | number }> {
    const todos = [...this.items].reverse();
    this.items.length = 0;
    return todos;
  }

  get pendientes(): number {
    return this.items.length;
  }
}
