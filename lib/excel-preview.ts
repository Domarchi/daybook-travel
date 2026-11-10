// La parte de cuentas del importador de Excel: leer las hojas como registros,
// comparar contra lo que hay y armar las líneas de la vista previa. No sabe de
// React ni de Supabase, así que se prueba sola (`excel-preview.test.ts`).
//
// Vivía dentro de `app/excel-sync-panel.tsx`, que llegó a 1.200 líneas.

import {
  PERSON_EXCEL_FIELDS,
  TRIP_EXCEL_FIELDS,
  mensajePublicoExcel,
  type ExcelRow,
  type ExcelSyncPayload,
  type ExcelSyncResult,
  type ExcelSyncValidationError,
} from "./excel-sync.ts";
import type { Person, Trip } from "./types.ts";

export type ImportRow = ExcelRow & { row_number: number };
export type Phase = "idle" | "reading" | "preview" | "applying" | "done";
export type PreviewAction = "new" | "change" | "unchanged" | "conflict";

export type PreviewLine = {
  entity: "Persona" | "Viaje";
  row: number;
  action: PreviewAction;
  title: string;
  detail: string;
};

export type LocalIssue = {
  entity: "Persona" | "Viaje" | "Archivo";
  row?: number;
  message: string;
};

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS_PER_SHEET = 5_000;

export const peopleHeaders = [...PERSON_EXCEL_FIELDS];
export const tripHeaders = [...TRIP_EXCEL_FIELDS];

export const personCompareKeys = [
  "employee_code",
  "name",
  "origin",
  "destination",
  "shift",
  "start_date",
  "end_date",
  "baggage",
  "active",
];

export const tripCompareKeys = [
  "date",
  "origin",
  "destination",
  "requested_time",
  "baggage",
  "status",
  "pnr",
  "flight",
  "amount",
  "notes",
];

export const normalizeName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CL")
    .replace(/[^a-z0-9]/g, "");

export const displayValue = (value: unknown) => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return value;
};

export function rowsToRecords(
  rows: unknown[][],
  sheet: string,
  expectedHeaders: readonly string[],
): ImportRow[] {
  if (!rows.length) return [];
  const expected = new Set(expectedHeaders.map(normalizeName));
  const candidates = rows.slice(0, 10).map((candidate, index) => ({
    index,
    headers: candidate.map((cell) => String(displayValue(cell)).trim()),
    score: candidate.reduce<number>(
      (total, cell) =>
        total +
        (expected.has(normalizeName(String(displayValue(cell)))) ? 1 : 0),
      0,
    ),
  }));
  const headerRow = candidates.reduce(
    (best, candidate) => (candidate.score > best.score ? candidate : best),
    { index: -1, headers: [] as string[], score: 0 },
  );
  if (headerRow.score < 3) {
    throw new Error(
      `No encontramos los encabezados de ${sheet} dentro de las primeras 10 filas. Usa el libro descargado desde Daybook Travel.`,
    );
  }
  const { headers } = headerRow;
  const duplicate = headers.find(
    (header, index) =>
      header &&
      headers.findIndex(
        (candidate) => normalizeName(candidate) === normalizeName(header),
      ) !== index,
  );
  if (duplicate) {
    throw new Error(`La hoja ${sheet} repite el encabezado “${duplicate}”.`);
  }
  const records: ImportRow[] = [];
  rows.slice(headerRow.index + 1).forEach((cells, index) => {
    if (!cells.some((cell) => String(displayValue(cell)).trim())) return;
    const record: ImportRow = { row_number: headerRow.index + index + 2 };
    headers.forEach((header, column) => {
      if (header) record[header] = displayValue(cells[column]);
    });
    records.push(record);
  });
  return records;
}

export function resultCount(value: number | unknown[] | null | undefined) {
  if (Array.isArray(value)) return value.length;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function comparable(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  const text = String(value).trim();
  const time = /^(\d{1,2}):(\d{2})(?::00)?$/.exec(text);
  return time ? `${time[1].padStart(2, "0")}:${time[2]}` : text;
}

export function hasChanges(
  imported: Record<string, unknown>,
  current: Record<string, unknown>,
  keys: string[],
) {
  return keys.some(
    (key) =>
      key in imported && comparable(imported[key]) !== comparable(current[key]),
  );
}

export function issueToLocal(issue: ExcelSyncValidationError): LocalIssue {
  return {
    entity:
      issue.entity === "people"
        ? "Persona"
        : issue.entity === "trips"
          ? "Viaje"
          : "Archivo",
    row: issue.row_number,
    message: mensajePublicoExcel(issue.message),
  };
}

export function actionLabel(action: PreviewAction) {
  if (action === "new") return "Nuevo";
  if (action === "change") return "Cambio";
  if (action === "conflict") return "Conflicto";
  return "Sin cambios";
}

export function getServerIssues(result: ExcelSyncResult | null) {
  if (!result) return [];
  return [
    ...(result.people?.conflicts ?? []).map(issueToLocal),
    ...(result.people?.errors ?? []).map(issueToLocal),
    ...(result.trips?.conflicts ?? []).map(issueToLocal),
    ...(result.trips?.errors ?? []).map(issueToLocal),
  ];
}

export function buildPreviewLines(
  payload: ExcelSyncPayload,
  people: Person[],
  trips: Trip[],
) {
  const lines: PreviewLine[] = [];
  const currentPeople = new Map(people.map((person) => [person.id, person]));
  const currentTrips = new Map(trips.map((trip) => [trip.id, trip]));
  const seenPersonIds = new Set<string>();
  const seenTripIds = new Set<string>();
  const peopleByCode = new Map(
    people
      .filter((person) => person.employee_code)
      .map((person) => [normalizeName(person.employee_code!), person]),
  );
  const importedPeopleByCode = new Map(
    payload.people
      .filter((person) => person.employee_code)
      .map((person) => [normalizeName(person.employee_code!), person]),
  );
  const importedCodes = new Set<string>();
  const newTripKeys = new Set<string>();

  for (const record of payload.people) {
    const id = String(record.id ?? "").trim();
    const code = String(record.employee_code ?? "").trim();
    const row = record.row_number;
    const title = String(record.name || `Persona en fila ${row}`);
    let action: PreviewAction = "new";
    let detail = `${record.origin ?? "Origen pendiente"} → ${record.destination ?? "Destino pendiente"}`;
    if (id) {
      if (seenPersonIds.has(id)) {
        action = "conflict";
        detail = "El mismo ID Daybook aparece más de una vez en el libro.";
      } else {
        const current = currentPeople.get(id);
        if (!current) {
          action = "conflict";
          detail = "El ID Daybook no existe en los datos actuales.";
        } else if (
          record.version !== undefined &&
          current.version !== undefined &&
          Number(record.version) !== Number(current.version)
        ) {
          action = "conflict";
          detail = "La versión del registro ya cambió en Daybook Travel.";
        } else {
          action = hasChanges(
            record as Record<string, unknown>,
            current as unknown as Record<string, unknown>,
            personCompareKeys,
          )
            ? "change"
            : "unchanged";
        }
      }
      seenPersonIds.add(id);
    } else if (code) {
      const normalizedCode = normalizeName(code);
      if (
        peopleByCode.has(normalizedCode) ||
        importedCodes.has(normalizedCode)
      ) {
        action = "conflict";
        detail =
          "El Código trabajador ya está en uso. Descarga el libro actual para editar esa persona.";
      }
      importedCodes.add(normalizedCode);
    }
    lines.push({ entity: "Persona", row, action, title, detail });
  }

  for (const record of payload.trips) {
    const id = String(record.id ?? "").trim();
    const row = record.row_number;
    const personCode = String(record.person_employee_code ?? "").trim();
    const normalizedPersonCode = normalizeName(personCode);
    const relatedPerson = record.person_id
      ? currentPeople.get(record.person_id)
      : peopleByCode.get(normalizedPersonCode) ??
        importedPeopleByCode.get(normalizedPersonCode);
    const title = relatedPerson
      ? `${relatedPerson.name} · ${record.date ?? "fecha pendiente"}`
      : personCode
        ? `${personCode} · ${record.date ?? "fecha pendiente"}`
        : `Viaje del ${record.date ?? `fila ${row}`}`;
    let action: PreviewAction = "new";
    let detail = `${record.origin ?? "Origen pendiente"} → ${record.destination ?? "Destino pendiente"}`;
    if (id) {
      if (seenTripIds.has(id)) {
        action = "conflict";
        detail = "El mismo ID Daybook aparece más de una vez en el libro.";
      } else {
        const current = currentTrips.get(id);
        if (!current) {
          action = "conflict";
          detail = "El ID Daybook no existe en los datos actuales.";
        } else if (
          record.version !== undefined &&
          current.version !== undefined &&
          Number(record.version) !== Number(current.version)
        ) {
          action = "conflict";
          detail = "La versión del viaje ya cambió en Daybook Travel.";
        } else {
          const importedPersonId =
            String(record.person_id ?? "").trim() ||
            peopleByCode.get(normalizeName(personCode))?.id ||
            "";
          const changedImmutableField =
            (importedPersonId !== "" && importedPersonId !== current.person_id) ||
            comparable(record.direction) !== comparable(current.direction) ||
            comparable(record.planned_date) !==
              comparable(current.planned_date ?? current.date);
          const mutableChanges = hasChanges(
            record as Record<string, unknown>,
            current as unknown as Record<string, unknown>,
            tripCompareKeys,
          );
          if (changedImmutableField) {
            action = "conflict";
            detail =
              "La persona, fecha planificada y sentido no se pueden cambiar desde Excel.";
          } else if (mutableChanges && !comparable(record.change_reason)) {
            action = "conflict";
            detail =
              "Agrega un motivoCambio para actualizar este viaje desde Excel.";
          } else {
            action = mutableChanges ? "change" : "unchanged";
          }
        }
      }
      seenTripIds.add(id);
    } else {
      const referenceKey = record.person_id
        ? `id:${record.person_id}`
        : `code:${normalizedPersonCode}`;
      const tripKey = `${referenceKey}:${record.date}:${record.direction}`;
      if (
        !record.person_id &&
        (!personCode ||
          (!peopleByCode.has(normalizedPersonCode) &&
            !importedPeopleByCode.has(normalizedPersonCode)))
      ) {
        action = "conflict";
        detail =
          "El código no corresponde a una persona actual ni a una persona nueva de este libro.";
      } else if (newTripKeys.has(tripKey)) {
        action = "conflict";
        detail =
          "El mismo movimiento aparece más de una vez para esta persona y fecha.";
      }
      newTripKeys.add(tripKey);
    }
    lines.push({ entity: "Viaje", row, action, title, detail });
  }

  return lines;
}
