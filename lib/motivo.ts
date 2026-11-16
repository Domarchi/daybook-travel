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
import { observacionesDe } from "./notas.ts";

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

// Las opciones de un toque para los motivos más comunes. Llenan el campo y se
// pueden completar: «Cambio de fecha: pidió subir un día antes».
export const MOTIVOS_RAPIDOS = ["No viajó", "Cambio de fecha", "Corrección"] as const;

/** Lo que se compara de un viaje: los campos que el diálogo deja cambiar. */
export type CamposDelViaje = {
  date: string;
  origin: string;
  destination: string;
  requested_time: string;
  baggage: string;
  status: string;
  pnr: string;
  flight: string;
  amount: string;
  notes: string;
};

/** Los campos tal como vienen del formulario del viaje, sin completar nada. */
export function camposDelFormulario(form: FormData): CamposDelViaje {
  const valor = (nombre: string) => String(form.get(nombre) ?? "").trim();
  return {
    date: valor("date"),
    origin: valor("origin"),
    destination: valor("destination"),
    requested_time: valor("requested_time").slice(0, 5),
    baggage: valor("baggage"),
    status: valor("status"),
    pnr: valor("pnr"),
    flight: valor("flight"),
    amount: valor("amount"),
    notes: valor("notes"),
  };
}

type ViajeGuardado = {
  date: string;
  origin: string;
  destination: string;
  requested_time: string | null;
  baggage: string;
  status: string;
  pnr: string | null;
  flight: string | null;
  amount: number | null;
  notes: string | null;
};

// Registrar un dato que faltaba (el código de la agencia, el vuelo, el monto o
// la hora) es un paso de rutina, como la reserva en bloque (lib/reserva.ts): no
// hay una decisión que explicar y el motivo se escribe solo, diciendo qué se
// registró, para que el historial se lea igual. El motivo lo sigue pidiendo todo
// lo demás: cambiar la fecha, la ruta, el equipaje, las observaciones o el
// estado, y corregir o borrar un dato que ya estaba.
//
// La única excepción de estado es la de la reserva en bloque: un Planificado o
// Solicitado que recibe su código y pasa a Emitido.
const SE_REGISTRAN = ["pnr", "flight", "amount", "requested_time"] as const;

/** El motivo que se anota solo, o null si el cambio necesita que alguien lo explique. */
export function motivoAutomatico(antes: ViajeGuardado, despues: CamposDelViaje): string | null {
  const previo: CamposDelViaje = {
    date: antes.date,
    origin: (antes.origin ?? "").trim(),
    destination: (antes.destination ?? "").trim(),
    requested_time: (antes.requested_time ?? "").slice(0, 5),
    baggage: antes.baggage ?? "",
    status: antes.status,
    pnr: (antes.pnr ?? "").trim(),
    flight: (antes.flight ?? "").trim(),
    amount: antes.amount === null || antes.amount === undefined ? "" : String(antes.amount),
    notes: observacionesDe(antes.notes),
  };
  // El monto se compara como número: «85990» y «85990.0» son lo mismo.
  const monto = (valor: string) => (valor === "" ? "" : String(Number(valor)));
  const ahora = { ...despues, amount: monto(despues.amount) };
  previo.amount = monto(previo.amount);
  const cambiados = (Object.keys(previo) as (keyof CamposDelViaje)[]).filter(
    (campo) => previo[campo] !== ahora[campo],
  );
  if (!cambiados.length) return null;

  const registrados = cambiados.filter((campo) => (SE_REGISTRAN as readonly string[]).includes(campo));
  const emite =
    previo.status !== despues.status &&
    despues.status === "Emitido" &&
    ["Planificado", "Solicitado"].includes(previo.status) &&
    registrados.includes("pnr");
  if (cambiados.some((campo) => !registrados.includes(campo) && !(campo === "status" && emite))) {
    return null;
  }
  // Solo lo que faltaba: corregir o borrar un dato es una decisión.
  if (registrados.some((campo) => previo[campo] !== "" || ahora[campo] === "")) return null;

  const partes = registrados.map((campo) =>
    campo === "pnr"
      ? `la reserva ${ahora.pnr}`
      : campo === "flight"
        ? `el vuelo ${ahora.flight}`
        : campo === "amount"
          ? "el monto"
          : "la hora requerida",
  );
  const lista =
    partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`;
  return `Se registró ${lista}.`;
}
