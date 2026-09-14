import { addDays } from "./calendar.ts";
import type { Trip } from "./types.ts";

type Movimiento = Pick<Trip, "date" | "status" | "pnr" | "requested_time" | "baggage">;

/** Dos fechas de Chile: hoy y mañana, sin confundirlas con 48 horas exactas. */
export function movimientosParaEntrega<T extends Movimiento>(trips: T[], hoy: string): T[] {
  const manana = addDays(hoy, 1);
  return trips.filter((trip) =>
    trip.date >= hoy && trip.date <= manana &&
    !["Anulado", "Completado", "No presentado"].includes(trip.status)
  ).sort((a, b) => a.date.localeCompare(b.date) ||
    (a.requested_time || "99:99").localeCompare(b.requested_time || "99:99")
  );
}

export function pendientesDelMovimiento(trip: Movimiento): string[] {
  const pendientes: string[] = [];
  if (!trip.pnr?.trim()) {
    pendientes.push(trip.status === "Solicitado" ? "Confirmación de agencia pendiente" : "Reserva pendiente");
  }
  if (!trip.requested_time?.trim()) pendientes.push("Hora por confirmar");
  if (!trip.baggage || trip.baggage === "Por confirmar") pendientes.push("Equipaje por confirmar");
  return pendientes;
}
