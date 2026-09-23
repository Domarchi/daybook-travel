// El vocabulario del dominio vive en ./types.ts; se reexporta para no cambiar
// la interfaz pública de este módulo.
import { TRIP_STATUSES } from "./types.ts";
import type { Baggage, Shift, TripDirection, TripStatus } from "./types.ts";
export {
  SHIFTS,
  TRIP_DIRECTIONS,
  TRIP_STATUSES,
  BAGGAGE_OPTIONS,
} from "./types.ts";
export const PERSON_EXCEL_FIELDS = [
  "daybookId",
  "codigoPersona",
  "nombreCompleto",
  "origen",
  "destino",
  "turno",
  "fechaInicio",
  "fechaTermino",
  "equipaje",
  "activa",
  "version",
  "actualizadoEn",
  "accion",
  "errorSincronizacion",
] as const;

export const TRIP_EXCEL_FIELDS = [
  "daybookId",
  "personaId",
  "codigoPersona",
  "persona",
  "fechaPlanificada",
  "fechaViaje",
  "sentido",
  "origen",
  "destino",
  "horaRequerida",
  "equipaje",
  "estado",
  "pnr",
  "vuelo",
  "montoClp",
  "observaciones",
  "motivoCambio",
  "version",
  "actualizadoEn",
  "accion",
  "errorSincronizacion",
] as const;

export type { Shift, TripDirection, TripStatus, Baggage } from "./types.ts";
export type ExcelCell = unknown;
export type ExcelRow = Record<string, unknown>;

export type PersonSyncRow = {
  row_number: number;
  id: string | null;
  version: number | null;
  employee_code: string | null;
  name: string;
  origin: string;
  destination: string;
  shift: Shift;
  start_date: string;
  end_date: string | null;
  baggage: Baggage;
  active: boolean;
};

export type TripSyncRow = {
  row_number: number;
  id: string | null;
  version: number | null;
  person_id: string | null;
  person_employee_code: string | null;
  date: string;
  planned_date: string | null;
  direction: TripDirection;
  origin: string;
  destination: string;
  requested_time: string | null;
  baggage: Baggage;
  status: TripStatus;
  pnr: string;
  flight: string;
  amount: number | null;
  notes: string;
  change_reason: string;
};

export type ExcelSyncPayload = {
  people: PersonSyncRow[];
  trips: TripSyncRow[];
};

export type ExcelSyncEntity = "people" | "trips";
export type ExcelSyncValidationError = {
  entity: ExcelSyncEntity;
  row_number: number;
  field?: string;
  message: string;
};

export type ExcelSyncIssue = {
  entity: ExcelSyncEntity;
  row_number: number;
  message: string;
  field?: string;
  id?: string;
  employee_code?: string;
  expected_version?: number | null;
  current_version?: number | null;
  constraint?: string;
};

// La base conserva mensajes y aliases heredados por compatibilidad. Nada de eso
// debe volver a aparecer como identidad pública en la interfaz.
export function mensajePublicoExcel(message: string): string {
  return message
    .replace(/FCC TRAVEL/gi, "Daybook Travel")
    .replace(/ID FCC/gi, "ID Daybook");
}

export function issuePublicoAlLeerExcel(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "No pudimos leer el archivo. Descarga la plantilla e inténtalo nuevamente.";
  return {
    entity: "Archivo" as const,
    message: mensajePublicoExcel(message),
  };
}

export type ExcelSyncResultEntry = {
  row_number: number;
  id?: string;
  employee_code?: string;
  version?: number;
  expected_version?: number | null;
  current_version?: number | null;
  message?: string;
  constraint?: string;
};

export type ExcelSyncEntityResult = {
  inserted: ExcelSyncResultEntry[];
  updated: ExcelSyncResultEntry[];
  unchanged: ExcelSyncResultEntry[];
  conflicts: ExcelSyncIssue[];
  errors: ExcelSyncIssue[];
};

export type ExcelSyncResult = {
  sync_id: string;
  idempotent: boolean;
  applied: boolean;
  people: ExcelSyncEntityResult;
  trips: ExcelSyncEntityResult;
};

export type NormalizedRowResult<T> = {
  value: T | null;
  errors: ExcelSyncValidationError[];
};

const PERSON_ALIASES = {
  id: ["daybookId", "ID Daybook", "fccId", "ID FCC", "fcc_id", "id"],
  version: ["version", "Versión"],
  employeeCode: [
    "codigoPersona",
    "Código persona",
    "Código trabajador",
    "Código empleado",
    "employee_code",
  ],
  name: ["nombreCompleto", "Nombre completo", "nombre", "name"],
  origin: ["origen", "origin"],
  destination: ["destino", "destination"],
  shift: ["turno", "shift"],
  startDate: ["fechaInicio", "Fecha inicio", "start_date"],
  endDate: ["fechaTermino", "Fecha término", "Fecha termino", "end_date"],
  baggage: ["equipaje", "baggage"],
  active: ["activa", "activo", "active"],
} as const;

const TRIP_ALIASES = {
  id: ["daybookId", "ID Daybook", "fccId", "ID FCC", "fcc_id", "id"],
  version: ["version", "Versión"],
  personId: ["personaId", "ID persona", "person_id"],
  personEmployeeCode: [
    "codigoPersona",
    "Código persona",
    "Código trabajador",
    "Código empleado",
    "person_employee_code",
  ],
  date: ["fechaViaje", "Fecha viaje", "fecha", "date"],
  plannedDate: [
    "fechaPlanificada",
    "Fecha planificada",
    "planned_date",
  ],
  direction: ["sentido", "movimiento", "dirección", "direccion", "direction"],
  origin: ["origen", "origin"],
  destination: ["destino", "destination"],
  requestedTime: ["horaRequerida", "Hora requerida", "requested_time"],
  baggage: ["equipaje", "baggage"],
  status: ["estado", "status"],
  pnr: ["pnr", "reserva"],
  flight: ["vuelo", "flight"],
  amount: ["montoClp", "Monto CLP", "monto", "amount"],
  notes: ["observaciones", "notas", "notes"],
  changeReason: ["motivoCambio", "Motivo del cambio", "change_reason"],
} as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizedKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLocaleLowerCase("es-CL")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function indexedRow(row: ExcelRow) {
  const result = new Map<string, ExcelCell>();
  for (const [key, value] of Object.entries(row)) {
    const normalized = normalizedKey(key);
    if (!result.has(normalized) || isBlank(result.get(normalized))) {
      result.set(normalized, value);
    }
  }
  return result;
}

function getCell(
  row: Map<string, ExcelCell>,
  aliases: readonly string[],
): ExcelCell {
  for (const alias of aliases) {
    const key = normalizedKey(alias);
    if (row.has(key)) return row.get(key);
  }
  return undefined;
}

function isBlank(value: unknown) {
  return value === null || value === undefined || String(value).trim() === "";
}

function textValue(value: ExcelCell) {
  return isBlank(value) ? "" : String(value).trim();
}

function enumKey(value: ExcelCell) {
  return textValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CL")
    .replace(/\s+/g, " ");
}

function parseUuid(value: ExcelCell) {
  const candidate = textValue(value);
  if (!candidate) return { value: null, valid: true };
  return { value: candidate, valid: UUID_PATTERN.test(candidate) };
}

function parseVersion(value: ExcelCell) {
  if (isBlank(value)) return { value: null, valid: true };
  const parsed =
    typeof value === "number" ? value : Number(textValue(value).replace(",", "."));
  return {
    value: Number.isInteger(parsed) && parsed > 0 ? parsed : null,
    valid: Number.isInteger(parsed) && parsed > 0,
  };
}

function validDateParts(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isoDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDate(value: ExcelCell) {
  if (isBlank(value)) return { value: null, valid: true };
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getUTCFullYear();
    const month = value.getUTCMonth() + 1;
    const day = value.getUTCDate();
    return { value: isoDate(year, month, day), valid: true };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const epoch = Date.UTC(1899, 11, 30);
    const date = new Date(epoch + Math.floor(value) * 86_400_000);
    return {
      value: isoDate(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate(),
      ),
      valid: true,
    };
  }
  const candidate = textValue(value);
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(candidate);
  let year: number;
  let month: number;
  let day: number;
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    match = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(candidate);
    if (!match) return { value: null, valid: false };
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  }
  return validDateParts(year, month, day)
    ? { value: isoDate(year, month, day), valid: true }
    : { value: null, valid: false };
}

function parseTime(value: ExcelCell) {
  if (isBlank(value)) return { value: null, valid: true };
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      value: `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`,
      valid: true,
    };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const fraction = ((value % 1) + 1) % 1;
    const totalMinutes = Math.round(fraction * 24 * 60) % (24 * 60);
    return {
      value: `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`,
      valid: true,
    };
  }
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(textValue(value));
  if (!match) return { value: null, valid: false };
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59
    ? {
        value: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
        valid: true,
      }
    : { value: null, valid: false };
}

function parseAmount(value: ExcelCell) {
  if (isBlank(value)) return { value: null, valid: true };
  if (typeof value === "number") {
    return {
      value: Number.isFinite(value) && value >= 0 ? value : null,
      valid: Number.isFinite(value) && value >= 0,
    };
  }
  let candidate = textValue(value)
    .replace(/clp/gi, "")
    .replace(/\$/g, "")
    .replace(/\s/g, "");
  if (/^-?\d{1,3}(\.\d{3})+$/.test(candidate)) {
    candidate = candidate.replace(/\./g, "");
  } else if (/^-?\d{1,3}(,\d{3})+$/.test(candidate)) {
    candidate = candidate.replace(/,/g, "");
  } else if (candidate.includes(",") && candidate.includes(".")) {
    if (candidate.lastIndexOf(",") > candidate.lastIndexOf(".")) {
      candidate = candidate.replace(/\./g, "").replace(",", ".");
    } else {
      candidate = candidate.replace(/,/g, "");
    }
  } else if (candidate.includes(",")) {
    candidate = candidate.replace(",", ".");
  }
  const parsed = Number(candidate);
  return {
    value: Number.isFinite(parsed) && parsed >= 0 ? parsed : null,
    valid: Number.isFinite(parsed) && parsed >= 0,
  };
}

function parseBoolean(value: ExcelCell, defaultValue: boolean) {
  if (isBlank(value)) return { value: defaultValue, valid: true };
  if (typeof value === "boolean") return { value, valid: true };
  if (typeof value === "number" && (value === 0 || value === 1)) {
    return { value: value === 1, valid: true };
  }
  const candidate = enumKey(value);
  if (["si", "sí", "true", "verdadero", "1", "x", "activa", "activo"].includes(candidate)) {
    return { value: true, valid: true };
  }
  if (["no", "false", "falso", "0", "inactiva", "inactivo"].includes(candidate)) {
    return { value: false, valid: true };
  }
  return { value: defaultValue, valid: false };
}

function parseShift(value: ExcelCell): Shift | null {
  const candidate = enumKey(value).replace(/\s/g, "").replace("×", "x");
  if (!candidate || candidate === "porconfirmar") return "Por confirmar";
  if (candidate === "4x3") return "4×3";
  if (candidate === "10x10") return "10×10";
  if (["sinturno", "sinrotacion", "manual"].includes(candidate)) {
    return "Sin turno";
  }
  return null;
}

function parseDirection(value: ExcelCell): TripDirection | null {
  const candidate = enumKey(value);
  if (candidate === "subida") return "SUBIDA";
  if (candidate === "bajada") return "BAJADA";
  return null;
}

function parseStatus(value: ExcelCell): TripStatus | null {
  const candidate = enumKey(value || "Planificado");
  return (
    TRIP_STATUSES.find((status) => enumKey(status) === candidate) ?? null
  );
}

function parseBaggage(value: ExcelCell): Baggage | null {
  const candidate = enumKey(value || "Por confirmar");
  const aliases: Record<string, Baggage> = {
    "por confirmar": "Por confirmar",
    mochila: "Mochila",
    "maleta cabina": "Maleta de cabina",
    "maleta de cabina": "Maleta de cabina",
    "maleta bodega": "Maleta en bodega",
    "maleta en bodega": "Maleta en bodega",
  };
  return aliases[candidate] ?? null;
}

function monday(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay() === 1;
}

function pushError(
  errors: ExcelSyncValidationError[],
  entity: ExcelSyncEntity,
  rowNumber: number,
  field: string,
  message: string,
) {
  errors.push({ entity, row_number: rowNumber, field, message });
}

export function isEmptyExcelRow(row: ExcelRow) {
  return Object.entries(row).every(
    ([key, value]) => normalizedKey(key) === "row number" || isBlank(value),
  );
}

function explicitRowNumber(row: ExcelRow, fallback: number) {
  const value = Object.entries(row).find(
    ([key]) => normalizedKey(key) === "row number",
  )?.[1];
  const parsed = typeof value === "number" ? value : Number(textValue(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeExcelPerson(
  source: ExcelRow,
  rowNumber: number,
): NormalizedRowResult<PersonSyncRow> {
  const row = indexedRow(source);
  const errors: ExcelSyncValidationError[] = [];
  const id = parseUuid(getCell(row, PERSON_ALIASES.id));
  const version = parseVersion(getCell(row, PERSON_ALIASES.version));
  const name = textValue(getCell(row, PERSON_ALIASES.name));
  const origin = textValue(getCell(row, PERSON_ALIASES.origin));
  const destination =
    textValue(getCell(row, PERSON_ALIASES.destination)) || "Copiapó";
  const shift = parseShift(getCell(row, PERSON_ALIASES.shift));
  const startDate = parseDate(getCell(row, PERSON_ALIASES.startDate));
  const endDate = parseDate(getCell(row, PERSON_ALIASES.endDate));
  const baggage = parseBaggage(getCell(row, PERSON_ALIASES.baggage));
  const active = parseBoolean(getCell(row, PERSON_ALIASES.active), true);

  if (!id.valid) pushError(errors, "people", rowNumber, "daybookId", "El ID Daybook no es válido.");
  if (!version.valid) pushError(errors, "people", rowNumber, "version", "La versión debe ser un entero positivo.");
  if (id.value && version.value === null) pushError(errors, "people", rowNumber, "version", "Una fila existente necesita su versión.");
  if (!id.value && version.value !== null) pushError(errors, "people", rowNumber, "version", "Deja la versión vacía en una fila nueva.");
  if (name.length < 2 || name.length > 180) pushError(errors, "people", rowNumber, "nombreCompleto", "Escribe un nombre de 2 a 180 caracteres.");
  if (!origin) pushError(errors, "people", rowNumber, "origen", "Completa el origen.");
  if (!shift) pushError(errors, "people", rowNumber, "turno", "El turno debe ser Por confirmar, 4×3, 10×10 o Sin turno.");
  if (!startDate.valid || !startDate.value) pushError(errors, "people", rowNumber, "fechaInicio", "Usa una fecha válida.");
  if (!endDate.valid) pushError(errors, "people", rowNumber, "fechaTermino", "Usa una fecha válida.");
  if (startDate.value && endDate.value && endDate.value < startDate.value) pushError(errors, "people", rowNumber, "fechaTermino", "La fecha de término no puede ser anterior al inicio.");
  if (shift === "4×3" && startDate.value && !monday(startDate.value)) pushError(errors, "people", rowNumber, "fechaInicio", "La primera subida 4×3 debe ser lunes.");
  if (!baggage) pushError(errors, "people", rowNumber, "equipaje", "El equipaje no es válido.");
  if (!active.valid) pushError(errors, "people", rowNumber, "activa", "Usa Sí o No.");

  if (errors.length || !shift || !startDate.value || !baggage) {
    return { value: null, errors };
  }
  return {
    value: {
      row_number: rowNumber,
      id: id.value,
      version: version.value,
      employee_code:
        textValue(getCell(row, PERSON_ALIASES.employeeCode)).toUpperCase() || null,
      name,
      origin,
      destination,
      shift,
      start_date: startDate.value,
      end_date: endDate.value,
      baggage,
      active: active.value,
    },
    errors,
  };
}

export function normalizeExcelTrip(
  source: ExcelRow,
  rowNumber: number,
): NormalizedRowResult<TripSyncRow> {
  const row = indexedRow(source);
  const errors: ExcelSyncValidationError[] = [];
  const id = parseUuid(getCell(row, TRIP_ALIASES.id));
  const version = parseVersion(getCell(row, TRIP_ALIASES.version));
  const personId = parseUuid(getCell(row, TRIP_ALIASES.personId));
  const personEmployeeCode = textValue(
    getCell(row, TRIP_ALIASES.personEmployeeCode),
  ).toUpperCase();
  const date = parseDate(getCell(row, TRIP_ALIASES.date));
  const plannedDate = parseDate(getCell(row, TRIP_ALIASES.plannedDate));
  const direction = parseDirection(getCell(row, TRIP_ALIASES.direction));
  const origin = textValue(getCell(row, TRIP_ALIASES.origin));
  const destination = textValue(getCell(row, TRIP_ALIASES.destination));
  const requestedTime = parseTime(getCell(row, TRIP_ALIASES.requestedTime));
  const baggage = parseBaggage(getCell(row, TRIP_ALIASES.baggage));
  const status = parseStatus(getCell(row, TRIP_ALIASES.status));
  const pnr = textValue(getCell(row, TRIP_ALIASES.pnr));
  const amount = parseAmount(getCell(row, TRIP_ALIASES.amount));

  if (!id.valid) pushError(errors, "trips", rowNumber, "daybookId", "El ID Daybook no es válido.");
  if (!version.valid) pushError(errors, "trips", rowNumber, "version", "La versión debe ser un entero positivo.");
  if (id.value && version.value === null) pushError(errors, "trips", rowNumber, "version", "Una fila existente necesita su versión.");
  if (!id.value && version.value !== null) pushError(errors, "trips", rowNumber, "version", "Deja la versión vacía en una fila nueva.");
  if (!personId.valid) pushError(errors, "trips", rowNumber, "personaId", "El ID de persona no es válido.");
  if (!personId.value && !personEmployeeCode) pushError(errors, "trips", rowNumber, "codigoPersona", "Indica el ID o código de la persona.");
  if (!date.valid || !date.value) pushError(errors, "trips", rowNumber, "fechaViaje", "Usa una fecha válida.");
  if (!plannedDate.valid) pushError(errors, "trips", rowNumber, "fechaPlanificada", "Usa una fecha válida.");
  if (!direction) pushError(errors, "trips", rowNumber, "sentido", "El sentido debe ser Subida o Bajada.");
  if (!origin) pushError(errors, "trips", rowNumber, "origen", "Completa el origen.");
  if (!destination) pushError(errors, "trips", rowNumber, "destino", "Completa el destino.");
  if (!requestedTime.valid) pushError(errors, "trips", rowNumber, "horaRequerida", "Usa una hora entre 00:00 y 23:59.");
  if (!baggage) pushError(errors, "trips", rowNumber, "equipaje", "El equipaje no es válido.");
  if (!status) pushError(errors, "trips", rowNumber, "estado", "El estado no es válido.");
  if (!amount.valid) pushError(errors, "trips", rowNumber, "montoClp", "El monto debe ser un número igual o mayor que cero.");
  if (status && ["Emitido", "Completado", "No presentado"].includes(status) && !pnr) pushError(errors, "trips", rowNumber, "pnr", "Este estado necesita un PNR.");

  if (
    errors.length ||
    !date.value ||
    !direction ||
    !baggage ||
    !status
  ) {
    return { value: null, errors };
  }
  return {
    value: {
      row_number: rowNumber,
      id: id.value,
      version: version.value,
      person_id: personId.value,
      person_employee_code: personEmployeeCode || null,
      date: date.value,
      planned_date: plannedDate.value,
      direction,
      origin,
      destination,
      requested_time: requestedTime.value,
      baggage,
      status,
      pnr,
      flight: textValue(getCell(row, TRIP_ALIASES.flight)),
      amount: amount.value,
      notes: textValue(getCell(row, TRIP_ALIASES.notes)),
      change_reason: textValue(getCell(row, TRIP_ALIASES.changeReason)),
    },
    errors,
  };
}

export function buildExcelSyncPayload({
  peopleRows,
  tripRows,
}: {
  peopleRows: ExcelRow[];
  tripRows: ExcelRow[];
}) {
  const payload: ExcelSyncPayload = { people: [], trips: [] };
  const errors: ExcelSyncValidationError[] = [];

  peopleRows.forEach((row, index) => {
    if (isEmptyExcelRow(row)) return;
    const result = normalizeExcelPerson(
      row,
      explicitRowNumber(row, index + 2),
    );
    errors.push(...result.errors);
    if (result.value) payload.people.push(result.value);
  });
  tripRows.forEach((row, index) => {
    if (isEmptyExcelRow(row)) return;
    const result = normalizeExcelTrip(row, explicitRowNumber(row, index + 2));
    errors.push(...result.errors);
    if (result.value) payload.trips.push(result.value);
  });

  return { payload, errors };
}

export const normalizeExcelPersonRow = normalizeExcelPerson;
export const normalizeExcelTripRow = normalizeExcelTrip;
