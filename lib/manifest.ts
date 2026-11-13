// El manifiesto: los viajes por solicitar agrupados por día y ruta, listos para
// pegar en un correo a la agencia. Los pasajes se compran por bloque (una fecha,
// una ruta, varias personas), así que el texto se ordena igual.
//
// Este archivo no sabe de React ni de Supabase: recibe viajes y nombres, devuelve
// bloques y texto. Lo que decide cuáles viajes entran (Planificados y futuros)
// se resuelve antes, en la pantalla, para que el manifiesto coincida con lo que
// Katy tiene a la vista.

import type { Trip } from "./types.ts";

export type Pasajero = {
  nombre: string;
  hora: string | null;
  equipaje: string;
};

export type Bloque = {
  fecha: string;
  origen: string;
  destino: string;
  sentido: string;
  pasajeros: Pasajero[];
};

const SIN_DATO = "Por confirmar";

const comparar = (a: string, b: string) =>
  a.localeCompare(b, "es-CL", { sensitivity: "base" });

// La hora más temprana de un bloque, o null si nadie tiene hora todavía.
export const horaDelBloque = (bloque: Pick<Bloque, "pasajeros">) =>
  bloque.pasajeros.map((p) => p.hora).filter((h): h is string => Boolean(h)).sort()[0] ?? null;

// Lo que no tiene hora va después de lo que sí, en vez de primero ("" < "08:00").
const porHora = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a.localeCompare(b);

// Agrupa por fecha y ruta. Dentro de un día, los bloques van por hora de vuelo,
// como un itinerario (decisión de noviembre de 2026; antes iban por orden
// alfabético de origen y la bajada salía antes que la subida): la hora de un
// bloque es la más temprana de sus pasajeros, y los bloques sin hora ("Por
// confirmar") van al final del día. Con la misma hora, por ruta.
// Dentro de un bloque, los pasajeros van por hora y, con la misma hora, por nombre.
export function agruparManifiesto(
  viajes: Trip[],
  nombreDe: (personId: string) => string,
): Bloque[] {
  const bloques = new Map<string, Bloque>();
  for (const viaje of viajes) {
    const clave = [viaje.date, viaje.origin, viaje.destination].join("|");
    let bloque = bloques.get(clave);
    if (!bloque) {
      bloque = {
        fecha: viaje.date,
        origen: viaje.origin,
        destino: viaje.destination,
        sentido: viaje.direction,
        pasajeros: [],
      };
      bloques.set(clave, bloque);
    }
    bloque.pasajeros.push({
      nombre: nombreDe(viaje.person_id),
      hora: viaje.requested_time ? viaje.requested_time.slice(0, 5) : null,
      equipaje: viaje.baggage,
    });
  }
  const lista = [...bloques.values()];
  for (const bloque of lista) {
    bloque.pasajeros.sort((a, b) => porHora(a.hora, b.hora) || comparar(a.nombre, b.nombre));
  }
  return lista.sort(
    (a, b) =>
      a.fecha.localeCompare(b.fecha) ||
      porHora(horaDelBloque(a), horaDelBloque(b)) ||
      comparar(a.origen, b.origen) ||
      comparar(a.destino, b.destino),
  );
}

// "lunes 14 de septiembre de 2026" → "LUNES 14 DE SEPTIEMBRE DE 2026".
const fechaLarga = (fecha: string) =>
  new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(new Date(fecha + "T12:00:00Z"))
    .replace(",", "")
    .toLocaleUpperCase("es-CL");

const fechaCorta = (fecha: string) =>
  new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(fecha + "T12:00:00Z"));

const sentidoLegible = (sentido: string) =>
  sentido === "SUBIDA" ? "subida" : sentido === "BAJADA" ? "bajada" : sentido.toLowerCase();

// El equipaje se escribe en minúscula ("maleta en bodega") porque en el correo
// va dentro de la línea de cada pasajero. Cuando no hay dato se usa la misma
// frase que la hora, tal cual está escrita: "Por confirmar", no "por confirmar".
const equipajeLegible = (equipaje: string) =>
  equipaje && equipaje.trim() ? equipaje.toLocaleLowerCase("es-CL") : SIN_DATO;

const plural = (n: number, uno: string, varios: string) =>
  `${n} ${n === 1 ? uno : varios}`;

// El texto que se pega en el correo. Un bloque por fecha+ruta, separados por
// una línea en blanco, y un pie con el total para cotejar contra la pantalla.
export function textoDeManifiesto(bloques: Bloque[], hoy: string): string {
  const lineas: string[] = [
    "SOLICITUD DE PASAJES — Daybook Travel",
    `Generada el ${fechaCorta(hoy)}`,
  ];
  let fechaAnterior = "";
  for (const bloque of bloques) {
    lineas.push("");
    if (bloque.fecha !== fechaAnterior) {
      lineas.push(fechaLarga(bloque.fecha));
      fechaAnterior = bloque.fecha;
    }
    lineas.push(
      `${bloque.origen} → ${bloque.destino} (${sentidoLegible(bloque.sentido)}) · ${plural(bloque.pasajeros.length, "pasajero", "pasajeros")}`,
    );
    bloque.pasajeros.forEach((pasajero, index) => {
      lineas.push(
        `  ${index + 1}. ${pasajero.nombre} — ${pasajero.hora ?? SIN_DATO} — ${equipajeLegible(pasajero.equipaje)}`,
      );
    });
  }
  const pasajes = bloques.reduce((suma, b) => suma + b.pasajeros.length, 0);
  lineas.push(
    "",
    `Total: ${plural(pasajes, "pasaje", "pasajes")} en ${plural(bloques.length, "vuelo", "vuelos")}.`,
  );
  return lineas.join("\n");
}
