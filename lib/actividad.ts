// La actividad reciente: los últimos cambios de viajes, personas y documentos,
// de todo el proyecto, para revisar el día sin abrir viaje por viaje.
//
// Este archivo dice de qué es cada entrada (con el nombre de la persona y la
// fecha del viaje, que el historial no trae) y las agrupa por día. Lo que
// cambió en cada una lo dice lib/historial.ts. Sin React ni Supabase.
import { formatDate } from "./format.ts";
import { addDays } from "./calendar.ts";
import { cambiosDe, notaDelCambio, type Cambio } from "./historial.ts";
import type { HistoryItem, Person, Trip } from "./types.ts";

/** Las entidades que muestra la actividad. Los accesos tienen su pantalla. */
export const ENTIDADES_DE_ACTIVIDAD = ["trips", "people", "person_documents"] as const;

export type Entrada = {
  id: number;
  /** Qué pasó: "Viaje actualizado", "Persona creada", "Examen médico: registrado". */
  titulo: string;
  /** De quién o de qué: la persona y, si es un viaje, su fecha y sentido. */
  sujeto: string;
  cambios: Cambio[];
  nota: string;
  /** Para abrir el viaje o la persona desde la lista. */
  abre: { tipo: "viaje"; id: string } | { tipo: "persona"; id: string } | null;
};

type Mapas = {
  trips: Map<string, Pick<Trip, "id" | "person_id" | "date" | "direction">>;
  people: Map<string, Pick<Person, "id" | "name">>;
  tiposDeDocumento: Map<string, string>;
};

const texto = (valor: unknown) => String(valor ?? "").trim();

/** Qué es cada entrada del historial, ya escrito para leer. */
export function describir(item: HistoryItem, mapas: Mapas): Entrada {
  const esAlta = item.action === "INSERT";
  const despues = item.after_data ?? {};
  const antes = esAlta ? null : item.before_data;

  if (item.entity === "person_documents") {
    const personId = texto(despues.person_id);
    const tipo = mapas.tiposDeDocumento.get(texto(despues.type_id)) ?? "Documento";
    return {
      id: item.id,
      titulo: `${tipo}: ${esAlta ? "registrado" : "actualizado"}`,
      sujeto: mapas.people.get(personId)?.name ?? "Persona",
      cambios: cambiosDe("person_documents", antes ?? { expires_on: null }, despues),
      nota: "",
      abre: personId ? { tipo: "persona", id: personId } : null,
    };
  }

  if (item.entity === "people") {
    return {
      id: item.id,
      titulo: esAlta ? "Persona creada" : "Persona actualizada",
      sujeto: texto(despues.name) || mapas.people.get(item.record_id ?? "")?.name || "Persona",
      cambios: esAlta ? [] : cambiosDe("people", antes, despues),
      nota: "",
      abre: item.record_id ? { tipo: "persona", id: item.record_id } : null,
    };
  }

  // Un viaje. La persona y el sentido no cambian, así que se leen de la foto.
  const persona = mapas.people.get(texto(despues.person_id))?.name ?? "Persona";
  const fecha = texto(despues.date);
  const sentido = texto(despues.direction) === "SUBIDA" ? "Subida" : texto(despues.direction) === "BAJADA" ? "Bajada" : "";
  return {
    id: item.id,
    titulo: esAlta ? "Viaje creado" : "Viaje actualizado",
    sujeto: [persona, fecha ? formatDate(fecha) : "", sentido].filter(Boolean).join(" · "),
    cambios: esAlta ? [] : cambiosDe("trips", antes, despues),
    nota: notaDelCambio(antes, despues),
    abre: item.record_id && mapas.trips.has(item.record_id) ? { tipo: "viaje", id: item.record_id } : null,
  };
}

/**
 * El día de una marca de tiempo, en Santiago, como AAAA-MM-DD. Lo que pasó a
 * las 23:30 en Copiapó es de ese día, aunque en UTC ya sea el siguiente.
 */
export function diaDe(instante: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date(instante));
}

/** Cómo se titula un día en la lista: "Hoy", "Ayer" o la fecha. */
export function nombreDelDia(dia: string, hoy: string) {
  if (dia === hoy) return "Hoy";
  if (dia === addDays(hoy, -1)) return "Ayer";
  return formatDate(dia);
}

/** Agrupa por día, en el orden en que vienen (los más recientes primero). */
export function agruparPorDia<T extends { created_at: string }>(items: T[], hoy: string) {
  const grupos: { dia: string; nombre: string; items: T[] }[] = [];
  for (const item of items) {
    const dia = diaDe(item.created_at);
    const ultimo = grupos.at(-1);
    if (ultimo?.dia === dia) ultimo.items.push(item);
    else grupos.push({ dia, nombre: nombreDelDia(dia, hoy), items: [item] });
  }
  return grupos;
}
