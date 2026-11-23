// Envío por WhatsApp con la API de WhatsApp Cloud (Meta). Es lo único que sabe
// que existe ese servicio: si se cambia de proveedor, se cambia este archivo.
//
// Un mensaje que inicia la empresa tiene que usar una plantilla aprobada por
// Meta; el texto libre solo se puede mandar dentro de las 24 horas siguientes a
// un mensaje de la persona. Por eso aquí solo hay plantillas: se dice su nombre
// y se mandan los valores de {{1}}, {{2}}… La plantilla se crea y se aprueba en
// el administrador de WhatsApp de Meta (ver docs/mis-vuelos.md).
//
// El token no se guarda en el repositorio ni se escribe en ningún registro.

export type ConfiguracionDeWhatsapp = {
  token: string;
  /** El id del número que envía, no el número mismo. */
  numeroId: string;
  plantilla: string;
  /** El idioma con que se aprobó la plantilla: «es», «es_CL»… */
  idioma: string;
};

export type MensajeDeWhatsapp = {
  /** Internacional, con o sin «+»: +56912345678. */
  para: string;
  parametros: string[];
};

export const VERSION_DE_LA_API = "v23.0";

/**
 * Lo que WhatsApp acepta en un parámetro: sin saltos de línea ni tabulaciones,
 * sin más de cuatro espacios seguidos, y nunca vacío (lo rechaza entero).
 */
export function limpiarParametro(valor: string): string {
  const limpio = valor.replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim();
  return limpio || "—";
}

/**
 * Envía la plantilla. Si Meta responde con un error, falla diciendo solo el
 * código HTTP: el cuerpo puede repetir el número o el token.
 */
export async function enviarPorWhatsapp(
  configuracion: ConfiguracionDeWhatsapp,
  mensaje: MensajeDeWhatsapp,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const para = mensaje.para.replace(/\D/g, "");
  if (!para) throw new Error("El mensaje de WhatsApp no tiene destinatario.");
  const respuesta = await fetchImpl(
    `https://graph.facebook.com/${VERSION_DE_LA_API}/${encodeURIComponent(configuracion.numeroId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuracion.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: para,
        type: "template",
        template: {
          name: configuracion.plantilla,
          language: { code: configuracion.idioma },
          components: [
            {
              type: "body",
              parameters: mensaje.parametros.map((texto) => ({ type: "text", text: limpiarParametro(texto) })),
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!respuesta.ok) {
    throw new Error(`WhatsApp rechazó el envío (HTTP ${respuesta.status}).`);
  }
}
