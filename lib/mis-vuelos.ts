// Mis vuelos: lo que ve un trabajador de sus propios viajes, cómo se le dice el
// estado y los enlaces para compartir su código y suscribir su calendario.
//
// Qué viajes ve y qué datos trae cada uno lo decide la base (worker_trips() y
// worker_calendar() de la migración 016): aquí solo se lee lo que llega, se
// valida y se ordena para mostrar. Sin React ni Supabase, para poder probarlo.

import { addDays } from "./calendar.ts";

export type ViajeDelTrabajador = {
  id: string;
  fecha: string;
  sentido: string;
  origen: string;
  destino: string;
  hora: string | null;
  estado: string;
  reserva: string;
  vuelo: string;
  equipaje: string;
};

export type MisVuelos = {
  hoy: string;
  persona: {
    nombre: string;
    origen: string;
    destino: string;
    tieneCorreo: boolean;
    tieneTelefono: boolean;
  };
  /** La llave del enlace del calendario; no viene cuando se lee desde el calendario. */
  calendario: string | null;
  viajes: ViajeDelTrabajador[];
};

/** Cuánto recuerda el teléfono la sesión (la base la vence a los 180 días). */
export const CLAVE_DE_SESION = "mis-vuelos-sesion";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const texto = (valor: unknown) => (typeof valor === "string" ? valor : "");

/**
 * Valida lo que devuelve la base. Si la sesión no vale, devuelve null (hay que
 * volver a entrar); si la forma no es la esperada, falla: mostrar una lista a
 * medias de vuelos es peor que decir que no se pudo cargar.
 */
export function leerMisVuelos(crudo: unknown): MisVuelos | null {
  const datos = crudo as Record<string, unknown> | null;
  if (datos && datos.ok === false) return null;
  const persona = (datos?.persona ?? null) as Record<string, unknown> | null;
  if (
    !datos ||
    datos.ok !== true ||
    typeof datos.hoy !== "string" ||
    !FECHA.test(datos.hoy) ||
    !persona ||
    !Array.isArray(datos.viajes)
  ) {
    throw new Error("La base devolvió los vuelos con una forma inesperada.");
  }
  const viajes = datos.viajes.map((fila) => {
    const viaje = fila as Record<string, unknown>;
    if (!viaje || typeof viaje.fecha !== "string" || !FECHA.test(viaje.fecha)) {
      throw new Error("Un viaje no tiene fecha válida.");
    }
    return {
      id: texto(viaje.id),
      fecha: viaje.fecha,
      sentido: texto(viaje.sentido),
      origen: texto(viaje.origen),
      destino: texto(viaje.destino),
      hora: typeof viaje.hora === "string" && viaje.hora ? viaje.hora : null,
      estado: texto(viaje.estado),
      reserva: texto(viaje.reserva).trim(),
      vuelo: texto(viaje.vuelo).trim(),
      equipaje: texto(viaje.equipaje),
    };
  });
  return {
    hoy: datos.hoy,
    persona: {
      nombre: texto(persona.nombre),
      origen: texto(persona.origen),
      destino: texto(persona.destino),
      tieneCorreo: persona.tiene_correo === true,
      tieneTelefono: persona.tiene_telefono === true,
    },
    calendario: typeof datos.calendario === "string" ? datos.calendario : null,
    viajes,
  };
}

export type EstadoParaTrabajador = {
  etiqueta: string;
  tono: "listo" | "pendiente" | "pasado" | "problema";
};

/**
 * El estado dicho para quien viaja. «Planificado» y «Solicitado» son palabras
 * de la coordinación; a él le importa si tiene pasaje o no.
 */
export function estadoParaTrabajador(viaje: Pick<ViajeDelTrabajador, "estado" | "reserva">): EstadoParaTrabajador {
  if (viaje.estado === "No presentado") return { etiqueta: "No presentado", tono: "problema" };
  if (viaje.estado === "Completado") return { etiqueta: "Volado", tono: "pasado" };
  if (viaje.reserva) return { etiqueta: "Pasaje listo", tono: "listo" };
  return { etiqueta: "Pasaje por confirmar", tono: "pendiente" };
}

/** Los de hoy en adelante, por fecha; y los anteriores, del más reciente al más viejo. */
export function separarViajes(viajes: ViajeDelTrabajador[], hoy: string) {
  const proximos = viajes.filter((viaje) => viaje.fecha >= hoy);
  const anteriores = viajes.filter((viaje) => viaje.fecha < hoy).reverse();
  return { proximos, anteriores };
}

export const sentidoParaTrabajador = (sentido: string) =>
  sentido === "SUBIDA" ? "Subida" : sentido === "BAJADA" ? "Bajada" : sentido;

/** «lunes 24 de noviembre», y «hoy»/«mañana» cuando corresponde. */
export function fechaParaTrabajador(fecha: string, hoy: string): string {
  const larga = new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  })
    .format(new Date(fecha + "T12:00:00Z"))
    .replace(",", "");
  if (fecha === hoy) return `Hoy, ${larga}`;
  if (fecha === addDays(hoy, 1)) return `Mañana, ${larga}`;
  return larga.charAt(0).toUpperCase() + larga.slice(1);
}

/** La dirección de la pantalla del trabajador, sin barra final duplicada. */
export const direccionDeMisVuelos = (origen: string) => `${origen.replace(/\/+$/, "")}/mis-vuelos`;

/**
 * El enlace del calendario. `webcal:` hace que el teléfono ofrezca
 * suscribirse (iPhone y la mayoría de Android); el `https:` es el mismo, para
 * pegarlo en Google Calendar → «Desde URL».
 */
export function enlacesDeCalendario(origen: string, llave: string) {
  const https = `${origen.replace(/\/+$/, "")}/api/mis-vuelos/calendario/${encodeURIComponent(llave)}`;
  return { https, webcal: https.replace(/^https?:/, "webcal:") };
}

/** El mensaje con que la coordinación entrega el código. */
export function mensajeDeCodigo(nombre: string, codigo: string, direccion: string): string {
  const primerNombre = nombre.trim().split(/\s+/)[0] ?? "";
  return [
    `Hola${primerNombre ? ` ${primerNombre}` : ""}, ya puedes ver tus vuelos en Daybook Travel.`,
    `Entra a ${direccion} con tu RUT y este código: ${codigo}`,
    "El teléfono lo recuerda. No compartas el código.",
  ].join("\n");
}

/** Un enlace que abre WhatsApp con el mensaje escrito, para ese número. */
export function enlaceDeWhatsapp(telefono: string | null | undefined, mensaje: string): string {
  const numero = (telefono ?? "").replace(/\D/g, "");
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

/**
 * Lo mismo que devuelve worker_trips(), armado desde una ficha y sus viajes:
 * para la demostración, que no toca la base. Filtra igual que la base: sin
 * anulados, desde 60 días atrás, por fecha y hora.
 */
export function misVuelosDesdeFicha(
  persona: { name: string; origin: string; destination: string; phone?: string | null; email?: string | null },
  viajes: {
    id: string;
    date: string;
    direction: string;
    origin: string;
    destination: string;
    requested_time: string | null;
    status: string;
    pnr: string;
    flight: string;
    baggage: string;
  }[],
  hoy: string,
  calendario: string | null = null,
): MisVuelos {
  const desde = addDays(hoy, -60);
  return {
    hoy,
    persona: {
      nombre: persona.name,
      origen: persona.origin,
      destino: persona.destination,
      tieneCorreo: Boolean(persona.email),
      tieneTelefono: Boolean(persona.phone),
    },
    calendario,
    viajes: viajes
      .filter((viaje) => viaje.status !== "Anulado" && viaje.date >= desde)
      .map((viaje) => ({
        id: viaje.id,
        fecha: viaje.date,
        sentido: viaje.direction,
        origen: viaje.origin,
        destino: viaje.destination,
        hora: viaje.requested_time ? viaje.requested_time.slice(0, 5) : null,
        estado: viaje.status,
        reserva: viaje.pnr.trim(),
        vuelo: viaje.flight.trim(),
        equipaje: viaje.baggage,
      }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora ?? "99").localeCompare(b.hora ?? "99")),
  };
}

const SIN_CONEXION = /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected|err_network/i;

/**
 * Qué decir cuando no se pudo leer. Aquí nada se guarda, así que no sirve el
 * mensaje de `lib/errores.ts` («lo escrito sigue en el formulario»): sin señal se
 * dice eso, y cualquier otra cosa, el texto por omisión. Nunca el error en inglés.
 */
export function mensajeDeFalla(causa: unknown, porOmision: string): string {
  const mensaje = typeof causa === "object" && causa !== null ? String((causa as { message?: unknown }).message ?? "") : "";
  return SIN_CONEXION.test(mensaje) ? "Sin conexión. Revisa la señal e intenta de nuevo." : porOmision;
}
