import { createClient } from "@supabase/supabase-js";
import { manejarAlertas, type EntornoDeAlertas } from "@/lib/urgent-alerts-handler";
import { enviarConResend } from "@/lib/send-mail";

// El cron de Vercel llama a esta ruta cada día hábil (ver vercel.json) con
// `Authorization: Bearer $CRON_SECRET`. Sin ese secreto no responde.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const entorno = process.env as EntornoDeAlertas &
    Record<string, string | undefined>;
  return manejarAlertas({
    request,
    entorno,
    consultar: async () => {
      const url = entorno.NEXT_PUBLIC_SUPABASE_URL;
      const llave = entorno.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !llave) throw new Error("Falta la URL o la llave de servicio de Supabase.");
      // La llave de servicio se usa solo para llamar a una función; la base
      // limita esa función a lo mínimo y no hay otro acceso a tablas desde aquí.
      const supabase = createClient(url, llave, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await supabase.rpc("purchase_alert_data");
      if (error) throw new Error(`Supabase respondió ${error.code ?? "con un error"}.`);
      return data;
    },
    enviar: (mensaje) =>
      enviarConResend(
        { apiKey: entorno.RESEND_API_KEY ?? "", desde: entorno.ALERT_FROM ?? "" },
        mensaje,
      ),
  });
}
