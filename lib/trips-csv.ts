// El CSV de la solicitud a la agencia. Separado por punto y coma y con BOM, que
// es lo que abre bien Excel en español.
//
// Vivía dentro de `app/store.tsx`. No sabe de React ni de Supabase.

import type { Trip } from "./types.ts";

// Excel interpreta como fórmula toda celda que empiece con = + - @; el apóstrofo
// la deja como texto. Es la defensa contra la inyección de fórmulas en un libro
// que alguien abre con doble clic.
export const celdaCsv = (valor: unknown) =>
  '"' +
  String(valor ?? "")
    .replace(/^[=+@-]/, "'$&")
    .replaceAll('"', '""') +
  '"';

export const ENCABEZADOS_CSV = [
  "Persona",
  "Fecha",
  "Sentido",
  "Origen",
  "Destino",
  "Hora requerida",
  "Equipaje",
  "Estado",
  "Reserva",
  "Vuelo",
  "Monto CLP",
] as const;

/**
 * Las filas del CSV, una por viaje. Si se pasa `acreditacionDe`, agrega la
 * columna «Acreditación» con lo que devuelva para cada viaje.
 */
export function csvDeViajes(
  viajes: Trip[],
  nombreDe: (personId: string) => string,
  acreditacionDe?: (viaje: Trip) => string,
) {
  const filas: unknown[][] = [
    [...ENCABEZADOS_CSV, ...(acreditacionDe ? ["Acreditación"] : [])],
    ...viajes.map((viaje) => [
      nombreDe(viaje.person_id),
      viaje.date,
      viaje.direction,
      viaje.origin,
      viaje.destination,
      viaje.requested_time,
      viaje.baggage,
      viaje.status,
      viaje.pnr,
      viaje.flight,
      viaje.amount,
      ...(acreditacionDe ? [acreditacionDe(viaje)] : []),
    ]),
  ];
  return "﻿" + filas.map((fila) => fila.map(celdaCsv).join(";")).join("\r\n");
}
