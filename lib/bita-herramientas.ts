// Las herramientas de Bita en Travel. Todas SOLO LEEN: Bita no crea, edita ni
// anula viajes, ni cambia personas o documentos.
//
// Las cuentas no son nuevas: salen de las mismas funciones que usa la pantalla
// (lib/purchase, lib/accreditation, lib/costs, lib/historial), así que Bita y
// la agenda no pueden discrepar. Los datos llegan ya leídos con la sesión de la
// persona (RLS), y aquí se reducen a una lista blanca:
//   - personas y viajes por seudónimo (P-xxxx, V-xxxx), nunca por nombre;
//   - nunca el código de reserva, el número de vuelo ni montos de un viaje o de
//     una persona (sí totales por mes o por ruta, con su cobertura);
//   - notas y motivos enmascarados y con los nombres reemplazados.
//
// Pura: sin red ni base. El historial de un viaje lo trae `leerHistorial`.

import type Anthropic from "@anthropic-ai/sdk";
import { motivosDeAcreditacion, textoDeMotivo, type DocumentoDePersona, type TipoDeDocumento } from "./accreditation.ts";
import { addDays } from "./calendar.ts";
import { cobertura, porMes, porRuta, mesDe } from "./costs.ts";
import { cambiosDe, notaDelCambio } from "./historial.ts";
import { diasParaVolar, estadoDeCompra, porComprarAhora, resumenDeCompra, type EstadoCompra } from "./purchase.ts";
import type { Seudonimos } from "./bita-seudonimos.ts";
import type { HistoryItem, Person, Trip } from "./types.ts";

export type DatosBita = {
  /** Hoy en Santiago, AAAA-MM-DD. */
  hoy: string;
  ventana: number;
  personas: Person[];
  viajes: Trip[];
  tipos: TipoDeDocumento[];
  documentos: DocumentoDePersona[];
};

export type ContextoHerramientas = {
  datos: DatosBita;
  seud: Seudonimos;
  leerHistorial: (tripId: string) => Promise<HistoryItem[]>;
};

export type ResultadoHerramienta = { contenido: string; esError: boolean };

/** Lo que vuelve al modelo se paga otra vez como entrada en la vuelta siguiente. */
export const MAX_CARACTERES_RESULTADO = 9000;
export const MAX_DIAS_AGENDA = 31;
const MAX_FILAS = 60;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

const ESTADO_COMPRA: Record<EstadoCompra, string> = {
  resuelto: "con reserva",
  cerrado: "anulado",
  sin_cerrar: "sin cerrar (pasó hace más de 14 días sin reserva)",
  vencido: "vencido sin reserva",
  urgente: "por comprar ahora",
  proximo: "todavía no toca comprar",
};

export const HERRAMIENTAS: Anthropic.Tool[] = [
  {
    name: "agenda",
    description:
      "Viajes (subidas y bajadas) entre dos fechas, sin los anulados: quién viaja, ruta, hora pedida, estado y si ya tiene reserva. " +
      `Por omisión, de hoy a 6 días más. Máximo ${MAX_DIAS_AGENDA} días.`,
    input_schema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "AAAA-MM-DD" },
        hasta: { type: "string", description: "AAAA-MM-DD" },
      },
    },
  },
  {
    name: "viajes_de_persona",
    description:
      "Para una persona por su seudónimo (P-xxxx): su turno, vigencia y origen, y sus próximos viajes y los últimos pasados.",
    input_schema: {
      type: "object",
      properties: { persona: { type: "string", description: "Seudónimo P-xxxx." } },
      required: ["persona"],
    },
  },
  {
    name: "por_comprar",
    description:
      "La cola de compra de hoy: cuántos viajes hay por comprar ahora, vencidos y sin cerrar, las fechas abiertas y la lista de los que hay que atender.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "costos",
    description:
      "Gasto en pasajes agrupado por mes o por ruta, con cuántos viajes tienen monto (cobertura). Opcionalmente, solo un mes.",
    input_schema: {
      type: "object",
      properties: {
        agrupar: { type: "string", enum: ["mes", "ruta"] },
        mes: { type: "string", description: "AAAA-MM, opcional." },
      },
      required: ["agrupar"],
    },
  },
  {
    name: "acreditacion",
    description:
      "Viajes entre dos fechas cuya persona tiene documentos faltantes o vencidos para esa fecha. Por omisión, los próximos 30 días.",
    input_schema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "AAAA-MM-DD" },
        hasta: { type: "string", description: "AAAA-MM-DD" },
      },
    },
  },
  {
    name: "historial_de_viaje",
    description: "Qué cambió en un viaje (V-xxxx), cuándo y con qué motivo.",
    input_schema: {
      type: "object",
      properties: { viaje: { type: "string", description: "Seudónimo V-xxxx." } },
      required: ["viaje"],
    },
  },
];

const error = (mensaje: string): ResultadoHerramienta => ({ contenido: JSON.stringify({ error: mensaje }), esError: true });

function serializar(valor: unknown): string {
  const texto = JSON.stringify(valor);
  if (texto.length <= MAX_CARACTERES_RESULTADO) return texto;
  return JSON.stringify({ aviso: "Resultado recortado por tamaño.", datos: texto.slice(0, MAX_CARACTERES_RESULTADO) });
}

const objeto = (valor: unknown): Record<string, unknown> =>
  valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};

/** Lo que el modelo sabe de un viaje. Sin reserva, vuelo ni monto. */
export function lineaDeViaje(viaje: Trip, ctx: ContextoHerramientas) {
  const { datos, seud } = ctx;
  return {
    viaje: seud.viaje(viaje.id),
    fecha: viaje.date,
    sentido: viaje.direction === "SUBIDA" ? "sube" : "baja",
    persona: seud.persona(viaje.person_id),
    ruta: `${viaje.origin} → ${viaje.destination}`,
    hora: viaje.requested_time ? viaje.requested_time.slice(0, 5) : "por confirmar",
    equipaje: viaje.baggage,
    estado: viaje.status,
    tiene_reserva: Boolean((viaje.pnr ?? "").trim()),
    compra: ESTADO_COMPRA[estadoDeCompra(viaje, datos.hoy, datos.ventana)],
    dias_para_volar: diasParaVolar(viaje.date, datos.hoy),
  };
}

function rango(entrada: Record<string, unknown>, hoy: string, diasPorOmision: number) {
  const desde = typeof entrada.desde === "string" && FECHA.test(entrada.desde) ? entrada.desde : hoy;
  const hastaPedido =
    typeof entrada.hasta === "string" && FECHA.test(entrada.hasta) ? entrada.hasta : addDays(desde, diasPorOmision);
  if (hastaPedido < desde) return { error: "«hasta» no puede ser antes de «desde»." };
  const tope = addDays(desde, MAX_DIAS_AGENDA - 1);
  return { desde, hasta: hastaPedido > tope ? tope : hastaPedido, recortado: hastaPedido > tope };
}

const porFechaYHora = (a: Trip, b: Trip) =>
  a.date.localeCompare(b.date) || (a.requested_time ?? "99").localeCompare(b.requested_time ?? "99");

export async function ejecutarHerramienta(
  nombre: string,
  entrada: unknown,
  ctx: ContextoHerramientas,
): Promise<ResultadoHerramienta> {
  const { datos, seud } = ctx;
  const valores = objeto(entrada);

  if (nombre === "agenda") {
    const r = rango(valores, datos.hoy, 6);
    if ("error" in r) return error(r.error);
    const viajes = datos.viajes
      .filter((v) => v.status !== "Anulado" && v.date >= r.desde && v.date <= r.hasta)
      .sort(porFechaYHora);
    return {
      contenido: serializar({
        hoy: datos.hoy,
        desde: r.desde,
        hasta: r.hasta,
        ...(r.recortado ? { aviso: `Se muestran solo ${MAX_DIAS_AGENDA} días.` } : {}),
        total: viajes.length,
        viajes: viajes.slice(0, MAX_FILAS).map((v) => lineaDeViaje(v, ctx)),
      }),
      esError: false,
    };
  }

  if (nombre === "viajes_de_persona") {
    const token = typeof valores.persona === "string" ? valores.persona : "";
    const id = seud.idDePersona(token);
    const persona = id ? datos.personas.find((p) => p.id === id) : undefined;
    if (!persona) return error("No conozco ese seudónimo de persona. Usa el P-xxxx que aparece en la pregunta.");
    const suyos = datos.viajes.filter((v) => v.person_id === persona.id && v.status !== "Anulado").sort(porFechaYHora);
    return {
      contenido: serializar({
        persona: seud.persona(persona.id),
        activa: persona.active,
        turno: persona.shift,
        vigente_desde: persona.start_date,
        vigente_hasta: persona.end_date ?? "sin término",
        origen_habitual: persona.origin,
        destino: persona.destination,
        equipaje_habitual: persona.baggage,
        proximos: suyos.filter((v) => v.date >= datos.hoy).slice(0, 10).map((v) => lineaDeViaje(v, ctx)),
        ultimos: suyos.filter((v) => v.date < datos.hoy).slice(-5).map((v) => lineaDeViaje(v, ctx)),
      }),
      esError: false,
    };
  }

  if (nombre === "por_comprar") {
    const resumen = resumenDeCompra(datos.viajes, datos.hoy, datos.ventana);
    const atender = datos.viajes
      .filter((v) => porComprarAhora(estadoDeCompra(v, datos.hoy, datos.ventana)))
      .sort(porFechaYHora);
    return {
      contenido: serializar({
        hoy: datos.hoy,
        ventana_de_compra_dias: datos.ventana,
        por_comprar_ahora: resumen.urgentes + resumen.vencidos,
        urgentes: resumen.urgentes,
        vencidos: resumen.vencidos,
        sin_cerrar: resumen.sinCerrar,
        fechas_abiertas: resumen.fechasAbiertas,
        viajes: atender.slice(0, MAX_FILAS).map((v) => lineaDeViaje(v, ctx)),
      }),
      esError: false,
    };
  }

  if (nombre === "costos") {
    const agrupar = valores.agrupar === "ruta" ? "ruta" : valores.agrupar === "mes" ? "mes" : null;
    if (!agrupar) return error("«agrupar» debe ser mes o ruta.");
    const mes = typeof valores.mes === "string" && MES.test(valores.mes) ? valores.mes : null;
    if (valores.mes !== undefined && !mes) return error("«mes» debe tener la forma AAAA-MM.");
    const viajes = mes ? datos.viajes.filter((v) => mesDe(v.date) === mes) : datos.viajes;
    const grupos = (agrupar === "mes" ? porMes : porRuta)(viajes);
    const total = cobertura(viajes);
    return {
      contenido: serializar({
        ...(mes ? { mes } : {}),
        agrupado_por: agrupar,
        cobertura: total,
        aviso: "Los totales solo suman los viajes con monto registrado: di siempre cuántos lo tienen.",
        grupos: grupos.slice(0, 40).map((g) => ({
          [agrupar]: g.clave,
          viajes: g.viajes,
          con_monto: g.conMonto,
          total_clp: g.total,
          mediana_clp: g.referencia,
        })),
      }),
      esError: false,
    };
  }

  if (nombre === "acreditacion") {
    const r = rango(valores, datos.hoy, 29);
    if ("error" in r) return error(r.error);
    if (!datos.tipos.some((t) => t.active))
      return { contenido: serializar({ aviso: "La obra todavía no exige documentos: no hay nada que revisar." }), esError: false };
    const pendientes = datos.viajes
      .filter((v) => v.status !== "Anulado" && v.date >= r.desde && v.date <= r.hasta)
      .sort(porFechaYHora)
      .map((v) => ({ v, motivos: motivosDeAcreditacion(v.person_id, v.date, datos.tipos, datos.documentos) }))
      .filter((x) => x.motivos.length > 0);
    return {
      contenido: serializar({
        desde: r.desde,
        hasta: r.hasta,
        total: pendientes.length,
        viajes: pendientes.slice(0, MAX_FILAS).map((x) => ({
          ...lineaDeViaje(x.v, ctx),
          documentos: x.motivos.map(textoDeMotivo),
        })),
      }),
      esError: false,
    };
  }

  if (nombre === "historial_de_viaje") {
    const token = typeof valores.viaje === "string" ? valores.viaje : "";
    const id = seud.idDeViaje(token);
    const viaje = id ? datos.viajes.find((v) => v.id === id) : undefined;
    if (!viaje) return error("No conozco ese seudónimo de viaje. Usa el V-xxxx que dio otra herramienta.");
    const entradas = (await ctx.leerHistorial(viaje.id)).slice(-15);
    return {
      contenido: serializar({
        viaje: lineaDeViaje(viaje, ctx),
        cambios: entradas.map((h) => ({
          cuando: h.created_at.slice(0, 16).replace("T", " "),
          accion: h.action === "INSERT" ? "creado" : "editado",
          campos: cambiosDe("trips", h.before_data, h.after_data)
            .filter((c) => c.campo !== "Vuelo" && c.campo !== "Monto")
            .map((c) =>
              c.campo === "Reserva"
                ? { campo: "Reserva", antes: c.antes === "—" ? "sin código" : "con código", despues: c.despues === "—" ? "sin código" : "con código" }
                : c,
            ),
          nota: seud.ocultar(notaDelCambio(h.before_data, h.after_data)).slice(0, 400),
        })),
      }),
      esError: false,
    };
  }

  return error(`No conozco la herramienta «${nombre.slice(0, 40)}».`);
}
