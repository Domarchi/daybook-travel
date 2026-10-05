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

import { createRecoveryAccess } from './password-recovery';

export const recoveryAccess = createRecoveryAccess();
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

  // Registrar el observador antes de inicializar evita perder PASSWORD_RECOVERY
  // aunque el singleton se cree antes de montar /actualizar-clave.
  cliente = createClient(url, clave, { auth: {
    skipAutoInitialize: true,
    detectSessionInUrl(callbackUrl, params) {
      // Los parámetros ya los extrajo el SDK. Sólo inspeccionamos tipo y nombres;
      // nunca copiamos, parseamos ni persistimos valores de tokens.
      const callback = ['access_token', 'error', 'error_description', 'error_code'].some(key => key in params);
      if (callbackUrl.pathname === '/actualizar-clave') {
        if (callback && params.type === 'recovery') recoveryAccess.beginLocalCallback();
        // El SDK conserva sus parámetros locales para validar. Reemplazar ahora
        // evita que su posterior location.hash='' deje el fragmento detrás de Atrás.
        history.replaceState(history.state, '', '/actualizar-clave');
      }
      return callback;
    },
  } });
  cliente.auth.onAuthStateChange((event, session) => {
    recoveryAccess.record(event, session);
  });
  void cliente.auth.initialize().then(({ error }) => {
    if (error) recoveryAccess.invalidate();
    // El SDK emite PASSWORD_RECOVERY mediante setTimeout tras procesar la URL.
    // finish sólo cierra el estado de espera; jamás autoriza por INITIAL_SESSION.
    setTimeout(() => recoveryAccess.finish(), 0);
  }).catch(() => recoveryAccess.invalidate());
  return cliente;
}
