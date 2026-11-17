// Crear los viajes que Bita propuso a partir de un documento y la persona confirmó.
//
// Bita (el servidor) no escribe nada: solo propone. Los viajes los inserta este
// navegador con la sesión de quien confirma, por la misma vía que «Planificar
// turnos» (use-acciones-generar.ts): estado «Planificado», un viaje por persona,
// fecha y sentido, y lo que ya existe no se pisa. La base valida la vigencia y
// anota en el historial a nombre de quien confirmó.

import { filasParaInsertar, type ViajeElegido } from "../../lib/bita-ui";
import { localDate } from "../../lib/format";
import { db } from "../../lib/supabase";
import type { Datos } from "./use-datos";

type Entrada = Datos;

export function useAccionesDocumento(e: Entrada) {
  const { people, trips, reload } = e;

  /** Cuántos viajes se crearon, y cuántos de los elegidos ya existían o dejaron de servir. */
  async function crearViajesDeDocumento(elegidos: ViajeElegido[], archivo: string) {
    const { filas } = filasParaInsertar(elegidos, people, trips, archivo, localDate());
    let creados = 0;
    for (let indice = 0; indice < filas.length; indice += 100) {
      // ignoreDuplicates deja pasar lo que otra persona haya creado entre medio: nunca se pisa un viaje.
      const { data, error } = await db()
        .from("trips")
        .upsert(filas.slice(indice, indice + 100), { onConflict: "person_id,date,direction", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;
      creados += data?.length ?? 0;
    }
    if (creados) await reload();
    return { creados, yaExistian: elegidos.length - creados };
  }

  return { crearViajesDeDocumento };
}

export type AccionesDocumento = ReturnType<typeof useAccionesDocumento>;
