import { createClient } from "@supabase/supabase-js";
import { manejarRecordatorios, type EntornoDeRecordatorios } from "@/lib/recordatorios-handler";
import { enviarConResend } from "@/lib/send-mail";
import { enviarPorWhatsapp } from "@/lib/send-whatsapp";

// El cron de Vercel llama a esta ruta cada tarde (ver vercel.json) con
// `Authorization: Bearer $CRON_SECRET`: recuerda a quien vuela mañana su vuelo,
// por correo y por WhatsApp. Sin ese secreto no responde.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const entorno = process.env as EntornoDeRecordatorios &
    Record<string, string | undefined>;
  return manejarRecordatorios({
    request,
    entorno,
    consultar: async () => {
      const url = entorno.NEXT_PUBLIC_SUPABASE_URL;
      const llave = entorno.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !llave) throw new Error("Falta la URL o la llave de servicio de Supabase.");
      // La llave de servicio se usa solo para llamar a una función, que la
      // base limita a lo mínimo y que no escribe nada.
      const supabase = createClient(url, llave, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await supabase.rpc("worker_reminder_data");
      if (error) throw new Error(`Supabase respondió ${error.code ?? "con un error"}.`);
      return data;
    },
    enviarCorreo: (mensaje) =>
      enviarConResend(
        { apiKey: entorno.RESEND_API_KEY ?? "", desde: entorno.ALERT_FROM ?? "" },
        mensaje,
      ),
    enviarWhatsapp: (mensaje) =>
      enviarPorWhatsapp(
        {
          token: entorno.WHATSAPP_TOKEN ?? "",
          numeroId: entorno.WHATSAPP_PHONE_NUMBER_ID ?? "",
          plantilla: entorno.WHATSAPP_TEMPLATE ?? "",
          idioma: entorno.WHATSAPP_TEMPLATE_LANG || "es",
        },
        mensaje,
      ),
  });
}
