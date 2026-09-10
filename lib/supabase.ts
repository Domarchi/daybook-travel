// El cliente de Supabase, creado la primera vez que alguien lo pide.
//
// Antes se creaba al cargar el módulo. Eso rompía `npm run build` en un clon
// recién bajado: Next evalúa este archivo al prerenderizar la página, ahí no
// existen las variables de entorno, y createClient reventaba con un
// "supabaseUrl is required" que no dice qué hacer. Creándolo perezosamente el
// módulo se carga sin tocar nada y el cliente aparece cuando el navegador lo
// necesita, que es cuando las variables sí están.
//
// El modo demostración, además, ya no necesita credenciales de ninguna clase:
// nunca llama a db().
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cliente: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (cliente) return cliente;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !clave) {
    throw new Error(
      "Falta configurar el acceso a la base de datos: copia .env.example a " +
        ".env.local y completa NEXT_PUBLIC_SUPABASE_URL y " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  cliente = createClient(url, clave);
  return cliente;
}
