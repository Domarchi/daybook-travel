// El motivo de un cambio tiene que servir para reconstruir qué pasó.
//
// La base ya rechaza un motivo vacío (validate_trip), pero acepta cualquier otra
// cosa, y en producción hay viajes anulados con el motivo ".". Eso cumple la
// regla y no le dice nada a nadie.
//
// El mínimo es de letras, no de palabras: "Duplicado" o "No viajó" son motivos
// buenos y cortos, y "." o "ok" no. Se cuentan letras de cualquier idioma, con
// tildes, y no signos ni números.
//
// Vive en la pantalla y no en la base porque la base guarda el motivo dentro de
// las notas del viaje ("…\nMotivo del cambio: X", ver lib/notas.ts). Exigirlo
// en SQL pediría una columna aparte para el motivo, y eso obliga a reescribir
// las funciones del importador y de las propuestas, que también editan viajes.
export const MINIMO_LETRAS = 5;

export function letrasDe(texto: string) {
  return (texto.match(/\p{L}/gu) ?? []).length;
}

/** Qué le falta al motivo, o null si sirve. */
export function problemaDeMotivo(motivo: string): string | null {
  if (!motivo.trim()) return "Escribe el motivo de este cambio.";
  if (letrasDe(motivo) < MINIMO_LETRAS) {
    return `Escribe un motivo que se entienda después, de al menos ${MINIMO_LETRAS} letras: por ejemplo «No viajó» o «Duplicado».`;
  }
  return null;
}
