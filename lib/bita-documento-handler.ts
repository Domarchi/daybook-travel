// POST /api/bita/documento: Bita lee un Excel, Word o PDF y propone los viajes
// que encuentra. NO crea nada: devuelve una propuesta que la persona revisa y
// confirma en pantalla, y los viajes los inserta su navegador con su sesión, por
// la misma vía que «Nuevo viaje» y «Planificar turnos» (queda auditado a su
// nombre). Este servidor no escribe en ninguna tabla.
//
// Orden de las comprobaciones: interruptor → llave → sesión → miembro →
// formulario → tamaño → archivo legible → cupo → datos → modelo. El cupo se
// reserva DESPUÉS de leer el archivo: un archivo que no se puede abrir no gasta
// ningún mensaje. Un documento cuenta como un mensaje.
import { clasificarFallo, ErrorDeBita } from "./bita-agente.ts";
import { bitaHabilitada, bitaTieneLlave, cupoDiario, modeloDeBita, type EntornoBita } from "./bita-config.ts";
import { aTexto, extraerDocumento, ErrorDeDocumento, MAX_ARCHIVO_BYTES } from "./bita-documento.ts";
import { crearMascara } from "./bita-documento-mascara.ts";
import { leerConModelo, type ResultadoDeLectura } from "./bita-documento-modelo.ts";
import { armarPropuesta, type Propuesta } from "./bita-documento-propuesta.ts";
import type { DatosBita } from "./bita-herramientas.ts";
import { json, quien, type DependenciasBita } from "./bita-handler.ts";
import { crearSeudonimos } from "./bita-seudonimos.ts";

const MARGEN_DEL_FORMULARIO = 256 * 1024;

const AVISO_DE_LECTURA: Record<Exclude<ResultadoDeLectura, "ok">, string> = {
  negativa: "No pude leer este documento.",
  corte: "El documento trae demasiados viajes para leerlos de una vez. Divídelo en partes y súbelas por separado.",
  sin_herramienta: "No encontré viajes en el documento.",
};

const registrarPorOmision = (evento: string, datos: Record<string, unknown>) => console.info(JSON.stringify({ evento, ...datos }));

type ArchivoSubido = { name?: unknown; size?: unknown; arrayBuffer: () => Promise<ArrayBuffer> };
const esArchivo = (v: unknown): v is ArchivoSubido =>
  !!v && typeof v === "object" && typeof (v as ArchivoSubido).arrayBuffer === "function";

export async function manejarDocumento({ request, env, deps }: { request: Request; env: EntornoBita; deps: DependenciasBita }) {
  if (!bitaHabilitada(env)) return json({ error: "not_found" }, 404);
  if (!bitaTieneLlave(env)) return json({ error: "Bita no está configurada." }, 503);
  const registrar = deps.registrar ?? registrarPorOmision;
  const persona = await quien(request, deps);
  if (persona instanceof Response) return persona;

  if (!(request.headers.get("content-type") ?? "").includes("multipart/form-data"))
    return json({ error: "Envía el archivo como formulario." }, 415);
  const declarado = Number(request.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > MAX_ARCHIVO_BYTES + MARGEN_DEL_FORMULARIO)
    return json({ error: `El archivo pesa más de ${MAX_ARCHIVO_BYTES / 1024 / 1024} MB. Pásame uno más liviano.` }, 413);
  let formulario: FormData;
  try {
    formulario = await request.formData();
  } catch {
    return json({ error: "No pude leer el archivo que enviaste." }, 400);
  }
  const archivo = formulario.get("archivo");
  if (!esArchivo(archivo)) return json({ error: "Falta el archivo." }, 400);
  const nombre =
    String(typeof archivo.name === "string" ? archivo.name : "")
      .replace(/[\\/\u0000-\u001f]/g, "")
      .trim()
      .slice(0, 120) || "documento";

  let extraido;
  try {
    extraido = await extraerDocumento(new Uint8Array(await archivo.arrayBuffer()));
  } catch (fallo) {
    if (fallo instanceof ErrorDeDocumento) {
      registrar("bita_documento_rechazado", { motivo: fallo.codigo });
      return json({ error: fallo.message }, fallo.estado);
    }
    registrar("bita_documento_rechazado", { motivo: "inesperado" });
    return json({ error: "No pude leer el archivo. Pruébalo con otro." }, 422);
  }

  const limite = cupoDiario(env);
  let reserva: { permitido: boolean; usados: number };
  try {
    reserva = await deps.cupo.reservar(persona.userId, limite);
  } catch {
    registrar("bita_cupo_no_disponible", {});
    return json({ error: "Bita no está disponible por ahora." }, 503);
  }
  if (!reserva.permitido)
    return json({ error: `Llegaste al límite de ${limite} mensajes de hoy. Mañana vuelve a estar disponible.` }, 429);
  const restantes = Math.max(0, limite - reserva.usados);
  const devolver = () => deps.cupo.devolver(persona.userId).catch(() => registrar("bita_devolucion_fallida", {}));

  let datos: DatosBita;
  try {
    datos = { ...(await deps.cargarDatos(persona.token)), hoy: deps.hoy() };
  } catch {
    await devolver();
    registrar("bita_datos_no_disponibles", {});
    return json({ error: "Bita no pudo leer los viajes. Intenta de nuevo." }, 503);
  }

  // Todo lo que sigue sale hacia el modelo ya sin nombres, reservas, vuelos, montos ni contacto.
  const seud = crearSeudonimos(datos.personas, datos.viajes);
  const mascara = crearMascara({ personas: datos.personas, viajes: datos.viajes, seud });
  const { texto, truncado } = aTexto(mascara.bloques(extraido.bloques));
  const nombreSinExtension = nombre.replace(/\.[A-Za-z0-9]{2,5}$/, "");

  try {
    const lectura = await leerConModelo({
      cliente: deps.cliente(),
      modelo: modeloDeBita(env),
      hoy: datos.hoy,
      nombre: mascara.texto(nombreSinExtension),
      formato: extraido.formato,
      texto,
      truncado: extraido.truncado || truncado,
    });
    const vacia: Propuesta = {
      resumen: lectura.resultado === "ok" ? "" : AVISO_DE_LECTURA[lectura.resultado],
      filas: [],
      sinIdentificar: [],
      omitidos: 0,
    };
    const propuesta =
      lectura.resultado === "ok" ? armarPropuesta(lectura.salida, { datos, seud, restaurarArchivo: mascara.restaurar }) : vacia;
    const por = (estado: string) => propuesta.filas.filter((f) => f.estado === estado).length;
    registrar("bita_documento", {
      formato: extraido.formato,
      caracteres: texto.length,
      resultado: lectura.resultado,
      nuevos: por("nuevo"),
      existen: por("existe"),
      conProblema: por("problema"),
      sinIdentificar: propuesta.sinIdentificar.length,
      personasSinFicha: mascara.sinFicha(),
      tokensEntrada: lectura.tokensEntrada,
      tokensSalida: lectura.tokensSalida,
    });
    return json({
      archivo: nombre,
      formato: extraido.formato,
      truncado: extraido.truncado || truncado,
      ...propuesta,
      restantes,
      limite,
    });
  } catch (fallo) {
    const veredicto = clasificarFallo(fallo);
    const gastado = fallo instanceof ErrorDeBita && fallo.tokensEntrada + fallo.tokensSalida > 0;
    if (!gastado && veredicto.devolver) await devolver();
    registrar("bita_fallo", { motivo: veredicto.motivo, documento: true });
    return json({ error: veredicto.mensaje }, veredicto.estado);
  }
}
