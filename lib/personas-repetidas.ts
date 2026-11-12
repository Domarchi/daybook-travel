// Personas con el mismo nombre.
//
// Salió de revisar producción el 12-nov-2026: una persona tenía dos fichas
// activas con turno 4×3, una con ruta desde Santiago y otra desde Concepción.
// Lo más probable es que alguien, al cambiarle la ruta, creó una ficha nueva en
// vez de editar la que había, y entonces Planificar turnos le genera los viajes
// dos veces.
//
// No se bloquea: dos personas distintas pueden llamarse igual. Se avisa mientras
// se escribe el nombre, con lo necesario para reconocer a la otra (ruta, turno,
// desde cuándo), y quien carga decide.
import type { Person } from "./types.ts";

/** El nombre como se compara: sin tildes, sin mayúsculas y sin espacios de más. */
export function claveDeNombre(nombre: string) {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("es-CL")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Las otras personas que se llaman igual. `excepto` es la que se está editando,
 * que no cuenta como repetida de sí misma. Las activas van primero, porque son
 * las que generan viajes.
 */
export function personasConMismoNombre<P extends Pick<Person, "id" | "name" | "active">>(
  nombre: string,
  personas: P[],
  excepto?: string | null,
): P[] {
  const clave = claveDeNombre(nombre);
  // Con menos de dos letras todavía no hay un nombre que comparar.
  if (clave.length < 2) return [];
  return personas
    .filter((persona) => persona.id !== excepto && claveDeNombre(persona.name) === clave)
    .sort((a, b) => Number(b.active) - Number(a.active));
}

/**
 * Las personas que comparten nombre con alguna otra, para marcarlas en la lista.
 * El aviso del diálogo solo aparece al abrir una ficha; esto deja ver las que ya
 * están repetidas sin tener que buscarlas.
 */
export function idsConNombreRepetido(personas: Pick<Person, "id" | "name">[]): Set<string> {
  const porNombre = new Map<string, string[]>();
  for (const persona of personas) {
    const clave = claveDeNombre(persona.name);
    if (clave.length < 2) continue;
    porNombre.set(clave, [...(porNombre.get(clave) ?? []), persona.id]);
  }
  return new Set([...porNombre.values()].filter((ids) => ids.length > 1).flat());
}
