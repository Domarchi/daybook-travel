import type { Person, Trip } from "./types.ts";
import type { ExcelSyncPayload } from "./excel-sync.ts";

export type PreviewAction = "new" | "change" | "unchanged" | "conflict";

export type PreviewLine = {
  entity: "Persona" | "Viaje";
  row: number;
  action: PreviewAction;
  title: string;
  detail: string;
};

const personCompareKeys = [
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

const tripCompareKeys = [
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

const normalizeName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CL")
    .replace(/[^a-z0-9]/g, "");

function comparable(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  const text = String(value).trim();
  const time = /^(\d{1,2}):(\d{2})(?::00)?$/.exec(text);
  return time ? `${time[1].padStart(2, "0")}:${time[2]}` : text;
}

function hasChanges(
  imported: Record<string, unknown>,
  current: Record<string, unknown>,
  keys: string[],
) {
  return keys.some(
    (key) =>
      key in imported && comparable(imported[key]) !== comparable(current[key]),
  );
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
            // Un viaje manual o legado puede no tener fecha planificada.
            // No sustituirla por date: exportar y volver a importar debe conservar null.
            comparable(record.planned_date) !==
              comparable(current.planned_date);
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
