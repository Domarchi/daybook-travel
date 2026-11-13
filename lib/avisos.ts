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

// `deshacer` es la otra mitad de la regla de la Fase 5 para las acciones
// delicadas: lo que se puede revertir se hace sin preguntar y el aviso ofrece
// «Deshacer» durante 10 s; lo que no, pasa por un diálogo con el botón rojo.
export type Aviso = { mensaje: string; tono: TonoDeAviso; deshacer?: () => void };

/** Lo que dura un aviso de éxito: `--db-toast-duration` de @daybook/design. */
export const DURACION_DEL_AVISO_MS = 4000;

/** Con «Deshacer»: `--db-toast-duration-undo`, para alcanzar a leer y decidir. */
export const DURACION_DEL_AVISO_CON_DESHACER_MS = 10000;

export function avisoDeExito(mensaje: string): Aviso {
  return { mensaje, tono: "exito" };
}

/** Algo que ya se hizo y se puede revertir: quitar el acceso a alguien. */
export function avisoConDeshacer(mensaje: string, deshacer: () => void): Aviso {
  return { mensaje, tono: "exito", deshacer };
}

/** Un fallo del servidor o una validación que no deja seguir. */
export function avisoDeError(mensaje: string): Aviso {
  return { mensaje, tono: "error" };
}

/** Cuánto vive el aviso antes de irse solo; `null` = hasta que lo cierren. */
export function duracionDelAviso(aviso: Aviso): number | null {
  if (aviso.tono === "error") return null;
  return aviso.deshacer ? DURACION_DEL_AVISO_CON_DESHACER_MS : DURACION_DEL_AVISO_MS;
}
