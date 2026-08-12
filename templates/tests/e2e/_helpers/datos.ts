/**
 * Generadores de datos únicos por corrida.
 *
 * El problema que resuelven: un test que usa `"test@test.com"` fijo choca con
 * la corrida anterior, con la de tu compañero y con la de CI. Falla de a ratos,
 * nadie sabe por qué, y termina con `retries: 3` encima.
 *
 * Cada corrida tiene su propio `RUN_ID`, y cada llamada agrega un contador.
 * Dos tests en paralelo nunca generan el mismo valor.
 */

/** Identificador de esta corrida. Corto para que entre en campos con límite. */
export const RUN_ID = process.env.E2E_RUN_ID ?? String(Date.now() % 1_000_000);

let contador = 0;
const siguiente = (): string => `${RUN_ID}${(++contador).toString().padStart(2, "0")}`;

/** Marca reconocible para poder limpiar a mano lo que quede colgado. */
export const PREFIJO_E2E = "E2E";

export const emailUnico = (): string => `e2e.${siguiente()}@ejemplo.test`;

export const nombreUnico = (base = "Prueba"): string =>
  `${PREFIJO_E2E} ${base} ${siguiente()}`;

/** Documento numérico único (RUC, cédula, nro de factura...). */
export const documentoUnico = (largo = 8): string =>
  siguiente().padStart(largo, "0").slice(-largo);

/** Teléfono con formato paraguayo. */
export const telefonoUnico = (): string => `09${documentoUnico(8)}`;

/** Fecha relativa a hoy, en ISO (`YYYY-MM-DD`). Evita fechas hardcodeadas
 *  que expiran y hacen fallar la suite en el futuro. */
export const fechaRelativa = (dias: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

/**
 * Tarjetas de prueba. Sustituir por las del sandbox real del proyecto.
 * NUNCA poner acá una tarjeta real, ni siquiera de pruebas internas.
 */
export const TARJETAS = {
  aprobada: "4111111111111111",
  rechazada: "4000000000000002",
  fondosInsuficientes: "4000000000009995",
} as const;

/** Registro de lo creado en la corrida, para limpiar en `afterEach`/`afterAll`. */
export class Rastro {
  private readonly ids = new Map<string, string[]>();

  anotar(tipo: string, id: string): void {
    this.ids.set(tipo, [...(this.ids.get(tipo) ?? []), id]);
  }

  /** Devuelve y vacía: llamar una sola vez desde la limpieza. */
  drenar(): Array<{ tipo: string; id: string }> {
    const todos = [...this.ids.entries()].flatMap(([tipo, ids]) =>
      ids.map((id) => ({ tipo, id })),
    );
    this.ids.clear();
    return todos;
  }
}
