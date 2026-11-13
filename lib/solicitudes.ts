// Cuánto lleva una solicitud esperando a la agencia.
//
// Un viaje "Solicitado" sigue sin reserva hasta que la agencia responde con el
// código. Saber hace cuánto se pidió dice a quién hay que insistirle. Se mide
// desde la última modificación del viaje (updated_at): al marcarlo como
// solicitado esa es la fecha; si después alguien lo editó, cuenta desde ahí, y
// la espera se lee más corta de lo que fue. Para la cuenta exacta habría que ir
// al historial; para decidir a quién llamar alcanza con esto.
//
// Sin React ni Supabase. La fecha de hoy entra por parámetro.
import { diasParaVolar } from "./purchase.ts";
import type { Trip } from "./types.ts";

/** Desde cuántos días de espera una solicitud se destaca. */
export const ESPERA_LARGA = 3;

/** El día de un instante, en Santiago, como AAAA-MM-DD. */
const diaEnSantiago = (instante: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date(instante));

/** Días que lleva esperando una solicitud, o null si no está esperando. */
export function diasEsperando(
  trip: Pick<Trip, "status" | "pnr" | "updated_at">,
  hoy: string,
): number | null {
  if (trip.status !== "Solicitado" || (trip.pnr ?? "").trim() || !trip.updated_at) return null;
  return Math.max(0, -diasParaVolar(diaEnSantiago(trip.updated_at), hoy));
}

/** "hoy", "ayer" o "hace N días". */
export function textoDeEspera(dias: number) {
  if (dias === 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}
