// El recordatorio del día antes para quien viaja: qué viajes entran y qué dice
// el mensaje, por correo y por WhatsApp.
//
// No sabe de React, de Supabase ni de los servicios de envío: recibe lo que
// entrega `worker_reminder_data()` (migración 016) y devuelve los mensajes. La
// base ya eligió los viajes: mañana, con código de reserva, de personas activas
// con correo o teléfono.

import { fechaParaTrabajador, sentidoParaTrabajador } from "./mis-vuelos.ts";
import type { MensajeDeCorreo } from "./send-mail.ts";

export type ViajeDeRecordatorio = {
  id: string;
  persona: string;
  correo: string | null;
  telefono: string | null;
  fecha: string;
  sentido: string;
  origen: string;
  destino: string;
  hora: string | null;
  vuelo: string;
  reserva: string;
  equipaje: string;
};

export type DatosDeRecordatorio = {
  hoy: string;
  viajes: ViajeDeRecordatorio[];
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const texto = (valor: unknown) => (typeof valor === "string" ? valor.trim() : "");
const opcional = (valor: unknown) => texto(valor) || null;

/** Valida lo que devuelve la base. Si la forma no es la esperada, se rechaza entero. */
export function leerDatosDeRecordatorio(crudo: unknown): DatosDeRecordatorio {
  const datos = crudo as Record<string, unknown> | null;
  if (!datos || typeof datos.hoy !== "string" || !FECHA.test(datos.hoy) || !Array.isArray(datos.viajes)) {
    throw new Error("La base devolvió los recordatorios con una forma inesperada.");
  }
  const viajes = datos.viajes.map((fila) => {
    const viaje = fila as Record<string, unknown>;
    if (!viaje || typeof viaje.fecha !== "string" || !FECHA.test(viaje.fecha)) {
      throw new Error("Un viaje del recordatorio no tiene fecha válida.");
    }
    return {
      id: texto(viaje.id),
      persona: texto(viaje.persona),
      correo: opcional(viaje.correo),
      telefono: opcional(viaje.telefono),
      fecha: viaje.fecha,
      sentido: texto(viaje.sentido),
      origen: texto(viaje.origen),
      destino: texto(viaje.destino),
      hora: opcional(viaje.hora),
      vuelo: texto(viaje.vuelo),
      reserva: texto(viaje.reserva),
      equipaje: texto(viaje.equipaje),
    };
  });
  return { hoy: datos.hoy, viajes };
}

const primerNombre = (nombre: string) => nombre.split(/\s+/)[0] ?? "";
const ruta = (viaje: ViajeDeRecordatorio) => `${viaje.origen} → ${viaje.destino}`;
const vueloYHora = (viaje: ViajeDeRecordatorio) =>
  [viaje.vuelo || "vuelo por confirmar", viaje.hora ? `a las ${viaje.hora}` : "hora por confirmar"].join(", ");

const escapar = (valor: string) =>
  valor
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** El correo del día antes. */
export function correoDeRecordatorio(
  viaje: ViajeDeRecordatorio,
  hoy: string,
  direccionDeMisVuelos: string,
): Omit<MensajeDeCorreo, "para"> {
  const cuando = fechaParaTrabajador(viaje.fecha, hoy);
  const lineas = [
    `${sentidoParaTrabajador(viaje.sentido)}: ${ruta(viaje)}`,
    `Fecha: ${cuando}`,
    `Vuelo: ${vueloYHora(viaje)}`,
    `Código de reserva: ${viaje.reserva}`,
    viaje.equipaje && viaje.equipaje !== "Por confirmar" ? `Equipaje: ${viaje.equipaje.toLowerCase()}` : "",
  ].filter(Boolean);
  const saludo = `Hola ${primerNombre(viaje.persona)}, te recordamos tu vuelo de mañana.`;
  const pie = `Todos tus vuelos: ${direccionDeMisVuelos}`;
  return {
    asunto: `Mañana viajas: ${ruta(viaje)}${viaje.hora ? ` a las ${viaje.hora}` : ""}`,
    texto: [saludo, "", ...lineas, "", pie, "", "Si algo no calza, avisa a la coordinación de la obra."].join("\n"),
    html: [
      `<p>${escapar(saludo)}</p>`,
      `<ul>${lineas.map((linea) => `<li>${escapar(linea)}</li>`).join("")}</ul>`,
      `<p><a href="${escapar(direccionDeMisVuelos)}">Ver todos tus vuelos</a></p>`,
      '<p style="color:#5f6058;font-size:12px">Si algo no calza, avisa a la coordinación de la obra.</p>',
    ].join("\n"),
  };
}

/**
 * Los valores de la plantilla de WhatsApp, en orden:
 * {{1}} nombre, {{2}} fecha, {{3}} ruta, {{4}} vuelo y hora, {{5}} código.
 * El texto de la plantilla (ver docs/mis-vuelos.md) se aprueba en Meta.
 */
export function parametrosDeWhatsapp(viaje: ViajeDeRecordatorio, hoy: string): string[] {
  return [
    primerNombre(viaje.persona),
    fechaParaTrabajador(viaje.fecha, hoy).replace(/^Mañana, /, ""),
    ruta(viaje),
    vueloYHora(viaje),
    viaje.reserva,
  ];
}

/** Para el modo simulado y la prueba: el mismo mensaje que dirá la plantilla. */
export function textoDeWhatsapp(parametros: string[]): string {
  const [nombre, fecha, recorrido, vuelo, reserva] = parametros;
  return `Hola ${nombre}, te recordamos tu vuelo de mañana ${fecha}: ${recorrido}, ${vuelo}. Código de reserva: ${reserva}. Buen viaje.`;
}
