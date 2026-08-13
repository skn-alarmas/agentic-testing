/**
 * Concurrencia, carreras e idempotencia — dimensión D9.
 *
 * Es la dimensión que casi nadie prueba y la que produce los bugs más caros:
 * la factura duplicada, el saldo que quedó mal, el cupo que se vendió dos
 * veces. Todos ellos pasan sólo cuando dos requests llegan juntos, y ningún
 * test secuencial los ve.
 */

/** Lanza `n` copias de la misma operación **a la vez** y devuelve todos los resultados. */
export async function enParalelo<T>(n: number, operacion: (i: number) => Promise<T>): Promise<T[]> {
  return Promise.all(Array.from({ length: n }, (_, i) => operacion(i)));
}

/**
 * Igual que `enParalelo` pero sin que un rechazo tumbe al resto: devuelve el
 * estado de cada intento. Es lo que hace falta cuando se espera que algunos
 * fallen (por ejemplo, 1 gana el cupo y 9 reciben 409).
 */
export async function enParaleloTolerante<T>(
  n: number,
  operacion: (i: number) => Promise<T>,
): Promise<Array<{ ok: true; valor: T } | { ok: false; error: unknown }>> {
  const resultados = await Promise.allSettled(Array.from({ length: n }, (_, i) => operacion(i)));
  return resultados.map((r) =>
    r.status === "fulfilled" ? { ok: true as const, valor: r.value } : { ok: false as const, error: r.reason },
  );
}

/**
 * Doble submit: dos veces la misma operación, simultáneas.
 *
 * Es la pregunta "¿qué pasa si el usuario hace doble click?" formulada como
 * test. La respuesta correcta nunca es "se crean dos".
 *
 *   const [a, b] = await dobleSubmit(() => api.como("operador").post("/api/facturas", { cuerpo }));
 *   const creados = [a, b].filter(r => r.status === 201);
 *   expect(creados).toHaveLength(1);                       // una sola creación
 *   expect(await db.contar("facturas", { clienteId })).toBe(1);   // capa 3
 */
export function dobleSubmit<T>(operacion: () => Promise<T>): Promise<[T, T]> {
  return Promise.all([operacion(), operacion()]) as Promise<[T, T]>;
}

/**
 * Espera a que una condición se cumpla, con timeout acotado y motivo escrito.
 *
 * Es la ÚNICA forma permitida de esperar (§7). `setTimeout` a secas está
 * prohibido: dormir 3 segundos es apostar, y la apuesta se pierde en CI.
 *
 *   const factura = await esperarQue(
 *     () => db.buscar("facturas", id),
 *     (f) => f?.estado === "PROCESADA",
 *     { motivo: "la facturación se procesa por cola (worker cada ~2s)" },
 *   );
 */
export async function esperarQue<T>(
  obtener: () => Promise<T>,
  cumple: (valor: T) => boolean,
  opciones: { timeout?: number; intervalo?: number; motivo: string },
): Promise<T> {
  const { timeout = 10_000, intervalo = 250, motivo } = opciones;
  const limite = Date.now() + timeout;
  let ultimo: T | undefined;
  let intentos = 0;

  while (Date.now() < limite) {
    intentos++;
    ultimo = await obtener();
    if (cumple(ultimo)) return ultimo;
    await new Promise((r) => setTimeout(r, intervalo));
  }

  throw new Error(
    [
      `⏱️ La condición no se cumplió en ${timeout} ms (${intentos} intentos).`,
      `   Motivo declarado de la espera: ${motivo}`,
      `   Último valor: ${JSON.stringify(ultimo)?.slice(0, 400)}`,
      "   Si el sistema NO tiene consistencia eventual acá, esto es un bug, no una espera corta.",
    ].join("\n"),
  );
}

/**
 * Actualización perdida (*lost update*): dos clientes leen, modifican y
 * escriben el mismo recurso a la vez. Sin control de concurrencia optimista
 * (ETag / `version`), la segunda escritura pisa a la primera en silencio.
 *
 * Lo correcto es que una de las dos falle con 409, o que ambas se apliquen si
 * la operación es conmutativa (`saldo += x`). Lo que nunca es correcto es que
 * las dos digan 200 y sólo una haya quedado.
 */
export async function carreraDeActualizacion<T>(
  actualizarA: () => Promise<T>,
  actualizarB: () => Promise<T>,
): Promise<{ a: T; b: T }> {
  const [a, b] = await Promise.all([actualizarA(), actualizarB()]);
  return { a, b };
}

/**
 * Mide cuántas llamadas hacen falta hasta recibir un 429.
 *
 * **Acotado a propósito** (§6, reglas de conducta): el objetivo es comprobar
 * que el límite existe, no tumbar el servicio. Si a los `maximo` intentos no
 * apareció el 429, el resultado es "sin límite detectado" — que es el hallazgo.
 */
export async function buscarRateLimit(
  llamada: () => Promise<{ status: number; headers: Record<string, string> }>,
  maximo = 40,
): Promise<{ limitado: boolean; enLlamada: number; retryAfter?: string }> {
  for (let i = 1; i <= maximo; i++) {
    const res = await llamada();
    if (res.status === 429) {
      return { limitado: true, enLlamada: i, retryAfter: res.headers["retry-after"] };
    }
  }
  return { limitado: false, enLlamada: maximo };
}
