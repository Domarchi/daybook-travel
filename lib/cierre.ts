// Cerrar viajes que pasaron sin reserva ("sin cerrar" en lib/purchase.ts).
//
// Un viaje sin cerrar ya no se compra: o no se voló, o se voló con un pasaje
// comprado por fuera de la aplicación. Este archivo dice qué cambio le
// corresponde a cada caso, sin React ni Supabase, para poder probarlo.
//
//   anular     no se voló. Queda Anulado, con el motivo. Nada se borra.
//   reserva    se voló con una reserva que se conoce. Queda Completado, con su
//              código. Una reserva es un vuelo: varios pasajeros, una fecha y
//              una ruta. Por eso un mismo código solo se puede poner a viajes
//              del mismo día y la misma ruta; si cada viaje tiene su código, se
//              abren de a uno.
//
// La base exige motivo en toda edición (validate_trip) y código de reserva para
// Completado (trips_status_pnr_check). Aquí se valida antes, para dar un mensaje
// claro en vez del error de la base.
import type { Trip } from "./types.ts";
import { problemaDeMotivo } from "./motivo.ts";
import { notasConMotivo } from "./notas.ts";

export type ModoDeCierre = "anular" | "reserva";

type ViajeCerrable = Pick<Trip, "date" | "origin" | "destination" | "notes">;

/** Si todos los viajes pueden compartir una reserva: mismo día y misma ruta. */
export function mismoVuelo(viajes: Pick<Trip, "date" | "origin" | "destination">[]) {
  if (!viajes.length) return false;
  const [primero] = viajes;
  const clave = (v: Pick<Trip, "date" | "origin" | "destination">) =>
    [v.date, v.origin.trim().toLowerCase(), v.destination.trim().toLowerCase()].join("|");
  return viajes.every((viaje) => clave(viaje) === clave(primero));
}

/** Lo que falta para poder cerrar, o null si se puede. */
export function problemaDeCierre(
  viajes: Pick<Trip, "date" | "origin" | "destination">[],
  modo: ModoDeCierre,
  motivo: string,
  pnr: string,
): string | null {
  if (!viajes.length) return "Selecciona los viajes que quieres cerrar.";
  const motivoMalo = problemaDeMotivo(motivo);
  if (motivoMalo) return motivoMalo;
  if (modo === "reserva") {
    if (!mismoVuelo(viajes)) {
      return "Una misma reserva solo sirve para viajes del mismo día y la misma ruta. Si cada uno tiene su código, ábrelos de a uno.";
    }
    if (!pnr.trim()) return "Escribe el código de reserva.";
  }
  return null;
}

/** El cambio que se le aplica a cada viaje al cerrarlo. */
export function cambioDeCierre(
  viaje: ViajeCerrable,
  modo: ModoDeCierre,
  motivo: string,
  pnr: string,
) {
  // Las observaciones y el motivo del cierre, igual que al editar o al marcar
  // como solicitado. Los motivos anteriores están en el historial.
  const notes = notasConMotivo(viaje.notes, motivo);
  return modo === "anular"
    ? { status: "Anulado", notes }
    : { status: "Completado", pnr: pnr.trim().toUpperCase(), notes };
}
