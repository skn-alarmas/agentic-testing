/**
 * Corpus de valores hostiles y de borde.
 *
 * Existe para que los casos negativos sean **sistemáticos** y no dependan de
 * la imaginación de quien escribe el test un martes a las 6 de la tarde.
 *
 * Cómo se usa: se recorre con `test.for`, de modo que el reporte diga qué
 * valor exacto falló.
 *
 *   test.for(INYECCION.sql)("busqueda=%s no rompe el servidor", async (mal) => {
 *     const res = await api.como("lector").get("/api/clientes", { query: { q: mal } });
 *     expect(res.status).not.toBe(500);      // ← ver nota sobre `not` abajo
 *   });
 *
 * ⚠️ Sobre `not.toBe(500)`: el estándar prohíbe las aserciones negativas como
 * única aserción (§9). Acá es válido **junto con** una aserción positiva:
 * "responde 200 con lista vacía" o "responde 400 con código VALIDACION". Lo
 * que se afirma es que el input hostil se trata como dato, no como código.
 */

// ─── Inyección ──────────────────────────────────────────────────────────────

export const INYECCION = {
  /** Lo esperado: tratamiento literal (0 resultados) o 400. Nunca 500. */
  sql: [
    "' OR '1'='1",
    "'; DROP TABLE clientes; --",
    "1' UNION SELECT null,version(),null--",
    "admin'--",
    "') OR ('a'='a",
    "1;SELECT PG_SLEEP(5)--",
    "\\'; --",
  ],
  /** Mongo y similares: operadores donde se espera un escalar. */
  noSql: [
    '{"$ne": null}',
    '{"$gt": ""}',
    '{"$where": "sleep(1000)"}',
    '{"$regex": ".*"}',
  ],
  /** Inyección de comandos: si el backend arma un shell en algún lado. */
  comandos: [
    "; ls -la",
    "| cat /etc/passwd",
    "$(whoami)",
    "`id`",
    "&& echo vulnerable",
  ],
  /** Path traversal: descargas, adjuntos, importadores, plantillas. */
  rutas: [
    "../../../../etc/passwd",
    "..\\..\\..\\windows\\win.ini",
    "%2e%2e%2f%2e%2e%2fetc%2fpasswd",
    "/etc/passwd\0.png",
    "file:///etc/passwd",
  ],
  /** SSRF: cualquier campo que el backend vaya a pedir por HTTP. */
  ssrf: [
    "http://169.254.169.254/latest/meta-data/",   // metadatos de la nube
    "http://localhost:6379/",                      // servicios internos
    "http://127.0.0.1:5432/",
    "file:///etc/hosts",
  ],
  /** Plantillas del lado del servidor: mails, PDFs, reportes. */
  plantillas: ["{{7*7}}", "${7*7}", "<%= 7*7 %>", "#{7*7}"],
  /** XSS: acá se prueba que se guarda y se devuelve escapado o rechazado. */
  xss: [
    "<script>alert(1)</script>",
    "\"><img src=x onerror=alert(1)>",
    "javascript:alert(1)",
    "<svg/onload=alert(1)>",
  ],
} as const;

// ─── Bordes y extremos ──────────────────────────────────────────────────────

export const TEXTO = {
  vacio: "",
  soloEspacios: "   ",
  tab: "\t\n\r",
  unicode: "日本語 · Ñandú · العربية · 🧉🇵🇾",
  /** Combinaciones que rompen normalizadores y comparaciones. */
  homoglifos: "аdmin",                    // la "а" es cirílica
  zeroWidth: "ad​min",
  rtl: "‮exe.txt",
  emojiCompuesto: "👨‍👩‍👧‍👦",
  largo1k: "A".repeat(1_000),
  largo100k: "A".repeat(100_000),
  nulo: "abc\0def",
  sqlComoTexto: "O'Brien & Cía. <SA>",   // texto legítimo que parece ataque
} as const;

export const NUMEROS = {
  cero: 0,
  negativo: -1,
  maxInt32: 2_147_483_647,
  maxInt32Mas1: 2_147_483_648,
  maxSafe: Number.MAX_SAFE_INTEGER,
  maxSafeMas2: Number.MAX_SAFE_INTEGER + 2,
  decimalLargo: 0.1 + 0.2,
  centavos: 0.005,
  notacion: 1e309,                        // Infinity al serializar
  negativoGrande: -999_999_999_999,
} as const;

/** Valores que rompen parseo de fechas o lógica de vigencia. */
export const FECHAS = [
  "2026-02-30",       // no existe
  "2026-13-01",       // mes inválido
  "0000-01-01",
  "9999-12-31",
  "2026-08-13T25:00:00Z",
  "13/08/2026",       // formato local donde se espera ISO
  "hoy",
  "",
] as const;

/** Ids que no existen, mal formados, o de otro dominio. */
export const IDS_HOSTILES = [
  "0",
  "-1",
  "999999999",
  "abc",
  "1 OR 1=1",
  "00000000-0000-0000-0000-000000000000",
  "../1",
  "1%00",
] as const;

/** Valores para campos que el cliente NO debería poder fijar (§6 S6). */
export const MASS_ASSIGNMENT: Record<string, unknown> = {
  id: 1,
  rol: "admin",
  roles: ["admin"],
  esAdmin: true,
  isAdmin: true,
  permisos: ["*"],
  saldo: 999_999,
  precio: 0,
  descuento: 100,
  estado: "APROBADO",
  empresaId: 1,
  tenantId: 1,
  usuarioId: 1,
  creadoPor: 1,
  createdAt: "2000-01-01T00:00:00Z",
  verificado: true,
  eliminado: false,
};

/** Cuerpos que no son JSON válido: deben dar 400, nunca 500. */
export const CUERPOS_MALFORMADOS = [
  "",
  "{",
  '{"a": }',
  "[1,2,",
  "null",
  '"solo un string"',
  "<xml/>",
  '{"a": 1} {"b": 2}',
] as const;

/** Estructuras que agotan recursos si no hay límite (§6 S4). */
export const ESTRUCTURAS_ABUSIVAS = {
  /** Anidamiento profundo: `{"a":{"a":{...}}}`. Debe dar 400/413, no 500. */
  anidamientoProfundo: (niveles = 200): unknown => {
    let o: unknown = 1;
    for (let i = 0; i < niveles; i++) o = { a: o };
    return o;
  },
  /** Array enorme donde se espera uno chico. */
  arrayEnorme: (n = 10_000): number[] => Array.from({ length: n }, (_, i) => i),
  /** Muchas claves distintas: revienta validadores que iteran sin límite. */
  muchasClaves: (n = 5_000): Record<string, number> =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, i])),
};

/** Paginación abusiva: `limit` absurdo, negativo, o no numérico (§6 S4). */
export const PAGINACION_HOSTIL = [
  { limit: 999_999 },
  { limit: -1 },
  { limit: 0 },
  { limit: "abc" },
  { offset: -1 },
  { offset: 999_999_999 },
  { page: 0 },
  { limit: 10, offset: "1;DROP" },
] as const;

/** Tipos equivocados para un campo. Lo esperado es 400/422, nunca 500. */
export const TIPOS_EQUIVOCADOS: unknown[] = [
  null,
  undefined,
  true,
  false,
  0,
  -1,
  "",
  "texto",
  [],
  [1, 2],
  {},
  { anidado: true },
];

/**
 * Familias listas para `test.for`. Cada entrada es `[etiqueta, valor]` para que
 * el nombre del caso en el reporte sea legible.
 */
export const familia = (nombre: string, valores: readonly unknown[]): Array<[string, unknown]> =>
  valores.map((v, i) => [`${nombre}[${i}] ${JSON.stringify(v)?.slice(0, 40) ?? String(v)}`, v]);
