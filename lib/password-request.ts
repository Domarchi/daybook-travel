export const REQUEST_SENT = 'Si existe una cuenta con ese correo, recibirás un enlace para cambiar tu contraseña. Revisa también spam.';
export const REQUEST_ERROR = 'No pudimos enviar el enlace. Espera un minuto e inténtalo de nuevo; si continúa, contacta al responsable de la aplicación.';

type RequestAuth = {
  resetPasswordForEmail: (email: string, options: { redirectTo: string }) => Promise<{ error: unknown }>;
};

// La normalización es la del login actual: el valor del input email, sin convertir a minúsculas.
// Esto limita reenvíos accidentales en esta pestaña; el proveedor conserva su propio rate limit.
export function createPasswordRequest(
  getAuth: () => RequestAuth,
  now = Date.now,
  cooldown?: { read(): number; write(value: number): void },
) {
  let inFlight = false;
  let retryAt = 0;
  const blocked = () => {
    try { retryAt = Math.max(retryAt, Number(cooldown?.read()) || 0); } catch {}
    return inFlight || now() < retryAt;
  };
  return {
    blocked,
    async send(email: string, origin: string): Promise<string | null> {
      if (blocked()) return null;
      inFlight = true;
      retryAt = now() + 60_000;
      try { cooldown?.write(retryAt); } catch {}
      try {
        const { error } = await getAuth().resetPasswordForEmail(email, {
          redirectTo: new URL('/actualizar-clave', origin).href,
        });
        return error ? REQUEST_ERROR : REQUEST_SENT;
      } catch {
        return REQUEST_ERROR;
      } finally {
        inFlight = false;
      }
    },
  };
}
