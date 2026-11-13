// Las notas de un viaje: observaciones y motivo del último cambio.
//
// La base guarda las dos cosas en un solo campo (`notes`), y la regla de que
// editar exige motivo se cumple escribiendo "Motivo del cambio: …" en él. Hasta
// ahora cada edición agregaba su motivo al final y volvía a guardar todos los
// anteriores, así que el campo "Información útil" de un viaje editado diez
// veces mostraba diez motivos encima de las observaciones de verdad.
//
// Ahora las notas guardan las observaciones y el motivo del último cambio, nada
// más. Los motivos anteriores no se pierden: cada uno quedó en el historial
// (audit_change guarda el antes y el después de cada cambio).
//
// Separar el motivo en su propia columna, para que además la base pudiera
// exigir su largo mínimo, obliga a reescribir en producción las funciones del
// importador de Excel y de las propuestas, que también editan viajes. Se dejó
// para cuando valga ese riesgo.
export const PREFIJO_MOTIVO = "Motivo del cambio:";

const esMotivo = (linea: string) => linea.trim().startsWith(PREFIJO_MOTIVO);

/** Las observaciones, sin las líneas de motivo. */
export function observacionesDe(notas: string | null | undefined): string {
  return String(notas ?? "")
    .split("\n")
    .filter((linea) => !esMotivo(linea))
    .join("\n")
    .trim();
}

/** El motivo del último cambio, o "" si no hay. */
export function ultimoMotivo(notas: string | null | undefined): string {
  const lineas = String(notas ?? "").split("\n").filter(esMotivo);
  const ultima = lineas.at(-1) ?? "";
  return ultima.trim().slice(PREFIJO_MOTIVO.length).trim();
}

/**
 * Las notas que se guardan al editar: las observaciones y el motivo nuevo, en
 * una sola línea (un salto de línea dentro del motivo lo partiría y la segunda
 * mitad se leería como observación).
 */
export function notasConMotivo(observaciones: string, motivo: string): string {
  const limpio = motivo.replace(/\s+/g, " ").trim();
  return [observacionesDe(observaciones), limpio ? `${PREFIJO_MOTIVO} ${limpio}` : ""]
    .filter(Boolean)
    .join("\n");
}
