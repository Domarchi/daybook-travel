// El aviso diario de viajes por comprar: qué viajes entran y qué dice el correo.
//
// No sabe de React, de Supabase ni de ningún servicio de correo: recibe los datos
// que entrega `purchase_alert_data()` y devuelve el asunto y el texto. Qué es
// "urgente" y qué es "vencido" lo decide `lib/purchase.ts`, el mismo código que
// pinta la agenda, para que el correo y la pantalla no puedan discrepar.

import { estadoDeCompra, diasParaVolar } from "./purchase.ts";
import { formatDate } from "./format.ts";

export type ViajeDeAlerta = {
  id: string;
  persona: string;
  fecha: string;
  sentido: string;
  origen: string;
  destino: string;
  estado: string;
  hora: string | null;
};

export type DatosDeAlerta = {
  hoy: string;
  ventana: number;
  viajes: ViajeDeAlerta[];
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const texto = (valor: unknown) => (typeof valor === "string" ? valor : "");

/**
 * Valida lo que devuelve la base. Si la forma no es la esperada se rechaza entero:
 * un aviso a medias es peor que ninguno.
 */
export function leerDatosDeAlerta(crudo: unknown): DatosDeAlerta {
  const datos = crudo as Partial<DatosDeAlerta> | null;
  if (
    !datos ||
    typeof datos.hoy !== "string" ||
    !FECHA.test(datos.hoy) ||
    !Number.isInteger(datos.ventana) ||
    !Array.isArray(datos.viajes)
  ) {
    throw new Error("La base devolvió datos de aviso con una forma inesperada.");
  }
  const viajes = datos.viajes.map((fila) => {
    const viaje = fila as Partial<ViajeDeAlerta>;
    if (!viaje || typeof viaje.fecha !== "string" || !FECHA.test(viaje.fecha)) {
      throw new Error("Un viaje del aviso no tiene fecha válida.");
    }
    return {
      id: texto(viaje.id),
      persona: texto(viaje.persona),
      fecha: viaje.fecha,
      sentido: texto(viaje.sentido),
      origen: texto(viaje.origen),
      destino: texto(viaje.destino),
      estado: texto(viaje.estado),
      hora: typeof viaje.hora === "string" && viaje.hora ? viaje.hora : null,
    };
  });
  return { hoy: datos.hoy, ventana: datos.ventana as number, viajes };
}

export type Avisos = {
  vencidos: ViajeDeAlerta[];
  urgentes: ViajeDeAlerta[];
};

/** Los viajes que merecen aviso, separados en vencidos y urgentes. */
export function viajesPorAvisar(datos: DatosDeAlerta): Avisos {
  const avisos: Avisos = { vencidos: [], urgentes: [] };
  for (const viaje of datos.viajes) {
    // Lo que entrega la base ya viene sin PNR; se pasa vacío para que el estado
    // dependa solo de la fecha y de la ventana.
    const estado = estadoDeCompra(
      { date: viaje.fecha, status: viaje.estado, pnr: "" },
      datos.hoy,
      datos.ventana,
    );
    if (estado === "vencido") avisos.vencidos.push(viaje);
    else if (estado === "urgente") avisos.urgentes.push(viaje);
  }
  const porFecha = (a: ViajeDeAlerta, b: ViajeDeAlerta) =>
    a.fecha.localeCompare(b.fecha) || a.persona.localeCompare(b.persona, "es-CL");
  avisos.vencidos.sort(porFecha);
  avisos.urgentes.sort(porFecha);
  return avisos;
}

export const totalDeAvisos = (avisos: Avisos) =>
  avisos.vencidos.length + avisos.urgentes.length;

const pluralizar = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function lineaDe(viaje: ViajeDeAlerta, hoy: string) {
  const faltan = diasParaVolar(viaje.fecha, hoy);
  const cuando =
    faltan < 0
      ? `pasó hace ${pluralizar(-faltan, "día", "días")}`
      : faltan === 0
        ? "vuela hoy"
        : faltan === 1
          ? "vuela mañana"
          : `faltan ${faltan} días`;
  const sentido = viaje.sentido === "SUBIDA" ? "subida" : viaje.sentido === "BAJADA" ? "bajada" : viaje.sentido.toLowerCase();
  return `${formatDate(viaje.fecha)} · ${viaje.persona} · ${viaje.origen} → ${viaje.destino} (${sentido}${viaje.hora ? `, ${viaje.hora}` : ""}) · ${viaje.estado} · ${cuando}`;
}

const escapar = (valor: string) =>
  valor
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export type MensajeDeAlerta = { asunto: string; texto: string; html: string };

/**
 * El correo. Devuelve null si no hay nada que avisar: un correo vacío todos los
 * días enseña a ignorarlos.
 */
export function mensajeDeAlerta(
  avisos: Avisos,
  hoy: string,
  direccionDeLaApp: string,
): MensajeDeAlerta | null {
  const total = totalDeAvisos(avisos);
  if (total === 0) return null;

  const asunto =
    `Daybook Travel: ${pluralizar(total, "viaje por comprar", "viajes por comprar")}` +
    (avisos.vencidos.length ? ` (${pluralizar(avisos.vencidos.length, "vencido", "vencidos")})` : "");

  const secciones = [
    {
      titulo: "VENCIDOS: ya pasó la fecha y no tienen código de reserva",
      viajes: avisos.vencidos,
    },
    {
      titulo: "URGENTES: vuelan pronto y no tienen código de reserva",
      viajes: avisos.urgentes,
    },
  ].filter((seccion) => seccion.viajes.length);

  const texto = [
    `Hay ${pluralizar(total, "viaje", "viajes")} sin código de reserva que necesitan gestión.`,
    "",
    ...secciones.flatMap((seccion) => [
      seccion.titulo,
      ...seccion.viajes.map((viaje) => `- ${lineaDe(viaje, hoy)}`),
      "",
    ]),
    `Abrir Daybook Travel: ${direccionDeLaApp}`,
    "",
    "Este aviso sale cada día hábil mientras haya viajes sin código de reserva.",
  ].join("\n");

  const html = [
    `<p>Hay <strong>${pluralizar(total, "viaje", "viajes")}</strong> sin código de reserva que necesitan gestión.</p>`,
    ...secciones.map(
      (seccion) =>
        `<h3 style="margin:16px 0 4px">${escapar(seccion.titulo)}</h3><ul>` +
        seccion.viajes.map((viaje) => `<li>${escapar(lineaDe(viaje, hoy))}</li>`).join("") +
        "</ul>",
    ),
    `<p><a href="${escapar(direccionDeLaApp)}">Abrir Daybook Travel</a></p>`,
    '<p style="color:#5f6058;font-size:12px">Este aviso sale cada día hábil mientras haya viajes sin código de reserva.</p>',
  ].join("\n");

  return { asunto, texto, html };
}

/**
 * Los correos de ALERT_RECIPIENTS: separados por coma, punto y coma o espacio, en
 * minúsculas y sin repetir. Lo que no parece un correo se descarta.
 */
export function destinatariosDe(valor: string | undefined): string[] {
  const lista = (valor ?? "")
    .split(/[\s,;]+/)
    .map((correo) => correo.trim().toLowerCase())
    .filter((correo) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo));
  return [...new Set(lista)];
}
