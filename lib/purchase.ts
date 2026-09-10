// La ventana de compra: para cada viaje, si hay que hacer algo con él y con
// cuánta urgencia.
//
// Hasta ahora la aplicación mostraba todos los viajes futuros como
// "Planificado", sin distinguir el que sale el lunes del que sale en marzo.
// Este archivo responde la pregunta que Katy y Tamara se hacen cada mañana:
// ¿qué hay que comprar hoy?
//
// La regla, en palabras:
//
//   Un viaje está RESUELTO cuando tiene código de reserva. Mientras no lo
//   tenga sigue pendiente, aunque ya se haya solicitado a la agencia: hasta
//   que no hay PNR nadie tiene asiento.
//
//   Un viaje ANULADO está cerrado: no se va a comprar nunca.
//
//   Lo pendiente se ordena por cuánto falta para volar:
//     vencido   ya pasó la fecha y nadie compró nada
//     urgente   vuela dentro de la ventana de compra
//     próximo   todavía hay tiempo
//
// Nada de esto lee el reloj: la fecha de hoy entra por parámetro, para que las
// pruebas puedan pararse en cualquier día.
import type { Trip } from "./types.ts";

export type EstadoCompra =
  | "resuelto"
  | "cerrado"
  | "vencido"
  | "urgente"
  | "proximo";

/** Días de anticipación por omisión, si la obra todavía no eligió los suyos. */
export const VENTANA_POR_OMISION = 21;

/** Límites de lo que se puede configurar, para que nadie escriba un disparate. */
export const VENTANA_MINIMA = 1;
export const VENTANA_MAXIMA = 120;

export function ventanaValida(dias: number) {
  return (
    Number.isInteger(dias) && dias >= VENTANA_MINIMA && dias <= VENTANA_MAXIMA
  );
}

/** Días que faltan para el vuelo. Negativo si ya pasó. */
export function diasParaVolar(fecha: string, hoy: string) {
  const a = Date.parse(hoy + "T12:00:00Z");
  const b = Date.parse(fecha + "T12:00:00Z");
  return Math.round((b - a) / 86400000);
}

export function estadoDeCompra(
  trip: Pick<Trip, "date" | "status" | "pnr">,
  hoy: string,
  ventanaDias: number = VENTANA_POR_OMISION,
): EstadoCompra {
  if (trip.status === "Anulado") return "cerrado";
  if ((trip.pnr ?? "").trim()) return "resuelto";

  const faltan = diasParaVolar(trip.date, hoy);
  if (faltan < 0) return "vencido";
  if (faltan <= ventanaDias) return "urgente";
  return "proximo";
}

/** Si el viaje espera una gestión de alguien. */
export function esperaGestion(estado: EstadoCompra) {
  return estado === "vencido" || estado === "urgente" || estado === "proximo";
}

export type ResumenCompra = {
  vencidos: number;
  urgentes: number;
  proximos: number;
  resueltos: number;
  cerrados: number;
  /** Fechas distintas con algo urgente o vencido, ordenadas. */
  fechasAbiertas: string[];
};

/**
 * Cuenta una lista de viajes por estado de compra. Las "fechas abiertas" son
 * lo que de verdad se compra: los pasajes se piden por bloque de fecha y ruta,
 * no de a uno, así que saber cuántas fechas distintas están abiertas dice más
 * que el total de viajes.
 */
export function resumenDeCompra(
  trips: Pick<Trip, "date" | "status" | "pnr">[],
  hoy: string,
  ventanaDias: number = VENTANA_POR_OMISION,
): ResumenCompra {
  const resumen: ResumenCompra = {
    vencidos: 0,
    urgentes: 0,
    proximos: 0,
    resueltos: 0,
    cerrados: 0,
    fechasAbiertas: [],
  };
  const fechas = new Set<string>();

  for (const trip of trips) {
    const estado = estadoDeCompra(trip, hoy, ventanaDias);
    if (estado === "vencido") resumen.vencidos++;
    else if (estado === "urgente") resumen.urgentes++;
    else if (estado === "proximo") resumen.proximos++;
    else if (estado === "resuelto") resumen.resueltos++;
    else resumen.cerrados++;

    if (estado === "vencido" || estado === "urgente") fechas.add(trip.date);
  }

  resumen.fechasAbiertas = [...fechas].sort();
  return resumen;
}

/** La clase CSS que colorea cada estado. Igual de simple que statusClass. */
export const claseDeCompra = (estado: EstadoCompra) => "compra-" + estado;
