// El cron de avisos, sin Next ni Supabase adentro: todo lo que toca el mundo
// (consultar la base, mandar el correo, leer las variables) entra por parámetro,
// así que se prueba entero sin red.
//
// Falla cerrado: sin el secreto del cron no responde a nadie, y sin la
// configuración de correo no envía nada ni inventa un remitente.

import { createHash, timingSafeEqual } from "node:crypto";
import {
  destinatariosDe,
  leerDatosDeAlerta,
  mensajeDeAlerta,
  totalDeAvisos,
  viajesPorAvisar,
} from "./urgent-alerts.ts";
import type { MensajeDeCorreo } from "./send-mail.ts";

export type EntornoDeAlertas = {
  CRON_SECRET?: string;
  RESEND_API_KEY?: string;
  ALERT_FROM?: string;
  ALERT_RECIPIENTS?: string;
  APP_URL?: string;
};

export const DIRECCION_POR_OMISION = "https://relevo-chi.vercel.app";

const json = (cuerpo: unknown, status = 200) =>
  Response.json(cuerpo, { status, headers: { "Cache-Control": "no-store" } });

// Se comparan los resúmenes y no los textos: así el tiempo no depende de cuánto
// del secreto coincide, ni del largo de lo que mandó quien llama.
const iguales = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

export async function manejarAlertas({
  request,
  entorno,
  consultar,
  enviar,
}: {
  request: Request;
  entorno: EntornoDeAlertas;
  /** Llama a `purchase_alert_data()` con la llave de servicio. */
  consultar: () => Promise<unknown>;
  /** Manda el correo con el proveedor configurado. */
  enviar: (mensaje: MensajeDeCorreo) => Promise<void>;
}): Promise<Response> {
  const secreto = entorno.CRON_SECRET ?? "";
  if (!secreto) return json({ error: "Los avisos no están configurados." }, 503);

  const autorizacion = request.headers.get("authorization") ?? "";
  if (!iguales(autorizacion, `Bearer ${secreto}`)) {
    return json({ error: "No autorizado." }, 401);
  }

  const simular = new URL(request.url).searchParams.get("simular") === "1";
  const destinatarios = destinatariosDe(entorno.ALERT_RECIPIENTS);

  if (!simular) {
    const faltan = [
      !entorno.RESEND_API_KEY && "RESEND_API_KEY",
      !entorno.ALERT_FROM && "ALERT_FROM",
      !destinatarios.length && "ALERT_RECIPIENTS",
    ].filter(Boolean);
    // Solo se dicen los nombres de las variables, nunca sus valores.
    if (faltan.length) return json({ error: "Falta configurar el correo.", faltan }, 503);
  }

  let datos;
  try {
    datos = leerDatosDeAlerta(await consultar());
  } catch (error) {
    console.error("alertas: no se pudo leer la base", error instanceof Error ? error.message : "error");
    return json({ error: "No se pudo leer la información." }, 502);
  }

  const avisos = viajesPorAvisar(datos);
  const cuentas = { vencidos: avisos.vencidos.length, urgentes: avisos.urgentes.length };
  const mensaje = mensajeDeAlerta(avisos, datos.hoy, entorno.APP_URL || DIRECCION_POR_OMISION);

  if (!mensaje || totalDeAvisos(avisos) === 0) {
    return json({ enviado: false, motivo: "No hay viajes por comprar.", ...cuentas });
  }
  if (simular) {
    return json({ enviado: false, simulado: true, para: destinatarios, ...cuentas, asunto: mensaje.asunto, texto: mensaje.texto });
  }

  try {
    await enviar({ para: destinatarios, ...mensaje });
  } catch (error) {
    console.error("alertas: no se pudo enviar", error instanceof Error ? error.message : "error");
    return json({ error: "No se pudo enviar el aviso.", ...cuentas }, 502);
  }
  return json({ enviado: true, ...cuentas, destinatarios: destinatarios.length });
}
