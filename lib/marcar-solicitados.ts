// Los textos de «Marcar como solicitados», que cambia muchos viajes de una vez.
//
// Es reversible, así que se hace sin preguntar y el aviso ofrece «Deshacer»
// durante 10 s (Fase 5, lib/avisos.ts): los viajes vuelven a Planificado. El
// cambio va de a diez viajes; si una tanda falla, las anteriores ya quedaron
// guardadas, y el aviso tiene que decir cuántos quedaron y cuántos no, en vez de
// solo que «uno de los viajes cambió».

/** El motivo que queda en las notas al devolver un viaje a Planificado. */
export const MOTIVO_DESHACER_SOLICITUD = "Se deshizo la solicitud.";

/** El conflicto de siempre: alguien cambió el viaje entre medio. */
export const TEXTO_VIAJE_CAMBIO =
  "Uno de los viajes cambió mientras trabajabas. Actualiza la lista e intenta de nuevo.";

const viajes = (n: number) => (n === 1 ? "viaje" : "viajes");

export function textoDeSolicitados(n: number): string {
  return `${n} ${n === 1 ? "viaje marcado como solicitado" : "viajes marcados como solicitados"}.`;
}

/**
 * Falló una tanda después de que otras se guardaron. Los que faltan quedan
 * seleccionados para volver a intentarlo con el mismo botón.
 */
export function textoDeSolicitudParcial(
  marcados: number,
  total: number,
  porConflicto: boolean,
): string {
  const faltan = total - marcados;
  const quedaron =
    marcados === 1
      ? `1 de ${total} viajes quedó marcado como solicitado.`
      : `${marcados} de ${total} viajes quedaron marcados como solicitados.`;
  const otros =
    faltan === 1
      ? "No se pudo marcar el otro, que sigue seleccionado."
      : `No se pudieron marcar los otros ${faltan}, que siguen seleccionados.`;
  const causa = porConflicto
    ? `${faltan === 1 ? "Cambió" : "Uno de ellos cambió"} mientras trabajabas: actualiza la lista e intenta de nuevo.`
    : "Intenta de nuevo.";
  return `${quedaron} ${otros} ${causa}`;
}

export function textoDeSolicitudDeshecha(n: number): string {
  return `${n} ${viajes(n)} ${n === 1 ? "volvió" : "volvieron"} a Planificado.`;
}

/**
 * Deshacer no alcanzó a todos: alguno cambió en esos diez segundos o falló la
 * conexión. Los que no volvieron siguen como solicitados.
 */
export function textoDeDeshacerParcial(
  devueltos: number,
  total: number,
  porConflicto: boolean,
): string {
  if (devueltos === 0) {
    if (porConflicto) {
      return total === 1
        ? "No se pudo deshacer: el viaje cambió mientras tanto. Revísalo en la lista."
        : "No se pudo deshacer: los viajes cambiaron mientras tanto. Revísalos en la lista.";
    }
    return total === 1
      ? "No se pudo deshacer: el viaje sigue como solicitado."
      : "No se pudo deshacer: los viajes siguen como solicitados.";
  }
  const faltan = total - devueltos;
  return `${devueltos} de ${total} viajes ${devueltos === 1 ? "volvió" : "volvieron"} a Planificado. ${
    faltan === 1
      ? "El otro sigue como solicitado: revísalo en la lista."
      : `Los otros ${faltan} siguen como solicitados: revísalos en la lista.`
  }`;
}

/**
 * Cambia los viajes de a diez a la vez. Si una tanda falla, se detiene ahí: lo
 * de las tandas anteriores (y lo que sí salió en la que falló) ya quedó
 * guardado y se devuelve en `hechos`, para contarlo y para poder deshacerlo.
 * Que la base no devuelva la fila es un conflicto: alguien la cambió entre medio.
 */
export async function porTandas<F extends { trip: { id: string } }>(
  filas: F[],
  actualizar: (fila: F) => Promise<{ error: unknown; fila?: { updated_at: string } }>,
) {
  const hechos: { id: string; updatedAt: string }[] = [];
  let fallo: unknown = null;
  let porConflicto = false;
  for (let index = 0; index < filas.length && !fallo; index += 10) {
    const tanda = filas.slice(index, index + 10);
    const resultados = await Promise.all(tanda.map(actualizar));
    resultados.forEach((resultado, posicion) => {
      if (resultado.error) fallo ??= resultado.error;
      else if (!resultado.fila) {
        porConflicto = true;
        fallo ??= new Error(TEXTO_VIAJE_CAMBIO);
      } else hechos.push({ id: tanda[posicion].trip.id, updatedAt: resultado.fila.updated_at });
    });
  }
  return { hechos, fallo, porConflicto };
}
