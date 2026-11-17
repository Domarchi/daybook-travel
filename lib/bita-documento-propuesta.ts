// Lo que el modelo propone a partir de un documento, comprobado por el servidor.
//
// El modelo lee y propone; no decide qué se crea. Cada viaje que dice haber
// encontrado se revisa aquí contra la agenda y las fichas, con las mismas reglas
// que la pantalla y la base (vigencia de la persona, un solo movimiento por
// persona, fecha y sentido), y sale con un estado: nuevo, ya existe o con
// problema. Solo los «nuevos» se pueden crear, y los crea el navegador de quien
// confirma, no este servidor.
//
// Puro: sin red ni base.
import { addDays } from "./calendar.ts";
import type { DatosBita } from "./bita-herramientas.ts";
import { PATRON_PERSONA, type Seudonimos } from "./bita-seudonimos.ts";
import type { Person } from "./types.ts";

export const MAX_VIAJES = 60;
const MAX_SIN_IDENTIFICAR = 20;
const DIAS_HACIA_ADELANTE = 400;

export type EstadoDeFila = "nuevo" | "existe" | "problema";
export type Sentido = "SUBIDA" | "BAJADA";

export type FilaPropuesta = {
  /** persona|fecha|sentido: identifica la fila en la pantalla. */
  clave: string;
  personaId: string;
  persona: string;
  fecha: string;
  sentido: Sentido | null;
  origen: string;
  destino: string;
  hora: string | null;
  /** Número de fila del archivo de donde salió, si el modelo lo dijo. */
  fila: number | null;
  estado: EstadoDeFila;
  detalle: string;
  /** Si ya existe, el viaje de la agenda. */
  viajeId?: string;
};

export type SinIdentificar = { referencia: string; motivo: string };

export type Propuesta = {
  resumen: string;
  filas: FilaPropuesta[];
  sinIdentificar: SinIdentificar[];
  /** Filas repetidas o sobrantes que se dejaron fuera. */
  omitidos: number;
};

const norm = (texto: string) => texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
const cortar = (texto: string, largo: number) => texto.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, largo);

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const texto = (v: unknown) => (typeof v === "string" ? v : "");

export function fechaValida(valor: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!m) return false;
  const [, a, mes, d] = m.map(Number) as [number, number, number, number];
  const fecha = new Date(Date.UTC(a, mes - 1, d));
  return fecha.getUTCFullYear() === a && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === d;
}

export function horaValida(valor: unknown): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(texto(valor).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 23 && min <= 59 ? `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}` : null;
}

/** Un lugar como lo escribió el documento, solo para mostrarlo: sin seudónimos ni símbolos raros. */
function lugarLimpio(valor: unknown): string {
  const limpio = cortar(
    texto(valor).replace(/Persona sin ficha \d+|\bP-[0-9a-f]{4}(?:[0-9a-f]{4})?\b|\[[^\]]*\]/g, " "),
    40,
  );
  return /^[\p{L}][\p{L} .,'-]*$/u.test(limpio) ? limpio : "";
}

/** Sube o baja según el origen y el destino que dice el documento, comparados con la ficha. */
export function sentidoPorRuta(persona: Pick<Person, "origin" | "destination">, origen: string, destino: string): Sentido | null {
  const o = norm(origen);
  const d = norm(destino);
  const casa = norm(persona.origin);
  const faena = norm(persona.destination);
  const sube = (o && o === casa) || (d && d === faena);
  const baja = (o && o === faena) || (d && d === casa);
  if (sube && !baja) return "SUBIDA";
  if (baja && !sube) return "BAJADA";
  return null;
}

const esSentido = (v: unknown): v is Sentido => v === "SUBIDA" || v === "BAJADA";

export function armarPropuesta(
  salida: unknown,
  { datos, seud, restaurarArchivo }: { datos: DatosBita; seud: Seudonimos; restaurarArchivo: (texto: string) => string },
): Propuesta {
  const raiz = objeto(salida) ?? {};
  const personas = new Map(datos.personas.map((p) => [p.id, p]));
  const existentes = new Map<string, string>();
  for (const v of datos.viajes) existentes.set(`${v.person_id}|${v.date}|${v.direction}`, v.id);
  const limite = addDays(datos.hoy, DIAS_HACIA_ADELANTE);
  const paraPantalla = (t: string, largo: number) => cortar(restaurarArchivo(seud.restaurar(t)), largo);

  const sinIdentificar: SinIdentificar[] = [];
  const vistas = new Set<string>();
  const sinPersona = (referencia: string, motivo: string) => {
    const r = referencia || "Una fila sin nombre";
    if (vistas.has(r) || sinIdentificar.length >= MAX_SIN_IDENTIFICAR) return;
    vistas.add(r);
    sinIdentificar.push({ referencia: r, motivo });
  };

  const filas: FilaPropuesta[] = [];
  const claves = new Set<string>();
  let omitidos = 0;
  const crudas = Array.isArray(raiz.viajes) ? raiz.viajes : [];
  for (const cruda of crudas) {
    const v = objeto(cruda);
    if (!v) continue;
    const dicho = texto(v.persona);
    const token = dicho.match(new RegExp(PATRON_PERSONA.source))?.[0];
    const personaId = token ? seud.idDePersona(token) : null;
    const persona = personaId ? personas.get(personaId) : undefined;
    if (!persona) {
      sinPersona(paraPantalla(dicho, 80), "No tiene ficha en Travel.");
      continue;
    }
    if (filas.length >= MAX_VIAJES) {
      omitidos += 1;
      continue;
    }

    const fecha = texto(v.fecha).trim();
    const origenDoc = lugarLimpio(v.origen);
    const destinoDoc = lugarLimpio(v.destino);
    const sentido = sentidoPorRuta(persona, origenDoc, destinoDoc) ?? (esSentido(v.sentido) ? v.sentido : null);
    const base = {
      personaId: persona.id,
      persona: persona.name,
      fecha,
      sentido,
      hora: horaValida(v.hora),
      fila: Number.isSafeInteger(v.fila) && Number(v.fila) > 0 ? Number(v.fila) : null,
    };
    const ruta = sentido === "BAJADA" ? [persona.destination, persona.origin] : [persona.origin, persona.destination];
    const [origen, destino] = ruta as [string, string];

    const clave = `${persona.id}|${fecha}|${sentido ?? "?"}`;
    if (claves.has(clave)) {
      omitidos += 1;
      continue;
    }
    claves.add(clave);
    const fila = (estado: EstadoDeFila, detalle: string, extra: Partial<FilaPropuesta> = {}): FilaPropuesta => ({
      ...base,
      clave,
      origen,
      destino,
      estado,
      detalle,
      ...extra,
    });

    if (!fechaValida(fecha)) filas.push(fila("problema", "La fecha no es válida."));
    else if (!sentido) filas.push(fila("problema", "No se pudo saber si sube o baja. Créalo desde Nuevo viaje."));
    else if (fecha < datos.hoy) filas.push(fila("problema", "La fecha ya pasó."));
    else if (fecha > limite) filas.push(fila("problema", "La fecha está demasiado lejos."));
    else if (!persona.active) filas.push(fila("problema", "La persona está inactiva."));
    else if (fecha < persona.start_date || (persona.end_date && fecha > persona.end_date))
      filas.push(fila("problema", `Fuera de la vigencia de la ficha (${persona.start_date} a ${persona.end_date ?? "sin término"}).`));
    else {
      const ya = existentes.get(`${persona.id}|${fecha}|${sentido}`);
      if (ya) filas.push(fila("existe", "Ya está en la agenda.", { viajeId: ya }));
      else {
        const distinta = origenDoc && destinoDoc && (norm(origenDoc) !== norm(origen) || norm(destinoDoc) !== norm(destino));
        filas.push(fila("nuevo", distinta ? `El archivo dice ${origenDoc} → ${destinoDoc}; se usa la ruta de la ficha.` : ""));
      }
    }
  }

  const delModelo = Array.isArray(raiz.sin_identificar) ? raiz.sin_identificar : [];
  for (const item of delModelo) {
    const s = objeto(item);
    if (!s) continue;
    const referencia = paraPantalla(texto(s.referencia), 80);
    if (referencia) sinPersona(referencia, paraPantalla(texto(s.motivo), 120) || "No se pudo leer.");
  }

  // Lo que se puede crear primero; dentro de cada grupo, por fecha.
  const rango: Record<EstadoDeFila, number> = { nuevo: 0, existe: 1, problema: 2 };
  filas.sort(
    (a, b) =>
      rango[a.estado] - rango[b.estado] ||
      a.fecha.localeCompare(b.fecha) ||
      a.persona.localeCompare(b.persona, "es") ||
      String(a.sentido).localeCompare(String(b.sentido)),
  );
  return { resumen: paraPantalla(texto(raiz.resumen), 300), filas, sinIdentificar, omitidos };
}
