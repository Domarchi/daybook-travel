// Envío de correo por Resend. Es lo único que sabe que existe ese servicio: si se
// cambia de proveedor, se cambia este archivo y nada más.
//
// La clave no se guarda en el repositorio ni se escribe en ningún registro: viene
// de una variable de entorno de Vercel que pone una persona.

export type ConfiguracionDeCorreo = {
  apiKey: string;
  /** "Daybook Travel <avisos@tu-dominio>": el remitente tiene que estar verificado en Resend. */
  desde: string;
};

export type MensajeDeCorreo = {
  para: string[];
  asunto: string;
  texto: string;
  html: string;
};

export const ENDPOINT_DE_RESEND = "https://api.resend.com/emails";

/**
 * Envía el correo. Si Resend responde con un error, falla con un mensaje que
 * dice el código HTTP y nada más: el cuerpo de la respuesta puede repetir las
 * direcciones o la clave y no se devuelve ni se registra.
 */
export async function enviarConResend(
  configuracion: ConfiguracionDeCorreo,
  mensaje: MensajeDeCorreo,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!mensaje.para.length) throw new Error("El correo no tiene destinatarios.");
  const respuesta = await fetchImpl(ENDPOINT_DE_RESEND, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${configuracion.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: configuracion.desde,
      to: mensaje.para,
      subject: mensaje.asunto,
      text: mensaje.texto,
      html: mensaje.html,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!respuesta.ok) {
    throw new Error(`Resend rechazó el envío (HTTP ${respuesta.status}).`);
  }
}
