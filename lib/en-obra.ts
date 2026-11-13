// Quién está en obra un día, según los viajes registrados.
//
// Se calcula con los viajes reales y no con el turno teórico: si alguien bajó
// antes o se quedó más, lo que manda es lo que se registró. Una persona está en
// obra un día si su último movimiento hasta ese día fue una subida. El día que
// sube o el día que baja también cuenta, y se dice cuál de los dos es.
//
// Si el primer viaje registrado de alguien es una bajada, se asume que estaba en
// obra desde antes: los datos de la obra empiezan a mitad de un turno.
//
// Sin React ni Supabase.
import type { Trip } from "./types.ts";

export type EnObra = { person_id: string; estado: "en obra" | "sube" | "baja" };

type Movimiento = Pick<Trip, "person_id" | "date" | "direction" | "status">;

export function enObra(viajes: Movimiento[], dia: string): EnObra[] {
  const porPersona = new Map<string, Movimiento[]>();
  for (const viaje of viajes) {
    if (viaje.status === "Anulado" || viaje.status === "No presentado") continue;
    porPersona.set(viaje.person_id, [...(porPersona.get(viaje.person_id) ?? []), viaje]);
  }

  const resultado: EnObra[] = [];
  for (const [personId, lista] of porPersona) {
    // En un mismo día, la subida va antes que la bajada.
    lista.sort((a, b) => a.date.localeCompare(b.date) || (a.direction === "SUBIDA" ? -1 : 1));
    const delDia = lista.filter((v) => v.date === dia);
    if (delDia.some((v) => v.direction === "BAJADA")) {
      resultado.push({ person_id: personId, estado: "baja" });
      continue;
    }
    if (delDia.some((v) => v.direction === "SUBIDA")) {
      resultado.push({ person_id: personId, estado: "sube" });
      continue;
    }
    const anteriores = lista.filter((v) => v.date < dia);
    const ultimo = anteriores.at(-1);
    if (ultimo) {
      if (ultimo.direction === "SUBIDA") resultado.push({ person_id: personId, estado: "en obra" });
      continue;
    }
    // Sin nada antes: si lo primero que viene es una bajada, ya estaba en obra.
    const siguiente = lista.find((v) => v.date > dia);
    if (siguiente?.direction === "BAJADA") resultado.push({ person_id: personId, estado: "en obra" });
  }
  return resultado;
}
