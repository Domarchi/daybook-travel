// El cron de los recordatorios de vuelo, sin Next ni Supabase adentro: todo lo
// que toca el mundo (consultar la base, mandar correo o WhatsApp, leer las
// variables) entra por parámetro, así que se prueba entero sin red.
//
// Falla cerrado: sin el secreto del cron no responde a nadie, y sin ningún
// canal configurado no envía nada. Con un solo canal configurado, manda por
// ese. Las respuestas solo traen cantidades: nunca nombres, números ni correos
// (salvo en modo simulado, que también exige el secreto).

import { cronAutorizado } from "./cron-auth.ts";
import { direccionDeMisVuelos } from "./mis-vuelos.ts";
import {
  correoDeRecordatorio,
  leerDatosDeRecordatorio,
  parametrosDeWhatsapp,
  textoDeWhatsapp,
} from "./recordatorios.ts";
import type { MensajeDeCorreo } from "./send-mail.ts";
import type { MensajeDeWhatsapp } from "./send-whatsapp.ts";
import { DIRECCION_POR_OMISION } from "./urgent-alerts-handler.ts";

export type EntornoDeRecordatorios = {
  CRON_SECRET?: string;
  RESEND_API_KEY?: string;
  ALERT_FROM?: string;
  WHATSAPP_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_TEMPLATE?: string;
  WHATSAPP_TEMPLATE_LANG?: string;
  APP_URL?: string;
};

const json = (cuerpo: unknown, status = 200) =>
  Response.json(cuerpo, { status, headers: { "Cache-Control": "no-store" } });

export function canalesConfigurados(entorno: EntornoDeRecordatorios) {
  return {
    correo: Boolean(entorno.RESEND_API_KEY && entorno.ALERT_FROM),
    whatsapp: Boolean(entorno.WHATSAPP_TOKEN && entorno.WHATSAPP_PHONE_NUMBER_ID && entorno.WHATSAPP_TEMPLATE),
  };
}

export async function manejarRecordatorios({
  request,
  entorno,
  consultar,
  enviarCorreo,
  enviarWhatsapp,
}: {
  request: Request;
  entorno: EntornoDeRecordatorios;
  /** Llama a `worker_reminder_data()` con la llave de servicio. */
  consultar: () => Promise<unknown>;
  enviarCorreo: (mensaje: MensajeDeCorreo) => Promise<void>;
  enviarWhatsapp: (mensaje: MensajeDeWhatsapp) => Promise<void>;
}): Promise<Response> {
  const secreto = entorno.CRON_SECRET ?? "";
  if (!secreto) return json({ error: "Los recordatorios no están configurados." }, 503);
  if (!cronAutorizado(request, secreto)) return json({ error: "No autorizado." }, 401);

  const simular = new URL(request.url).searchParams.get("simular") === "1";
  const canales = canalesConfigurados(entorno);
  if (!simular && !canales.correo && !canales.whatsapp) {
    // Solo los nombres de las variables, nunca sus valores.
    const faltan = [
      !entorno.RESEND_API_KEY && "RESEND_API_KEY",
      !entorno.ALERT_FROM && "ALERT_FROM",
      !entorno.WHATSAPP_TOKEN && "WHATSAPP_TOKEN",
      !entorno.WHATSAPP_PHONE_NUMBER_ID && "WHATSAPP_PHONE_NUMBER_ID",
      !entorno.WHATSAPP_TEMPLATE && "WHATSAPP_TEMPLATE",
    ].filter(Boolean);
    return json({ error: "Falta configurar el correo o WhatsApp.", faltan }, 503);
  }

  let datos;
  try {
    datos = leerDatosDeRecordatorio(await consultar());
  } catch (error) {
    console.error("recordatorios: no se pudo leer la base", error instanceof Error ? error.message : "error");
    return json({ error: "No se pudo leer la información." }, 502);
  }

  const direccion = direccionDeMisVuelos(entorno.APP_URL || DIRECCION_POR_OMISION);
  const correos = datos.viajes
    .filter((viaje) => viaje.correo)
    .map((viaje) => ({ para: [viaje.correo!], ...correoDeRecordatorio(viaje, datos.hoy, direccion) }));
  const whatsapps = datos.viajes
    .filter((viaje) => viaje.telefono)
    .map((viaje) => ({ para: viaje.telefono!, parametros: parametrosDeWhatsapp(viaje, datos.hoy) }));

  if (simular) {
    return json({
      enviado: false,
      simulado: true,
      viajes: datos.viajes.length,
      canales,
      correos: correos.map((correo) => ({ para: correo.para, asunto: correo.asunto, texto: correo.texto })),
      whatsapps: whatsapps.map((mensaje) => ({ para: mensaje.para, texto: textoDeWhatsapp(mensaje.parametros) })),
    });
  }

  // Cada envío es independiente: si falla uno, los demás siguen.
  const cuenta = { correo: { enviados: 0, fallidos: 0 }, whatsapp: { enviados: 0, fallidos: 0 } };
  if (canales.correo) {
    for (const correo of correos) {
      try {
        await enviarCorreo(correo);
        cuenta.correo.enviados += 1;
      } catch (error) {
        cuenta.correo.fallidos += 1;
        console.error("recordatorios: correo no enviado", error instanceof Error ? error.message : "error");
      }
    }
  }
  if (canales.whatsapp) {
    for (const mensaje of whatsapps) {
      try {
        await enviarWhatsapp(mensaje);
        cuenta.whatsapp.enviados += 1;
      } catch (error) {
        cuenta.whatsapp.fallidos += 1;
        console.error("recordatorios: WhatsApp no enviado", error instanceof Error ? error.message : "error");
      }
    }
  }

  const enviados = cuenta.correo.enviados + cuenta.whatsapp.enviados;
  const fallidos = cuenta.correo.fallidos + cuenta.whatsapp.fallidos;
  // Todo lo que se intentó falló: lo más probable es la configuración, y el
  // registro del cron de Vercel lo muestra en rojo.
  const status = fallidos > 0 && enviados === 0 ? 502 : 200;
  return json({ viajes: datos.viajes.length, ...cuenta }, status);
}
