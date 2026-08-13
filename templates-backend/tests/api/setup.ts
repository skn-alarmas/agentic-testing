/**
 * Arranque de la suite. Corre una vez, antes de todo.
 *
 * Hace dos cosas, en este orden:
 *   1. Carga `.api-secrets.local` y activa el guardarraíl anti-producción.
 *   2. Verifica que el servicio esté vivo — y si no, lo dice UNA vez, claro.
 *
 * El punto 2 importa más de lo que parece: sin esto, un servicio caído produce
 * 60 tests rojos con timeouts distintos y media hora de diagnóstico. Con esto,
 * produce un mensaje que dice "levantá el servicio".
 */
import { entorno } from "./_helpers/entorno";

const RUTA_SALUD = process.env.API_RUTA_SALUD ?? "/api/salud";

export async function setup(): Promise<void> {
  const { baseUrl, clasificacion, runId, contrato } = entorno();

  console.log(
    [
      "",
      "  Suite de API",
      `  base:      ${baseUrl}  (${clasificacion})`,
      `  contrato:  ${contrato}`,
      `  corrida:   ${runId}`,
      "",
    ].join("\n"),
  );

  let res: Response;
  try {
    res = await fetch(baseUrl + RUTA_SALUD, { signal: AbortSignal.timeout(5_000) });
  } catch (e) {
    throw new Error(
      [
        "",
        `🔌 El servicio no responde en ${baseUrl}${RUTA_SALUD}`,
        `   ${e instanceof Error ? e.message : String(e)}`,
        "",
        "   Esto es un problema de AMBIENTE, no un bug de la app:",
        "     · ¿Está levantado el servicio?",
        "     · ¿Es el puerto correcto? (API_BASE_URL)",
        "     · ¿La ruta de salud es otra? (API_RUTA_SALUD)",
        "",
      ].join("\n"),
    );
  }

  if (!res.ok) {
    throw new Error(
      `🔌 ${baseUrl}${RUTA_SALUD} respondió ${res.status}. El servicio está arriba pero no sano. ` +
        "Revisá sus dependencias (base de datos, cache, colas) antes de correr la suite.",
    );
  }
}

// Nota: acá NO se imprime el resumen de la bitácora. El `globalSetup` corre en
// su propio proceso, y los tests en workers aparte: lo que se acumule en
// `BITACORA` durante la corrida no llega hasta acá. El resumen se pide desde un
// test o un hook del propio archivo (`resumenBitacora()` de `_helpers/cliente`).
