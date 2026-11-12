// Qué cambió en cada entrada del historial.
//
// El trigger audit_change() guarda la fila completa antes y después de cada
// cambio (before_data y after_data). La pantalla mostraba solo "Viaje
// actualizado", la nota y el estado: para saber si se movió la fecha o se puso
// la reserva había que adivinar. Este archivo compara las dos fotos y devuelve
// los campos que la gente reconoce, ya escritos para leer.
//
// Sin React ni Supabase, para poder probarlo.
import { DIAS_SEMANA } from "./cycles.ts";
import { formatoCLP } from "./costs.ts";
import { formatDate } from "./format.ts";

export type Cambio = { campo: string; antes: string; despues: string };

type Fila = Record<string, unknown> | null | undefined;
type Formato = (valor: unknown) => string;

const VACIO = "—";

const texto: Formato = (valor) => {
  const limpio = String(valor ?? "").trim();
  return limpio || VACIO;
};
const fecha: Formato = (valor) =>
  typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? formatDate(valor) : texto(valor);
// La base guarda la hora con segundos ("08:30:00"); se muestra como se escribe.
const hora: Formato = (valor) => (typeof valor === "string" && valor ? valor.slice(0, 5) : VACIO);
const monto: Formato = (valor) =>
  valor === null || valor === undefined || valor === "" ? VACIO : formatoCLP(Number(valor));
const dia: Formato = (valor) =>
  DIAS_SEMANA.find((d) => d.valor === Number(valor))?.nombre.toLowerCase() ?? VACIO;
const activa: Formato = (valor) => (valor ? "Activa" : "Inactiva");

// Lo que se muestra, en el orden del formulario. Lo que no está aquí (ids,
// versiones, fechas de actualización, la persona y el sentido, que no se
// pueden cambiar) no le dice nada a quien lee el historial.
const CAMPOS = {
  trips: [
    ["date", "Fecha", fecha],
    ["origin", "Origen", texto],
    ["destination", "Destino", texto],
    ["requested_time", "Hora", hora],
    ["baggage", "Equipaje", texto],
    ["status", "Estado", texto],
    ["pnr", "Reserva", texto],
    ["flight", "Vuelo", texto],
    ["amount", "Monto", monto],
  ],
  people: [
    ["name", "Nombre", texto],
    ["origin", "Origen habitual", texto],
    ["destination", "Destino de subida", texto],
    ["shift", "Turno", texto],
    ["start_date", "Inicio de vigencia", fecha],
    ["end_date", "Vigente hasta", fecha],
    ["up_weekday", "Sube los", dia],
    ["down_weekday", "Baja los", dia],
    ["baggage", "Equipaje habitual", texto],
    ["active", "Estado", activa],
  ],
  // Los documentos de una persona: lo único que cambia es el vencimiento. Qué
  // documento es (type_id) no cambia; el diálogo lo pone en el título.
  person_documents: [["expires_on", "Vencimiento", fecha]],
} satisfies Record<string, [string, string, Formato][]>;

export type Entidad = keyof typeof CAMPOS;

/** Los campos que cambiaron entre las dos fotos, ya escritos para leer. */
export function cambiosDe(entidad: Entidad, antes: Fila, despues: Fila): Cambio[] {
  if (!antes || !despues) return [];
  const cambios: Cambio[] = [];
  for (const [clave, campo, formato] of CAMPOS[entidad]) {
    const a = formato(antes[clave]);
    const d = formato(despues[clave]);
    // Se compara lo que se lee: "08:30:00" y "08:30" son la misma hora, y un
    // monto de 0 escrito como 0 o como 0.00 es el mismo monto.
    if (a !== d) cambios.push({ campo, antes: a, despues: d });
  }
  return cambios;
}

/**
 * Lo que la nota agregó en este cambio. Las notas de un viaje se acumulan (cada
 * edición suma su "Motivo del cambio"), así que mostrar la nota entera en cada
 * entrada repetía todo lo anterior. Si la nota nueva continúa la anterior, se
 * muestra solo lo agregado; si se reescribió, entera.
 */
export function notaDelCambio(antes: Fila, despues: Fila): string {
  const nueva = String(despues?.notes ?? "").trim();
  const vieja = String(antes?.notes ?? "").trim();
  if (!nueva || nueva === vieja) return "";
  if (vieja && nueva.startsWith(vieja)) return nueva.slice(vieja.length).trim();
  return nueva;
}
