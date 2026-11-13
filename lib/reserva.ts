// Registrar una misma reserva en varios viajes solicitados.
//
// La agencia responde a un manifiesto con un código por vuelo, y un vuelo suele
// llevar a varias personas de la obra. Antes había que abrir cada viaje y
// escribir el mismo código; ahora se marcan los solicitados de ese vuelo y se
// registra una vez. Es el mismo trato que el cierre en bloque con reserva común
// (lib/cierre.ts), pero para lo que viene: los viajes quedan Emitido.
//
//   - Un código es un vuelo: solo sirve para viajes del mismo día y la misma
//     ruta (mismoVuelo). Si cada uno tiene su código, se abren de a uno.
//   - El monto es por pasajero, como en el Excel de la agencia, y es opcional.
//   - El motivo es fijo, como al marcar como solicitados: es un paso de rutina,
//     no una decisión que haya que explicar. Dice el código, para que el
//     historial se lea solo.
//
// Sin React ni Supabase.
import type { Trip } from "./types.ts";
import { mismoVuelo } from "./cierre.ts";
import { notasConMotivo } from "./notas.ts";

type Viaje = Pick<Trip, "date" | "origin" | "destination">;

/** Si un viaje se puede marcar para registrarle la reserva. */
export const esReservable = (viaje: Pick<Trip, "status" | "pnr">) =>
  viaje.status === "Solicitado" && !(viaje.pnr ?? "").trim();

/** Lo que falta para poder registrar, o null si se puede. */
export function problemaDeReserva(viajes: Viaje[], pnr: string, monto = ""): string | null {
  if (!viajes.length) return "Selecciona los viajes solicitados de ese vuelo.";
  if (!mismoVuelo(viajes)) {
    return "Una misma reserva solo sirve para viajes del mismo día y la misma ruta. Si cada uno tiene su código, ábrelos de a uno.";
  }
  if (!pnr.trim()) return "Escribe el código de reserva.";
  if (monto.trim() && !(Number(monto) >= 0)) {
    return "El monto por pasajero debe ser un número igual o mayor que cero.";
  }
  return null;
}

/** El motivo que queda en cada viaje. */
export const motivoDeReserva = (pnr: string) =>
  `Reserva ${pnr.trim().toUpperCase()} confirmada por la agencia.`;

/** El cambio que se le aplica a cada viaje. Lo que no se escribió no se toca. */
export function cambioDeReserva(
  viaje: Pick<Trip, "notes">,
  datos: { pnr: string; vuelo?: string; monto?: string },
) {
  const vuelo = (datos.vuelo ?? "").trim().toUpperCase();
  const monto = (datos.monto ?? "").trim();
  return {
    status: "Emitido",
    pnr: datos.pnr.trim().toUpperCase(),
    ...(vuelo ? { flight: vuelo } : {}),
    ...(monto ? { amount: Number(monto) } : {}),
    notes: notasConMotivo(viaje.notes, motivoDeReserva(datos.pnr)),
  };
}
