// El calendario del teléfono: los vuelos de una persona como archivo iCalendar
// (RFC 5545), para suscribirse desde el iPhone, Android o Google Calendar. El
// teléfono vuelve a pedirlo cada tanto, así que un cambio de fecha o de vuelo
// llega solo, y cada evento lleva su aviso del día antes.
//
// Las horas van «flotantes» (sin zona): un vuelo a las 08:30 es a las 08:30
// donde esté el teléfono, que para esta obra es Chile. Declarar la zona exige
// incluir su definición completa, y algunos calendarios la leen mal.
//
// Sin React ni Supabase, para poder probarlo.

import { addDays } from "./calendar.ts";
import { estadoParaTrabajador, sentidoParaTrabajador, type MisVuelos, type ViajeDelTrabajador } from "./mis-vuelos.ts";

/** Texto de una propiedad: se escapan barra invertida, punto y coma, coma y saltos. */
export function escaparIcs(valor: string): string {
  return valor
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Las líneas de más de 75 bytes se cortan y siguen con un espacio. */
export function plegarIcs(linea: string): string {
  const codificador = new TextEncoder();
  const partes: string[] = [];
  let actual = "";
  let bytes = 0;
  for (const caracter of linea) {
    const largo = codificador.encode(caracter).length;
    const limite = partes.length === 0 ? 75 : 74;
    if (bytes + largo > limite) {
      partes.push(actual);
      actual = "";
      bytes = 0;
    }
    actual += caracter;
    bytes += largo;
  }
  partes.push(actual);
  return partes.join("\r\n ");
}

const compacta = (fecha: string) => fecha.replaceAll("-", "");
const marcaUtc = (ahora: Date) => ahora.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function resumenDe(viaje: ViajeDelTrabajador): string {
  const vuelo = viaje.vuelo ? ` (${viaje.vuelo})` : "";
  return `${sentidoParaTrabajador(viaje.sentido)} ${viaje.origen} → ${viaje.destino}${vuelo}`;
}

function descripcionDe(viaje: ViajeDelTrabajador): string {
  const estado = estadoParaTrabajador(viaje);
  if (!viaje.reserva) {
    return `${estado.etiqueta}. La coordinación te avisa cuando esté comprado.`;
  }
  return [
    `Código de reserva: ${viaje.reserva}`,
    viaje.vuelo && `Vuelo: ${viaje.vuelo}`,
    viaje.hora && `Hora: ${viaje.hora}`,
    viaje.equipaje && viaje.equipaje !== "Por confirmar" && `Equipaje: ${viaje.equipaje.toLowerCase()}`,
    estado.tono === "listo" ? "" : estado.etiqueta,
  ]
    .filter(Boolean)
    .join("\n");
}

function eventoDe(viaje: ViajeDelTrabajador, sello: string): string[] {
  const conHora = Boolean(viaje.hora && /^\d{2}:\d{2}$/.test(viaje.hora));
  const inicio = conHora
    ? [`DTSTART:${compacta(viaje.fecha)}T${viaje.hora!.replace(":", "")}00`, "DURATION:PT1H"]
    : [`DTSTART;VALUE=DATE:${compacta(viaje.fecha)}`, `DTEND;VALUE=DATE:${compacta(addDays(viaje.fecha, 1))}`];
  return [
    "BEGIN:VEVENT",
    `UID:${viaje.id}@daybook-travel`,
    `DTSTAMP:${sello}`,
    ...inicio,
    `SUMMARY:${escaparIcs(resumenDe(viaje))}`,
    `DESCRIPTION:${escaparIcs(descripcionDe(viaje))}`,
    `STATUS:${viaje.reserva ? "CONFIRMED" : "TENTATIVE"}`,
    "TRANSP:TRANSPARENT",
    // El aviso del día antes. En un evento de día completo el inicio es la
    // medianoche: seis horas antes son las 18:00 de la víspera.
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escaparIcs(`Mañana: ${resumenDe(viaje)}`)}`,
    `TRIGGER:${conHora ? "-P1D" : "-PT6H"}`,
    "END:VALARM",
    "END:VEVENT",
  ];
}

/** El archivo completo, con saltos CRLF como pide la norma. */
export function calendarioIcs(datos: MisVuelos, ahora: Date): string {
  const sello = marcaUtc(ahora);
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Daybook//Travel Mis vuelos//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Mis vuelos",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
    ...datos.viajes.flatMap((viaje) => eventoDe(viaje, sello)),
    "END:VCALENDAR",
  ];
  return lineas.map(plegarIcs).join("\r\n") + "\r\n";
}
