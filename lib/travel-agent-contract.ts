export const CAMPOS_PROPONIBLES = ["date", "requested_time", "baggage", "notes"] as const;

export type CampoProponible = (typeof CAMPOS_PROPONIBLES)[number];
export type PropuestaTravel = Partial<Record<CampoProponible, string | null>>;
export type ViajeLocal = {
  id: string;
  version: number;
  date: string;
  requested_time: string | null;
  baggage: string;
  notes: string;
};
export type ReceiptTravel = {
  kind: "travel_proposal_applied";
  idempotencyKey: string;
  tripVersion: number;
  changedFields: CampoProponible[];
};

type Validacion =
  | { ok: true; propuesta: PropuestaTravel }
  | { ok: false; reason: "propuesta_invalida" | "campo_no_permitido"; field?: string };

type ResultadoAplicacion = {
  ok: boolean;
  reason?: string;
  replayed: boolean;
  trip: ViajeLocal;
  receipts: ReceiptTravel[];
};

const CAMPOS_PERMITIDOS = new Set<string>(CAMPOS_PROPONIBLES);
const LLAVE_IDEMPOTENCIA = /^[A-Za-z0-9_-]{8,128}$/;
const HORA = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

function esRegistro(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function esFecha(value: string): boolean {
  const match = FECHA.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function esViajeLocal(value: unknown): value is ViajeLocal {
  if (!esRegistro(value)) return false;
  return typeof value.id === "string" && value.id.length > 0 &&
    typeof value.version === "number" && Number.isSafeInteger(value.version) && value.version >= 0 &&
    typeof value.date === "string" &&
    (typeof value.requested_time === "string" || value.requested_time === null) &&
    typeof value.baggage === "string" && typeof value.notes === "string";
}

function esReceiptTravel(value: unknown): value is ReceiptTravel {
  if (!esRegistro(value)) return false;
  return value.kind === "travel_proposal_applied" &&
    typeof value.idempotencyKey === "string" && LLAVE_IDEMPOTENCIA.test(value.idempotencyKey) &&
    typeof value.tripVersion === "number" && Number.isSafeInteger(value.tripVersion) && value.tripVersion >= 0 &&
    Array.isArray(value.changedFields) && value.changedFields.every((field) =>
      typeof field === "string" && CAMPOS_PERMITIDOS.has(field),
    );
}

/** Valida una propuesta estricta: todo campo fuera de la allowlist se rechaza. */
export function validarPropuestaTravel(value: unknown): Validacion {
  if (!esRegistro(value)) return { ok: false, reason: "propuesta_invalida" };
  const fields = Object.keys(value);
  if (fields.length === 0) return { ok: false, reason: "propuesta_invalida" };

  for (const field of fields) {
    if (!CAMPOS_PERMITIDOS.has(field)) {
      return { ok: false, reason: "campo_no_permitido", field };
    }
  }

  for (const field of fields as CampoProponible[]) {
    const proposed = value[field];
    if (
      (field === "date" && (typeof proposed !== "string" || !esFecha(proposed))) ||
      (field === "requested_time" && proposed !== null && (typeof proposed !== "string" || !HORA.test(proposed))) ||
      (field === "baggage" && (typeof proposed !== "string" || proposed.trim().length === 0 || proposed.length > 120)) ||
      (field === "notes" && (typeof proposed !== "string" || proposed.length > 2_000))
    ) {
      return { ok: false, reason: "propuesta_invalida", field };
    }
  }

  return { ok: true, propuesta: { ...value } as PropuestaTravel };
}

/**
 * Núcleo local y puro. La persistencia, sesión y ownership viven fuera: el
 * adaptador de B2 deberá entregar el snapshot, la autorización y los receipts.
 */
export function aplicarPropuestaTravel(input: unknown): ResultadoAplicacion {
  if (!esRegistro(input) || !esViajeLocal(input.trip) || !Array.isArray(input.receipts) ||
    !input.receipts.every(esReceiptTravel)) {
    return rechazoDeEntrada(input);
  }

  const trip = normalizarViajeLocal(input.trip);
  const receipts = input.receipts.map(normalizarReceiptTravel);
  if (typeof input.tripId !== "string" || input.tripId !== trip.id) {
    return rechazo("trip_id_invalido", trip, receipts);
  }
  const tripVersion = input.tripVersion;
  if (typeof tripVersion !== "number" || !Number.isSafeInteger(tripVersion)) {
    return rechazo("version_requerida", trip, receipts);
  }
  if (typeof input.idempotencyKey !== "string" || input.idempotencyKey.length === 0) {
    return rechazo("idempotency_key_requerida", trip, receipts);
  }
  if (!LLAVE_IDEMPOTENCIA.test(input.idempotencyKey)) {
    return rechazo("idempotency_key_invalida", trip, receipts);
  }
  if (input.confirmed !== true) {
    return rechazo("confirmacion_requerida", trip, receipts);
  }
  if (typeof input.authorize !== "function" || !autoriza(input.authorize, trip.id, tripVersion)) {
    return rechazo("no_autorizado", trip, receipts);
  }

  if (receipts.some((receipt) => receipt.idempotencyKey === input.idempotencyKey)) {
    return { ok: true, replayed: true, trip, receipts };
  }
  if (tripVersion !== trip.version) {
    return rechazo("version_obsoleta", trip, receipts);
  }

  const validacion = validarPropuestaTravel(input.propuesta);
  if (validacion.ok === false) {
    return rechazo(validacion.reason, trip, receipts);
  }

  const changedFields = CAMPOS_PROPONIBLES.filter((field) => Object.hasOwn(validacion.propuesta, field));
  const updatedTrip = aplicarPropuestaAViajeLocal(trip, validacion.propuesta);
  const receipt: ReceiptTravel = {
    kind: "travel_proposal_applied",
    idempotencyKey: input.idempotencyKey,
    tripVersion: updatedTrip.version,
    changedFields,
  };
  return { ok: true, replayed: false, trip: updatedTrip, receipts: [...receipts, receipt] };
}

/**
 * Límite de confianza: receipts previos estructuralmente válidos se aceptan por
 * compatibilidad, pero toda salida se reconstruye con la allowlist canónica.
 * Ninguna clave adicional ni referencia mutable del input cruza este límite.
 */
function normalizarViajeLocal(trip: ViajeLocal): ViajeLocal {
  return {
    id: trip.id,
    version: trip.version,
    date: trip.date,
    requested_time: trip.requested_time,
    baggage: trip.baggage,
    notes: trip.notes,
  };
}

function aplicarPropuestaAViajeLocal(trip: ViajeLocal, propuesta: PropuestaTravel): ViajeLocal {
  return {
    id: trip.id,
    version: trip.version + 1,
    date: propuesta.date ?? trip.date,
    requested_time: Object.hasOwn(propuesta, "requested_time") ? propuesta.requested_time ?? null : trip.requested_time,
    baggage: propuesta.baggage ?? trip.baggage,
    notes: propuesta.notes ?? trip.notes,
  };
}

function normalizarReceiptTravel(receipt: ReceiptTravel): ReceiptTravel {
  return {
    kind: receipt.kind,
    idempotencyKey: receipt.idempotencyKey,
    tripVersion: receipt.tripVersion,
    changedFields: [...receipt.changedFields],
  };
}

function autoriza(authorize: unknown, tripId: string, tripVersion: number): boolean {
  try {
    return (authorize as (context: { tripId: string; tripVersion: number }) => unknown)({ tripId, tripVersion }) === true;
  } catch {
    return false;
  }
}

function rechazo(reason: string, trip: ViajeLocal, receipts: ReceiptTravel[]): ResultadoAplicacion {
  return { ok: false, reason, replayed: false, trip, receipts };
}

function rechazoDeEntrada(input: unknown): ResultadoAplicacion {
  const trip = esRegistro(input) && esViajeLocal(input.trip)
    ? normalizarViajeLocal(input.trip)
    : { id: "", version: 0, date: "", requested_time: null, baggage: "", notes: "" };
  const receipts = esRegistro(input) && Array.isArray(input.receipts) && input.receipts.every(esReceiptTravel)
    ? input.receipts.map(normalizarReceiptTravel)
    : [];
  return rechazo("entrada_invalida", trip, receipts);
}
