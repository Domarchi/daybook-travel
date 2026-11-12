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
//     sin cerrar  la fecha pasó hace más de DIAS_VENCIDO días y quedó sin
//                 reserva: ya no hay nada que comprar, hay que cerrarlo
//     vencido     la fecha pasó hace poco y nadie registró la compra
//     urgente     vuela dentro de la ventana de compra
//     próximo     todavía hay tiempo
//
//   "Sin cerrar" existe porque "vencido" no tenía fin: un viaje importado en
//   septiembre que nadie actualizó seguía contando como "por comprar ahora" en
//   noviembre, y la tarjeta de la agenda llegó a decir 96 cuando no había nada
//   que comprar. Lo que pasó hace más de dos semanas no se compra; se cierra
//   (con su reserva, o anulándolo), y eso es otra tarea.
//
// Nada de esto lee el reloj: la fecha de hoy entra por parámetro, para que las
// pruebas puedan pararse en cualquier día.
import type { Trip } from "./types.ts";

export type EstadoCompra =
  | "resuelto"
  | "cerrado"
  | "sin_cerrar"
  | "vencido"
  | "urgente"
  | "proximo";

/** Días de anticipación por omisión, si la obra todavía no eligió los suyos. */
export const VENTANA_POR_OMISION = 21;

/**
 * Cuántos días después de su fecha un viaje sin reserva sigue contando como
 * vencido (y en el aviso por correo). Pasado eso queda "sin cerrar".
 *
 * Tiene que ser el mismo número que usa `purchase_alert_data()` en la
 * migración 012 (`t.date >= a.hoy - 14`): así la tarjeta de la agenda y el
 * correo cuentan lo mismo. Una prueba lo compara.
 */
export const DIAS_VENCIDO = 14;

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
  if (faltan < -DIAS_VENCIDO) return "sin_cerrar";
  if (faltan < 0) return "vencido";
  if (faltan <= ventanaDias) return "urgente";
  return "proximo";
}

/** Lo que entra en "Por comprar ahora": lo urgente y lo vencido hace poco. */
export function porComprarAhora(estado: EstadoCompra) {
  return estado === "vencido" || estado === "urgente";
}

export type ResumenCompra = {
  /** Pasados hace más de DIAS_VENCIDO días sin reserva. No están "por comprar". */
  sinCerrar: number;
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
    sinCerrar: 0,
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
    if (estado === "sin_cerrar") resumen.sinCerrar++;
    else if (estado === "vencido") resumen.vencidos++;
    else if (estado === "urgente") resumen.urgentes++;
    else if (estado === "proximo") resumen.proximos++;
    else if (estado === "resuelto") resumen.resueltos++;
    else resumen.cerrados++;

    if (porComprarAhora(estado)) fechas.add(trip.date);
  }

  resumen.fechasAbiertas = [...fechas].sort();
  return resumen;
}
