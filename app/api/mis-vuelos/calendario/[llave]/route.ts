import { createClient } from "@supabase/supabase-js";
import { manejarCalendario } from "@/lib/mis-vuelos-calendario-handler";

// El calendario del teléfono de un trabajador (Mis vuelos). Usa la llave
// pública, como el navegador: la base solo le deja llamar a worker_calendar(),
// que devuelve los vuelos de la persona dueña de esta llave y nada más.
export const dynamic = "force-dynamic";

// El tipo va escrito a mano y no con RouteContext<…>: ese lo genera Next al
// compilar, y el CI corre `tsc` antes que `next build`.
export async function GET(_request: Request, ctx: { params: Promise<{ llave: string }> }) {
  const { llave } = await ctx.params;
  return manejarCalendario({
    llave,
    consultar: async (limpia) => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if (!url || !publica) throw new Error("Falta la configuración de Supabase.");
      const supabase = createClient(url, publica, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await supabase.rpc("worker_calendar", { p_token: limpia });
      if (error) throw new Error(`Supabase respondió ${error.code ?? "con un error"}.`);
      return data;
    },
  });
}
