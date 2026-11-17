// Leer el documento que la persona le pasa a Bita: Excel (.xlsx), Word (.docx)
// y PDF con texto. Devuelve bloques de texto o de tabla, sin interpretar nada:
// qué es un nombre o una fecha lo decide el enmascarado y luego el modelo.
//
// El archivo es del usuario y no se confía en él: el tipo sale del contenido (no
// del nombre), el tamaño y lo que se descomprime tienen tope, y todo lo que se
// lee se corta en hojas, filas, páginas y caracteres. Nada se guarda.
import readXlsxFile, { readSheetNames } from "read-excel-file/node";
import { unzipSync } from "fflate";
import { extractText, getDocumentProxy } from "unpdf";

export type FormatoDocumento = "xlsx" | "docx" | "pdf";
export type Fila = { n: number; celdas: string[] };
export type Bloque = { tipo: "tabla"; titulo: string; filas: Fila[] } | { tipo: "texto"; lineas: string[] };
export type Extraido = { formato: FormatoDocumento; bloques: Bloque[]; truncado: boolean };

/** Vercel corta el cuerpo de una función en 4,5 MB: un poco menos, para el resto del formulario. */
export const MAX_ARCHIVO_BYTES = 4 * 1024 * 1024;
/** Lo que un .xlsx o .docx puede ocupar ya descomprimido: protege de un archivo que explota. */
const MAX_DESCOMPRIMIDO = 64 * 1024 * 1024;
const MAX_XML_DOCX = 24 * 1024 * 1024;
const MAX_HOJAS = 6;
const MAX_FILAS_POR_HOJA = 500;
const MAX_COLUMNAS = 30;
const MAX_PAGINAS = 40;
const MAX_CELDA = 200;
/** Caracteres de texto que llegan al modelo (unos 20.000 tokens). */
export const MAX_TEXTO = 60_000;

export type CodigoDeDocumento = "formato" | "grande" | "protegido" | "ilegible" | "vacio";

/** Un archivo que no se puede usar, con lo que se le dice a la persona. No cuesta ningún mensaje. */
export class ErrorDeDocumento extends Error {
  readonly codigo: CodigoDeDocumento;
  readonly estado: 413 | 415 | 422;
  constructor(codigo: CodigoDeDocumento, mensaje: string) {
    super(mensaje);
    this.name = "ErrorDeDocumento";
    this.codigo = codigo;
    this.estado = codigo === "grande" ? 413 : codigo === "formato" ? 415 : 422;
  }
}

const MENSAJE_FORMATO =
  "Bita lee Excel (.xlsx), Word (.docx) y PDF con texto. Si tu archivo es .xls o .doc, guárdalo como .xlsx o .docx.";
const MENSAJE_ILEGIBLE = "No pude leer el archivo. Pruébalo con otro o guárdalo de nuevo.";

const espacios = (texto: string) => texto.replace(/\s+/g, " ").trim();

function sobre(bytes: Uint8Array, inicio: number[]): boolean {
  return inicio.every((valor, i) => bytes[i] === valor);
}

/** El formato según el contenido. Un .xlsx y un .docx son zip: se distinguen por sus carpetas. */
export function detectarFormato(bytes: Uint8Array): FormatoDocumento | null {
  if (sobre(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
  if (!sobre(bytes, [0x50, 0x4b, 0x03, 0x04])) return null;
  const nombres = new Set<string>();
  let total = 0;
  try {
    unzipSync(bytes, {
      filter: (archivo) => {
        nombres.add(archivo.name);
        total += archivo.originalSize;
        return false;
      },
    });
  } catch {
    throw new ErrorDeDocumento("ilegible", MENSAJE_ILEGIBLE);
  }
  if (total > MAX_DESCOMPRIMIDO) throw new ErrorDeDocumento("grande", "El archivo ocupa demasiado por dentro. Pásame uno más liviano.");
  if (nombres.has("xl/workbook.xml")) return "xlsx";
  if (nombres.has("word/document.xml")) return "docx";
  return null;
}

// ── Excel ──────────────────────────────────────────────────────────────────

const dos = (n: number) => String(n).padStart(2, "0");

/** Una celda como texto. Las fechas de Excel llegan como Date en UTC; una hora sola cae en 1899. */
export function celdaATexto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return "";
    const hora = `${dos(valor.getUTCHours())}:${dos(valor.getUTCMinutes())}`;
    if (valor.getUTCFullYear() < 1910) return hora;
    const dia = `${valor.getUTCFullYear()}-${dos(valor.getUTCMonth() + 1)}-${dos(valor.getUTCDate())}`;
    return hora === "00:00" ? dia : `${dia} ${hora}`;
  }
  if (typeof valor === "boolean") return valor ? "sí" : "no";
  return espacios(String(valor)).slice(0, MAX_CELDA);
}

async function leerXlsx(bytes: Uint8Array): Promise<{ bloques: Bloque[]; truncado: boolean }> {
  const buffer = Buffer.from(bytes);
  let hojas: string[];
  try {
    hojas = await readSheetNames(buffer);
  } catch {
    throw new ErrorDeDocumento("ilegible", MENSAJE_ILEGIBLE);
  }
  let truncado = hojas.length > MAX_HOJAS;
  const bloques: Bloque[] = [];
  for (const nombre of hojas.slice(0, MAX_HOJAS)) {
    let filas: unknown[][];
    try {
      filas = (await readXlsxFile(buffer, { sheet: nombre })) as unknown[][];
    } catch {
      throw new ErrorDeDocumento("ilegible", MENSAJE_ILEGIBLE);
    }
    const utiles: Fila[] = [];
    for (const [indice, fila] of filas.entries()) {
      const celdas = fila.slice(0, MAX_COLUMNAS).map(celdaATexto);
      while (celdas.length && !celdas[celdas.length - 1]) celdas.pop();
      if (!celdas.length) continue;
      if (utiles.length >= MAX_FILAS_POR_HOJA) {
        truncado = true;
        break;
      }
      utiles.push({ n: indice + 1, celdas });
    }
    if (utiles.length) bloques.push({ tipo: "tabla", titulo: espacios(nombre).slice(0, 60), filas: utiles });
  }
  return { bloques, truncado };
}

// ── Word ───────────────────────────────────────────────────────────────────

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function sinEntidades(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const codigo = e[1].toLowerCase() === "x" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isSafeInteger(codigo) && codigo > 0 && codigo <= 0x10ffff ? String.fromCodePoint(codigo) : "";
    }
    return ENTIDADES[e.toLowerCase()] ?? m;
  });
}

/**
 * El texto de word/document.xml. Una tabla sale como una fila por línea y las
 * celdas separadas; el resto, un párrafo por línea. No lee encabezados, pies ni
 * comentarios.
 */
export function textoDeDocx(xml: string): Bloque[] {
  const bloques: Bloque[] = [];
  let lineas: string[] = [];
  let filas: Fila[] = [];
  let celdas: string[] = [];
  let celda: string[] = [];
  let parrafo = "";
  let profundidad = 0; // tablas anidadas se leen como una sola
  let numeroDeFila = 0;
  const cerrarTexto = () => {
    if (lineas.length) bloques.push({ tipo: "texto", lineas });
    lineas = [];
  };
  const cerrarTabla = () => {
    if (filas.length) bloques.push({ tipo: "tabla", titulo: "Tabla", filas });
    filas = [];
  };

  const etiquetas = /<(\/?)w:(tbl|tr|tc|p|t|tab|br)\b([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = etiquetas.exec(xml))) {
    const [, cierra, nombre, , autocierre] = m;
    if (nombre === "t" && !cierra && !autocierre) {
      const fin = xml.indexOf("</w:t>", etiquetas.lastIndex);
      if (fin === -1) break;
      parrafo += sinEntidades(xml.slice(etiquetas.lastIndex, fin));
      etiquetas.lastIndex = fin + "</w:t>".length;
    } else if (nombre === "tab" && !cierra) parrafo += " ";
    else if (nombre === "br" && !cierra) parrafo += " ";
    else if (nombre === "p" && cierra) {
      const texto = espacios(parrafo);
      parrafo = "";
      if (profundidad > 0) {
        if (texto) celda.push(texto);
      } else if (texto) lineas.push(texto);
    } else if (nombre === "tbl") {
      if (!cierra) {
        if (profundidad === 0) {
          cerrarTexto();
          numeroDeFila = 0;
        }
        profundidad += 1;
      } else {
        profundidad = Math.max(0, profundidad - 1);
        if (profundidad === 0) cerrarTabla();
      }
    } else if (nombre === "tc" && cierra && profundidad > 0) {
      celdas.push(celda.join(" ").slice(0, MAX_CELDA));
      celda = [];
    } else if (nombre === "tr" && cierra && profundidad > 0) {
      numeroDeFila += 1;
      while (celdas.length && !celdas[celdas.length - 1]) celdas.pop();
      if (celdas.length) filas.push({ n: numeroDeFila, celdas: celdas.slice(0, MAX_COLUMNAS) });
      celdas = [];
    }
  }
  cerrarTexto();
  cerrarTabla();
  return bloques;
}

function leerDocx(bytes: Uint8Array): { bloques: Bloque[]; truncado: boolean } {
  let xml: string;
  try {
    const archivos = unzipSync(bytes, { filter: (a) => a.name === "word/document.xml" && a.originalSize <= MAX_XML_DOCX });
    const documento = archivos["word/document.xml"];
    if (!documento) throw new ErrorDeDocumento("ilegible", MENSAJE_ILEGIBLE);
    xml = new TextDecoder("utf-8").decode(documento);
  } catch (fallo) {
    if (fallo instanceof ErrorDeDocumento) throw fallo;
    throw new ErrorDeDocumento("ilegible", MENSAJE_ILEGIBLE);
  }
  return { bloques: textoDeDocx(xml), truncado: false };
}

// ── PDF ────────────────────────────────────────────────────────────────────

async function leerPdf(bytes: Uint8Array): Promise<{ bloques: Bloque[]; truncado: boolean }> {
  try {
    // El pdf.js que trae unpdf 2.x ya no usa eval ni new Function (la vía por la que
    // un PDF armado a propósito ejecutaba código en versiones viejas): no hay opción que cerrar.
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: false });
    const paginas = Array.isArray(text) ? text : [text];
    const lineas: string[] = [];
    for (const [i, pagina] of paginas.slice(0, MAX_PAGINAS).entries()) {
      const delaPagina = pagina.split(/\r?\n/).map(espacios).filter(Boolean);
      if (!delaPagina.length) continue;
      if (paginas.length > 1) lineas.push(`--- página ${i + 1} ---`);
      lineas.push(...delaPagina.map((l) => l.slice(0, MAX_CELDA * 3)));
    }
    if (!lineas.length)
      throw new ErrorDeDocumento(
        "ilegible",
        "No encontré texto en el PDF. Si es una foto o un escaneo, no lo puedo leer: pásame un PDF con texto, un Excel o un Word.",
      );
    return { bloques: [{ tipo: "texto", lineas }], truncado: paginas.length > MAX_PAGINAS };
  } catch (fallo) {
    if (fallo instanceof ErrorDeDocumento) throw fallo;
    if (fallo instanceof Error && fallo.name === "PasswordException")
      throw new ErrorDeDocumento("protegido", "El PDF tiene contraseña. Quítasela y vuelve a subirlo.");
    throw new ErrorDeDocumento("ilegible", MENSAJE_ILEGIBLE);
  }
}

// ── Entrada ────────────────────────────────────────────────────────────────

export async function extraerDocumento(bytes: Uint8Array): Promise<Extraido> {
  if (!bytes.length) throw new ErrorDeDocumento("vacio", "El archivo está vacío.");
  if (bytes.length > MAX_ARCHIVO_BYTES)
    throw new ErrorDeDocumento("grande", `El archivo pesa más de ${MAX_ARCHIVO_BYTES / 1024 / 1024} MB. Pásame uno más liviano.`);
  const formato = detectarFormato(bytes);
  if (!formato) throw new ErrorDeDocumento("formato", MENSAJE_FORMATO);
  const { bloques, truncado } =
    formato === "xlsx" ? await leerXlsx(bytes) : formato === "docx" ? leerDocx(bytes) : await leerPdf(bytes);
  const conContenido = bloques.some((b) => (b.tipo === "tabla" ? b.filas.length : b.lineas.length));
  if (!conContenido) throw new ErrorDeDocumento("vacio", "El archivo no tiene contenido que leer.");
  return { formato, bloques, truncado };
}

/** Los bloques como un solo texto para el modelo, cortado en MAX_TEXTO. Cada fila de tabla lleva su número. */
export function aTexto(bloques: Bloque[], limite = MAX_TEXTO): { texto: string; truncado: boolean } {
  const salida: string[] = [];
  let largo = 0;
  let truncado = false;
  const agregar = (linea: string) => {
    if (truncado) return;
    if (largo + linea.length + 1 > limite) {
      truncado = true;
      return;
    }
    salida.push(linea);
    largo += linea.length + 1;
  };
  for (const bloque of bloques) {
    if (bloque.tipo === "texto") for (const linea of bloque.lineas) agregar(linea);
    else {
      agregar(`## ${bloque.titulo}`);
      for (const fila of bloque.filas) agregar(`[fila ${fila.n}] ${fila.celdas.join(" | ")}`);
    }
  }
  return { texto: salida.join("\n"), truncado };
}
