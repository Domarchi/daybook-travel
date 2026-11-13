// Lo que Bita muestra al abrirse, sin IA y sin costo: quién sube y baja hoy,
// mañana y en la semana, qué hay que comprar y qué acreditación falta. Sale de
// los datos que la pantalla ya cargó y de las mismas funciones que la agenda
// (lib/purchase, lib/accreditation), así que no puede discrepar con ella.
//
// Funciona también en la demostración: no llama a nadie.
//
// Pura: la fecha de hoy entra por parámetro.
import { motivosDeAcreditacion, type DocumentoDePersona, type TipoDeDocumento } from "./accreditation.ts";
import { addDays } from "./calendar.ts";
import { resumenDeCompra } from "./purchase.ts";
import type { Person, Trip } from "./types.ts";

export const DIAS_ACREDITACION = 14;

export type ViajeDelDia = { id: string; persona: string; sentido: "sube" | "baja"; hora: string | null; ruta: string };

export type ResumenBita = {
  hoy: string;
  hoyViajes: ViajeDelDia[];
  mananaViajes: ViajeDelDia[];
  semana: { suben: number; bajan: number };
  compra: { porComprar: number; urgentes: number; vencidos: number; sinCerrar: number; fechasAbiertas: number };
  acreditacion: { viajes: number; personas: number; exigida: boolean };
};

const activo = (v: Trip) => v.status !== "Anulado";

function delDia(viajes: Trip[], fecha: string, nombres: Map<string, string>): ViajeDelDia[] {
  return viajes
    .filter((v) => activo(v) && v.date === fecha)
    .sort((a, b) => (a.requested_time ?? "99").localeCompare(b.requested_time ?? "99"))
    .map((v) => ({
      id: v.id,
      persona: nombres.get(v.person_id) ?? "Persona sin nombre",
      sentido: v.direction === "SUBIDA" ? "sube" : "baja",
      hora: v.requested_time ? v.requested_time.slice(0, 5) : null,
      ruta: `${v.origin} → ${v.destination}`,
    }));
}

export function resumenDeBita(entrada: {
  hoy: string;
  personas: Person[];
  viajes: Trip[];
  ventana: number;
  tipos: TipoDeDocumento[];
  documentos: DocumentoDePersona[];
}): ResumenBita {
  const { hoy, personas, viajes, ventana, tipos, documentos } = entrada;
  const nombres = new Map(personas.map((p) => [p.id, p.name]));
  const manana = addDays(hoy, 1);
  const finSemana = addDays(hoy, 6);
  const enSemana = viajes.filter((v) => activo(v) && v.date >= hoy && v.date <= finSemana);
  const compra = resumenDeCompra(viajes, hoy, ventana);
  const exigida = tipos.some((t) => t.active);
  const limite = addDays(hoy, DIAS_ACREDITACION);
  const pendientes = exigida
    ? viajes.filter(
        (v) => activo(v) && v.date >= hoy && v.date <= limite && motivosDeAcreditacion(v.person_id, v.date, tipos, documentos).length > 0,
      )
    : [];
  return {
    hoy,
    hoyViajes: delDia(viajes, hoy, nombres),
    mananaViajes: delDia(viajes, manana, nombres),
    semana: {
      suben: enSemana.filter((v) => v.direction === "SUBIDA").length,
      bajan: enSemana.filter((v) => v.direction === "BAJADA").length,
    },
    compra: {
      porComprar: compra.urgentes + compra.vencidos,
      urgentes: compra.urgentes,
      vencidos: compra.vencidos,
      sinCerrar: compra.sinCerrar,
      fechasAbiertas: compra.fechasAbiertas.length,
    },
    acreditacion: { viajes: pendientes.length, personas: new Set(pendientes.map((v) => v.person_id)).size, exigida },
  };
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** «2 suben y 1 baja», «nadie viaja». */
export function movimientosEnTexto(viajes: { sentido: "sube" | "baja" }[]): string {
  const suben = viajes.filter((v) => v.sentido === "sube").length;
  const bajan = viajes.length - suben;
  if (!suben && !bajan) return "nadie viaja";
  return [suben ? `${suben} ${suben === 1 ? "sube" : "suben"}` : "", bajan ? `${bajan} ${bajan === 1 ? "baja" : "bajan"}` : ""]
    .filter(Boolean)
    .join(" y ");
}

export type LineaResumen = {
  texto: string;
  accion?: "agenda" | "por_comprar" | "sin_cerrar" | "personas";
  tono?: "alerta" | "normal";
};

/** Las líneas cortas bajo el saludo. Lo que pide atención va primero. */
export function lineasDeResumen(r: ResumenBita): LineaResumen[] {
  const lineas: LineaResumen[] = [];
  if (r.compra.porComprar)
    lineas.push({
      texto: `${plural(r.compra.porComprar, "viaje", "viajes")} por comprar ahora (${plural(r.compra.fechasAbiertas, "fecha abierta", "fechas abiertas")})`,
      accion: "por_comprar",
      tono: "alerta",
    });
  if (r.compra.sinCerrar)
    lineas.push({ texto: `${plural(r.compra.sinCerrar, "viaje pasado", "viajes pasados")} sin cerrar`, accion: "sin_cerrar", tono: "alerta" });
  if (r.acreditacion.viajes)
    lineas.push({
      texto: `${plural(r.acreditacion.viajes, "viaje", "viajes")} de los próximos ${DIAS_ACREDITACION} días con documentos pendientes`,
      accion: "personas",
      tono: "alerta",
    });
  lineas.push({ texto: `Hoy ${movimientosEnTexto(r.hoyViajes)}; mañana ${movimientosEnTexto(r.mananaViajes)}`, accion: "agenda" });
  lineas.push({
    texto: `Esta semana: ${plural(r.semana.suben, "subida", "subidas")} y ${plural(r.semana.bajan, "bajada", "bajadas")}`,
    accion: "agenda",
  });
  return lineas;
}
