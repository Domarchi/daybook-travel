// El aviso tras una acción (Fase 5 del estándar Daybook, @daybook/design 0.6).
//
// Igual que en Parte Diario y Ticket: una tarjeta oscura abajo al centro del
// contenido. Un éxito se va solo a los 4 s (`--db-toast-duration`); un error se
// queda hasta que se cierra con la ✕ o lo reemplaza el aviso siguiente, porque un
// error que desaparece a los cuatro segundos es un error que nadie alcanzó a leer.
//
// El tono viaja dentro del aviso y no como un segundo parámetro opcional: así
// ninguna llamada puede olvidarse de decir si fue un éxito o un error, y el
// compilador marca la que falte.

export type TonoDeAviso = "exito" | "error";

export type Aviso = { mensaje: string; tono: TonoDeAviso };

/** Lo que dura un aviso de éxito: `--db-toast-duration` de @daybook/design. */
export const DURACION_DEL_AVISO_MS = 4000;

export function avisoDeExito(mensaje: string): Aviso {
  return { mensaje, tono: "exito" };
}

/** Un fallo del servidor o una validación que no deja seguir. */
export function avisoDeError(mensaje: string): Aviso {
  return { mensaje, tono: "error" };
}

/** Cuánto vive el aviso antes de irse solo; `null` = hasta que lo cierren. */
export function duracionDelAviso(aviso: Aviso): number | null {
  return aviso.tono === "error" ? null : DURACION_DEL_AVISO_MS;
}
