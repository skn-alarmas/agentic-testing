/**
 * Validación estricta contra el contrato publicado (OpenAPI o JSON Schema).
 *
 * Dos cosas que casi ninguna suite hace y que acá son obligatorias (§5):
 *
 *  1. **`additionalProperties: false` forzado.** Un campo que la API devuelve y
 *     el contrato no declara es un hallazgo. Así aparecen los `password_hash`,
 *     los `costo_interno` y los `token` que nadie quiso exponer.
 *  2. **El código de respuesta tiene que estar declarado.** Si la API contesta
 *     un 500 o un 403 que el contrato no menciona, el contrato está roto —
 *     aunque el cuerpo valide.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { entorno } from "./entorno";

/** `$id` interno del documento. Tiene que ser un URI que AJV pueda serializar:
 *  un `urn:` sin NID revienta el resolver, así que se usa forma http. */
const ID_DOC = "https://kit-testing.local/contrato.json";

/** Reescribe `#/components/...` → `<ID_DOC>#/components/...` para que AJV resuelva. */
function reapuntarRefs(nodo: unknown): unknown {
  if (Array.isArray(nodo)) return nodo.map(reapuntarRefs);
  if (nodo && typeof nodo === "object") {
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(nodo as Record<string, unknown>)) {
      salida[k] = k === "$ref" && typeof v === "string" && v.startsWith("#/") ? `${ID_DOC}${v}` : reapuntarRefs(v);
    }
    return salida;
  }
  return nodo;
}

/**
 * Fuerza `additionalProperties: false` en todo objeto que no lo declare.
 * Un contrato que no lo dice explícitamente está diciendo "no me importa",
 * y acá sí importa.
 */
function endurecer(nodo: unknown): unknown {
  if (Array.isArray(nodo)) return nodo.map(endurecer);
  if (!nodo || typeof nodo !== "object") return nodo;

  const obj = { ...(nodo as Record<string, unknown>) };
  for (const [k, v] of Object.entries(obj)) obj[k] = endurecer(v);

  const declaraObjeto = obj.type === "object" || obj.properties !== undefined;
  if (declaraObjeto && obj.additionalProperties === undefined && obj.$ref === undefined) {
    obj.additionalProperties = false;
  }
  return obj;
}

/** `/api/facturas/{id}` → regex que matchea `/api/facturas/123`. */
function aRegex(plantilla: string): RegExp {
  const escapada = plantilla.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{[^/]+?\\\}/g, "[^/]+");
  return new RegExp(`^${escapada}$`);
}

export interface ResultadoContrato {
  ok: boolean;
  errores: string[];
}

export interface Contrato {
  /** `true` si hay contrato cargado. `false` sólo si se declaró `API_CONTRATO=ninguno`. */
  readonly disponible: boolean;
  /** Rutas declaradas en el contrato, como `GET /api/facturas`. */
  operaciones(): string[];
  /** Operaciones que ninguna prueba tocó todavía. Insumo del coverage-critic. */
  sinEjercitar(): string[];
  /** Valida y **lanza** si no cumple. Es la forma normal de usarlo. */
  verificar(metodo: string, ruta: string, status: number, cuerpo: unknown): void;
  /** Operaciones que se validaron sin contrato: deuda para el reporte. */
  pendientes?(): string[];
  /** Valida y devuelve el resultado, sin lanzar. Para reportes agregados. */
  evaluar(metodo: string, ruta: string, status: number, cuerpo: unknown): ResultadoContrato;
}

class ContratoOpenApi implements Contrato {
  readonly disponible = true;
  private readonly ajv: Ajv;
  private readonly compiladas = new Map<string, ValidateFunction>();
  private readonly ejercitadas = new Set<string>();
  private readonly rutas: Array<{ plantilla: string; regex: RegExp }>;

  constructor(private readonly doc: any) {
    this.ajv = new Ajv({ strict: false, allErrors: true, validateFormats: true });
    addFormats(this.ajv);
    this.ajv.addSchema({ ...reapuntarRefs(doc) as object, $id: ID_DOC }, ID_DOC);
    this.rutas = Object.keys(doc.paths ?? {}).map((plantilla) => ({ plantilla, regex: aRegex(plantilla) }));
  }

  operaciones(): string[] {
    const salida: string[] = [];
    for (const [ruta, ops] of Object.entries<any>(this.doc.paths ?? {})) {
      for (const metodo of Object.keys(ops)) {
        if (["get", "post", "put", "patch", "delete", "head", "options"].includes(metodo)) {
          salida.push(`${metodo.toUpperCase()} ${ruta}`);
        }
      }
    }
    return salida.sort();
  }

  sinEjercitar(): string[] {
    return this.operaciones().filter((o) => !this.ejercitadas.has(o));
  }

  private plantillaDe(ruta: string): string | undefined {
    const limpia = ruta.split("?")[0]!;
    const exacta = this.rutas.find((r) => r.plantilla === limpia);
    if (exacta) return exacta.plantilla;
    // La más específica primero: menos comodines gana.
    return this.rutas
      .filter((r) => r.regex.test(limpia))
      .sort((a, b) => (a.plantilla.match(/\{/g)?.length ?? 0) - (b.plantilla.match(/\{/g)?.length ?? 0))[0]?.plantilla;
  }

  evaluar(metodo: string, ruta: string, status: number, cuerpo: unknown): ResultadoContrato {
    const plantilla = this.plantillaDe(ruta);
    if (!plantilla) {
      return { ok: false, errores: [`la ruta ${ruta} no está declarada en el contrato`] };
    }

    const op = this.doc.paths?.[plantilla]?.[metodo.toLowerCase()];
    if (!op) return { ok: false, errores: [`${metodo} ${plantilla} no está declarado en el contrato`] };

    this.ejercitadas.add(`${metodo.toUpperCase()} ${plantilla}`);

    const respuesta = op.responses?.[String(status)] ?? op.responses?.default;
    if (!respuesta) {
      const declarados = Object.keys(op.responses ?? {}).join(", ") || "ninguno";
      return {
        ok: false,
        errores: [
          `la API respondió ${status} y el contrato no lo declara para ${metodo} ${plantilla} ` +
            `(declarados: ${declarados})`,
        ],
      };
    }

    const esquema =
      respuesta.content?.["application/json"]?.schema ??
      respuesta.content?.["application/problem+json"]?.schema;

    if (!esquema) {
      // 204 y similares: sin cuerpo declarado, no puede venir cuerpo.
      const vacio = cuerpo === undefined || cuerpo === null || cuerpo === "";
      return vacio
        ? { ok: true, errores: [] }
        : { ok: false, errores: [`${metodo} ${plantilla} ${status} no declara cuerpo y la API devolvió uno`] };
    }

    const clave = `${metodo.toUpperCase()} ${plantilla} ${status}`;
    let validar = this.compiladas.get(clave);
    if (!validar) {
      const laxo = process.env.API_CONTRATO_LAXO === "1";
      const preparado = reapuntarRefs(laxo ? esquema : endurecer(esquema)) as object;
      validar = this.ajv.compile(preparado);
      this.compiladas.set(clave, validar);
    }

    if (validar(cuerpo)) return { ok: true, errores: [] };

    return {
      ok: false,
      errores: (validar.errors ?? []).map((e) => {
        const donde = e.instancePath || "(raíz)";
        const extra = e.keyword === "additionalProperties"
          ? ` ← campo NO declarado en el contrato: "${(e.params as any).additionalProperty}"`
          : "";
        return `${donde} ${e.message}${extra}`;
      }),
    };
  }

  verificar(metodo: string, ruta: string, status: number, cuerpo: unknown): void {
    const r = this.evaluar(metodo, ruta, status, cuerpo);
    if (r.ok) return;
    throw new Error(
      [`📄 Contrato incumplido — ${metodo} ${ruta} → ${status}`, ...r.errores.map((e) => `   · ${e}`)].join("\n"),
    );
  }
}

/** Contrato declarado inexistente (`API_CONTRATO=ninguno`). Registra la deuda. */
class SinContrato implements Contrato {
  readonly disponible = false;
  private readonly vistas = new Set<string>();

  operaciones(): string[] { return []; }
  sinEjercitar(): string[] { return []; }
  /** Operaciones que se validaron contra la nada: van al reporte como deuda. */
  pendientes(): string[] { return [...this.vistas].sort(); }

  evaluar(metodo: string, ruta: string): ResultadoContrato {
    this.vistas.add(`${metodo.toUpperCase()} ${ruta}`);
    return { ok: true, errores: [] };
  }

  verificar(metodo: string, ruta: string): void {
    this.evaluar(metodo, ruta);
  }
}

let cache: Contrato | undefined;

/**
 * Carga el contrato. Si no existe el archivo, **lanza** con instrucciones:
 * pasar en silencio sería declarar cubierta una dimensión que no se probó.
 * Para trabajar sin contrato hay que decirlo: `API_CONTRATO=ninguno`.
 *
 * Es `async` sólo por el import perezoso del parser de YAML: los proyectos con
 * contrato JSON no tienen por qué cargar esa dependencia.
 */
export async function cargarContrato(): Promise<Contrato> {
  if (cache) return cache;

  const { contrato } = entorno();

  if (contrato === "ninguno") {
    console.warn("⚠️  API_CONTRATO=ninguno — la dimensión D1 (contrato) queda SIN cubrir.");
    cache = new SinContrato();
    return cache;
  }

  const ruta = resolve(process.cwd(), contrato);
  if (!existsSync(ruta)) {
    throw new Error(
      [
        `📄 No encontré el contrato en ${ruta}.`,
        "",
        "   Opciones:",
        "   · Apuntá a tu OpenAPI:      API_CONTRATO=ruta/a/openapi.yaml",
        "   · Generalo desde la API:    /api-contract-validator (genera el borrador y lo discutimos)",
        "   · Declaralo inexistente:    API_CONTRATO=ninguno   ← D1 queda sin cubrir, y se anota",
        "",
      ].join("\n"),
    );
  }

  const crudo = readFileSync(ruta, "utf8");
  let doc: unknown;
  if (/\.ya?ml$/i.test(ruta)) {
    const { parse } = await import("yaml");
    doc = parse(crudo);
  } else {
    doc = JSON.parse(crudo);
  }

  cache = new ContratoOpenApi(doc);
  return cache;
}
