// Piezas puras de la pantalla de Bita: saludo, enlaces a viajes y validación de
// lo que responde el servidor. Sin React, para probarlas con node --test.

export const NOMBRE_DE_BITA = "Bita";

export const PREGUNTAS_SUGERIDAS = [
  "¿Quién sube esta semana?",
  "¿Qué hay que comprar ahora?",
  "¿Cuánto llevamos gastado este mes?",
] as const;

export function horaEnChile(ahora: Date = new Date()): number {
  const texto = new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", hour: "numeric", hourCycle: "h23" }).format(ahora);
  return Number.parseInt(texto, 10) % 24;
}

export const saludoPara = (hora: number) => (hora < 12 ? "Buenos días" : hora < 20 ? "Buenas tardes" : "Buenas noches");

export function presentacion(hora: number, demo: boolean, soloResumen = demo): string {
  return (
    `${saludoPara(hora)}. Soy ${NOMBRE_DE_BITA}: resumo quién sube y baja, qué hay que comprar y cuánto se ha gastado. ` +
    (demo
      ? "En la demostración solo muestro este resumen; las preguntas funcionan con una cuenta real."
      : soloResumen
        ? "Por ahora solo muestro este resumen: las preguntas todavía no están configuradas."
        : "No compro pasajes ni cambio viajes: eso lo haces tú en la pantalla.")
  );
}

export type Trozo = { tipo: "texto"; texto: string } | { tipo: "viaje"; texto: string; id: string };

/** Separa los seudónimos de viaje (V-xxxx) que el servidor sabe abrir; el resto queda como texto. */
export function trozosConViajes(texto: string, viajes: Record<string, string>): Trozo[] {
  const trozos: Trozo[] = [];
  let desde = 0;
  for (const m of texto.matchAll(/\bV-[0-9a-f]{4}(?:[0-9a-f]{4})?\b/g)) {
    const id = viajes[m[0]];
    if (!id) continue;
    if (m.index > desde) trozos.push({ tipo: "texto", texto: texto.slice(desde, m.index) });
    trozos.push({ tipo: "viaje", texto: m[0], id });
    desde = m.index + m[0].length;
  }
  if (desde < texto.length) trozos.push({ tipo: "texto", texto: texto.slice(desde) });
  return trozos.length ? trozos : [{ tipo: "texto", texto }];
}

const entero = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;

export type RespuestaChat = { respuesta: string; viajes: Record<string, string>; restantes: number; limite: number };

export function esRespuestaChat(v: unknown): v is RespuestaChat {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  const viajes = r.viajes;
  return (
    typeof r.respuesta === "string" &&
    !!viajes &&
    typeof viajes === "object" &&
    Object.entries(viajes as Record<string, unknown>).every(
      ([token, id]) => /^V-[0-9a-f]{4}([0-9a-f]{4})?$/.test(token) && typeof id === "string" && id.length <= 64,
    ) &&
    entero(r.restantes) &&
    entero(r.limite)
  );
}

export function esRespuestaCupo(v: unknown): v is { restantes: number | null; limite: number } {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (r.restantes === null || entero(r.restantes)) && entero(r.limite);
}

// ── Documentos ────────────────────────────────────────────────────────────
// Bita lee un Excel, Word o PDF y propone viajes. La propuesta llega del
// servidor; los viajes los crea esta pantalla, con la sesión de quien confirma.

export const ACEPTA_ARCHIVOS = ".xlsx,.docx,.pdf";
/** El mismo tope que el servidor (lib/bita-documento.ts); una prueba los compara. */
export const MAX_ARCHIVO_PANTALLA = 4 * 1024 * 1024;

export const FORMATOS_DE_DOCUMENTO = { xlsx: "Excel", docx: "Word", pdf: "PDF" } as const;
export type FormatoDeDocumento = keyof typeof FORMATOS_DE_DOCUMENTO;

export type FilaDeDocumento = {
  clave: string;
  personaId: string;
  persona: string;
  fecha: string;
  sentido: "SUBIDA" | "BAJADA" | null;
  origen: string;
  destino: string;
  hora: string | null;
  fila: number | null;
  estado: "nuevo" | "existe" | "problema";
  detalle: string;
  viajeId?: string;
};

export type RespuestaDocumento = {
  archivo: string;
  formato: FormatoDeDocumento;
  truncado: boolean;
  resumen: string;
  filas: FilaDeDocumento[];
  sinIdentificar: { referencia: string; motivo: string }[];
  omitidos: number;
  restantes: number;
  limite: number;
};

/** Antes de subirlo: un archivo que el servidor va a rechazar no gasta ni el viaje de red. */
export function problemaDeArchivo(archivo: { name: string; size: number }): string | null {
  if (!/\.(xlsx|docx|pdf)$/i.test(archivo.name))
    return `${NOMBRE_DE_BITA} lee Excel (.xlsx), Word (.docx) y PDF con texto. Si es .xls o .doc, guárdalo como .xlsx o .docx.`;
  if (archivo.size === 0) return "El archivo está vacío.";
  if (archivo.size > MAX_ARCHIVO_PANTALLA) return `El archivo pesa más de ${MAX_ARCHIVO_PANTALLA / 1024 / 1024} MB. Pásame uno más liviano.`;
  return null;
}

const texto = (v: unknown, largo: number) => typeof v === "string" && v.length <= largo;

function esFila(v: unknown): v is FilaDeDocumento {
  if (!v || typeof v !== "object") return false;
  const f = v as Record<string, unknown>;
  return (
    texto(f.clave, 200) &&
    texto(f.personaId, 64) &&
    texto(f.persona, 200) &&
    texto(f.fecha, 10) &&
    (f.sentido === "SUBIDA" || f.sentido === "BAJADA" || f.sentido === null) &&
    texto(f.origen, 80) &&
    texto(f.destino, 80) &&
    (f.hora === null || (typeof f.hora === "string" && /^\d{2}:\d{2}$/.test(f.hora))) &&
    (f.fila === null || entero(f.fila)) &&
    (f.estado === "nuevo" || f.estado === "existe" || f.estado === "problema") &&
    texto(f.detalle, 300) &&
    (f.viajeId === undefined || texto(f.viajeId, 64))
  );
}

export function esRespuestaDocumento(v: unknown): v is RespuestaDocumento {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    texto(r.archivo, 200) &&
    typeof r.formato === "string" &&
    r.formato in FORMATOS_DE_DOCUMENTO &&
    typeof r.truncado === "boolean" &&
    texto(r.resumen, 400) &&
    Array.isArray(r.filas) &&
    r.filas.length <= 80 &&
    r.filas.every(esFila) &&
    Array.isArray(r.sinIdentificar) &&
    r.sinIdentificar.length <= 40 &&
    r.sinIdentificar.every((s) => !!s && typeof s === "object" && texto((s as Record<string, unknown>).referencia, 200) && texto((s as Record<string, unknown>).motivo, 200)) &&
    entero(r.omitidos) &&
    entero(r.restantes) &&
    entero(r.limite)
  );
}

export function conteoDePropuesta(filas: FilaDeDocumento[]) {
  return {
    nuevos: filas.filter((f) => f.estado === "nuevo").length,
    existen: filas.filter((f) => f.estado === "existe").length,
    problemas: filas.filter((f) => f.estado === "problema").length,
  };
}

/**
 * Lo que queda en la conversación para las preguntas siguientes. Solo cifras:
 * ni el nombre del archivo ni lo que dijo el modelo, que pueden traer nombres
 * de personas sin ficha y volverían al modelo en el próximo mensaje.
 */
export function textoDeHistorial(r: RespuestaDocumento): string {
  const { nuevos, existen, problemas } = conteoDePropuesta(r.filas);
  if (!r.filas.length) return "Revisé el documento que adjuntaste y no encontré viajes que proponer.";
  return `Revisé el documento que adjuntaste: ${nuevos} viajes nuevos, ${existen} que ya estaban en la agenda y ${problemas} con problemas.`;
}

/** «mar, 24 nov» para la fila de una propuesta. Una fecha que no existe se muestra tal cual, sin inventar otra. */
export function fechaCorta(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return fecha;
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const hecha = new Date(Date.UTC(a, mes - 1, d, 12));
  if (hecha.getUTCFullYear() !== a || hecha.getUTCMonth() !== mes - 1 || hecha.getUTCDate() !== d) return fecha;
  return new Intl.DateTimeFormat("es-CL", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(hecha);
}

export type ViajeElegido = Pick<FilaDeDocumento, "personaId" | "fecha" | "origen" | "destino" | "hora"> & { sentido: "SUBIDA" | "BAJADA" };

export type FilaParaInsertar = {
  person_id: string;
  date: string;
  direction: "SUBIDA" | "BAJADA";
  origin: string;
  destination: string;
  requested_time: string | null;
  baggage: string;
  status: "Planificado";
  pnr: "";
  flight: "";
  amount: null;
  notes: string;
};

/**
 * Los viajes que se van a insertar, con las mismas condiciones que la base. Una
 * fila que no las cumple (la ficha cambió desde la propuesta, otra persona ya lo
 * creó) se deja fuera aquí: en la base haría fallar el lote entero.
 */
export function filasParaInsertar(
  elegidos: ViajeElegido[],
  personas: { id: string; baggage: string; active: boolean; start_date: string; end_date: string | null }[],
  viajes: { person_id: string; date: string; direction: string }[],
  archivo: string,
  hoy: string,
): { filas: FilaParaInsertar[]; omitidas: number } {
  const porId = new Map(personas.map((p) => [p.id, p]));
  const existentes = new Set(viajes.map((v) => `${v.person_id}|${v.date}|${v.direction}`));
  const notas = `Planificado desde «${archivo.replace(/[\u0000-\u001f]/g, " ").slice(0, 80)}» con ${NOMBRE_DE_BITA}.`;
  const filas: FilaParaInsertar[] = [];
  const vistas = new Set<string>();
  for (const v of elegidos) {
    const p = porId.get(v.personaId);
    const clave = `${v.personaId}|${v.fecha}|${v.sentido}`;
    const sirve =
      !!p &&
      p.active &&
      v.fecha >= hoy &&
      v.fecha >= p.start_date &&
      (!p.end_date || v.fecha <= p.end_date) &&
      !existentes.has(clave) &&
      !vistas.has(clave) &&
      !!v.origen.trim() &&
      !!v.destino.trim();
    if (!sirve || !p) continue;
    vistas.add(clave);
    filas.push({
      person_id: p.id,
      date: v.fecha,
      direction: v.sentido,
      origin: v.origen,
      destination: v.destino,
      requested_time: v.hora,
      baggage: p.baggage,
      status: "Planificado",
      pnr: "",
      flight: "",
      amount: null,
      notes: notas,
    });
  }
  return { filas, omitidas: elegidos.length - filas.length };
}
