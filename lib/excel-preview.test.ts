import test from "node:test";
import assert from "node:assert/strict";
import {
  actionLabel,
  buildPreviewLines,
  comparable,
  hasChanges,
  normalizeName,
  peopleHeaders,
  rowsToRecords,
} from "./excel-preview.ts";
import type { ExcelSyncPayload, PersonSyncRow, TripSyncRow } from "./excel-sync.ts";
import type { Person, Trip } from "./types.ts";

const persona = (extra: Partial<PersonSyncRow> = {}): PersonSyncRow => ({
  row_number: 2, id: null, version: null, employee_code: null, name: "Ana Pérez",
  origin: "Santiago", destination: "Copiapó", shift: "4×3", start_date: "2026-01-05",
  end_date: null, baggage: "Mochila", active: true, ...extra,
});

const viaje = (extra: Partial<TripSyncRow> = {}): TripSyncRow => ({
  row_number: 2, id: null, version: null, person_id: null, person_employee_code: null,
  date: "2026-02-02", planned_date: null, direction: "SUBIDA", origin: "Santiago",
  destination: "Copiapó", requested_time: null, baggage: "Mochila", status: "Planificado",
  pnr: "", flight: "", amount: null, notes: "", change_reason: "", ...extra,
});

const actual: Person = {
  id: "p1", version: 3, employee_code: "E1", name: "Ana Pérez", origin: "Santiago",
  destination: "Copiapó", shift: "4×3", start_date: "2026-01-05", end_date: null,
  baggage: "Mochila", active: true,
};

const payload = (people: PersonSyncRow[], trips: TripSyncRow[] = []): ExcelSyncPayload => ({ people, trips });

test("los nombres de encabezado se comparan sin tildes, mayúsculas ni signos", () => {
  assert.equal(normalizeName("Código Trabajador"), "codigotrabajador");
  assert.equal(normalizeName("  fecha_inicio "), "fechainicio");
});

test("rowsToRecords encuentra los encabezados aunque haya filas de título arriba", () => {
  const rows = [
    ["Libro de personas"],
    [...peopleHeaders],
    ["", "E1", "Ana"],
    [],
    ["", "E2", "Luis"],
  ];
  const registros = rowsToRecords(rows, "Personas", peopleHeaders);
  assert.equal(registros.length, 2, "las filas vacías no cuentan");
  assert.deepEqual(registros.map((fila) => fila.row_number), [3, 5], "el número de fila es el del Excel");
  assert.equal(registros[0].nombreCompleto, "Ana");
});

test("rowsToRecords rechaza una hoja sin encabezados reconocibles o con uno repetido", () => {
  assert.throws(() => rowsToRecords([["a", "b"], ["1", "2"]], "Personas", peopleHeaders), /No encontramos los encabezados de Personas/);
  const repetido = [[...peopleHeaders, "nombreCompleto"], ["x"]];
  assert.throws(() => rowsToRecords(repetido, "Personas", peopleHeaders), /repite el encabezado/);
  assert.deepEqual(rowsToRecords([], "Personas", peopleHeaders), []);
});

test("comparable y hasChanges ignoran diferencias de formato que no son cambios", () => {
  assert.equal(comparable("8:30"), "08:30");
  assert.equal(comparable("08:30:00"), "08:30");
  assert.equal(comparable(null), "");
  assert.equal(comparable(true), "true");
  assert.equal(hasChanges({ requested_time: "8:30" }, { requested_time: "08:30:00" }, ["requested_time"]), false);
  assert.equal(hasChanges({ name: "Ana" }, { name: "Anna" }, ["name"]), true);
  assert.equal(hasChanges({}, { name: "Anna" }, ["name"]), false, "una columna ausente del libro no es un cambio");
});

test("las etiquetas de acción están en español", () => {
  assert.deepEqual(["new", "change", "conflict", "unchanged"].map((a) => actionLabel(a as never)), ["Nuevo", "Cambio", "Conflicto", "Sin cambios"]);
});

test("una persona sin ID es nueva; con ID y sin cambios no se toca", () => {
  const lineas = buildPreviewLines(payload([persona(), persona({ id: "p1", version: 3, employee_code: "E1", row_number: 3 })]), [actual], []);
  assert.deepEqual(lineas.map((l) => l.action), ["new", "unchanged"]);
});

test("una persona con ID cambia, o choca si el ID no existe o la versión ya cambió", () => {
  const casos: [Partial<PersonSyncRow>, string][] = [
    [{ id: "p1", version: 3, employee_code: "E1", origin: "Concepción" }, "change"],
    [{ id: "otro", version: 1 }, "conflict"],
    [{ id: "p1", version: 2, employee_code: "E1" }, "conflict"],
  ];
  for (const [extra, esperado] of casos) {
    const [linea] = buildPreviewLines(payload([persona(extra)]), [actual], []);
    assert.equal(linea.action, esperado, JSON.stringify(extra));
  }
});

test("un código de trabajador repetido es conflicto, también dentro del mismo libro", () => {
  const usado = buildPreviewLines(payload([persona({ employee_code: "E1" })]), [actual], []);
  assert.equal(usado[0].action, "conflict");
  const repetido = buildPreviewLines(payload([persona({ employee_code: "N1" }), persona({ employee_code: "n1", row_number: 3 })]), [], []);
  assert.deepEqual(repetido.map((l) => l.action), ["new", "conflict"]);
});

test("un viaje nuevo exige una persona conocida y no se repite", () => {
  const sinPersona = buildPreviewLines(payload([], [viaje({ person_employee_code: "NADIE" })]), [actual], []);
  assert.equal(sinPersona[0].action, "conflict");
  const conPersona = buildPreviewLines(payload([], [viaje({ person_id: "p1" }), viaje({ person_id: "p1", row_number: 3 })]), [actual], []);
  assert.deepEqual(conPersona.map((l) => l.action), ["new", "conflict"], "el mismo movimiento dos veces es conflicto");
});

test("cambiar un viaje existente exige motivo y no deja cambiar persona ni sentido", () => {
  const existente: Trip = {
    id: "t1", version: 1, person_id: "p1", date: "2026-02-02", planned_date: "2026-02-02", direction: "SUBIDA",
    origin: "Santiago", destination: "Copiapó", requested_time: null, baggage: "Mochila", status: "Planificado",
    pnr: "", flight: "", amount: null, notes: "",
  };
  const base = { id: "t1", version: 1, person_id: "p1", planned_date: "2026-02-02" };
  const sinMotivo = buildPreviewLines(payload([], [viaje({ ...base, notes: "Nueva nota" })]), [actual], [existente]);
  assert.equal(sinMotivo[0].action, "conflict");
  const conMotivo = buildPreviewLines(payload([], [viaje({ ...base, notes: "Nueva nota", change_reason: "Pidió otra hora" })]), [actual], [existente]);
  assert.equal(conMotivo[0].action, "change");
  const otroSentido = buildPreviewLines(payload([], [viaje({ ...base, direction: "BAJADA", change_reason: "x" })]), [actual], [existente]);
  assert.equal(otroSentido[0].action, "conflict");
  const igual = buildPreviewLines(payload([], [viaje(base)]), [actual], [existente]);
  assert.equal(igual[0].action, "unchanged");
});
