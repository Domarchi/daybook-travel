// Lo que cambió desde tu última visita a Actividad.
//
// Katy y Tamara trabajan sobre los mismos viajes. Lo que una cambia, la otra
// lo veía solo si abría Actividad y recordaba dónde había quedado. Ahora la
// barra lateral cuenta los cambios de otras personas desde la última vez que
// se miró Actividad, y la pantalla los marca como nuevos.
//
//   - La última visita se guarda en el navegador, por usuario. No es política
//     de la obra (como la ventana de compra) sino de cada quien, y no necesita
//     migración. En otro computador se parte de cero, sin avisos falsos.
//   - Se guarda la marca de tiempo del cambio más reciente que se vio, la que
//     puso la base, no la hora del computador: un reloj adelantado escondería
//     cambios.
//   - Lo que hizo uno mismo no es novedad.
//
// Sin React ni Supabase.
import type { HistoryItem } from "./types.ts";

export const claveDeVisita = (usuario: string) => `actividad-visto:${usuario}`;

/** La más reciente de dos marcas de tiempo; la visita nunca retrocede. */
export function masReciente(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

/** Si una entrada del historial es nueva para quien mira. */
export function esNovedad(
  item: Pick<HistoryItem, "created_at" | "actor">,
  desde: string | null,
  yo: string | null,
) {
  if (!desde) return false;
  if (yo && item.actor === yo) return false;
  return Date.parse(item.created_at) > Date.parse(desde);
}

/** Lo que dice la cifra de la barra lateral: hasta 99, después «99+». */
export const cifraDeNovedades = (cantidad: number) => (cantidad > 99 ? "99+" : String(cantidad));

/** La cantidad escrita para leer (y para el lector de pantalla). */
export const textoDeNovedades = (cantidad: number) =>
  cantidad === 1 ? "1 cambio nuevo" : `${cantidad} cambios nuevos`;
