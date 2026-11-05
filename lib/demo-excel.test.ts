import test from "node:test";
import assert from "node:assert/strict";
import { makeDemoPeople, makeDemoTrips } from "./demo.ts";
import { buildExcelSyncPayload, tripToExcelRow } from "./excel-sync.ts";
import { buildPreviewLines } from "./excel-sync-preview.ts";

test("los identificadores demo son UUID válidos, únicos y deterministas", () => {
  const people = makeDemoPeople();
  const trips = makeDemoTrips(people);
  const ids = [...people, ...trips].map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  }
  assert.deepEqual(makeDemoPeople().map((person) => person.id), people.map((person) => person.id));
  assert.deepEqual(makeDemoTrips(people).map((trip) => trip.id), trips.map((trip) => trip.id));
  assert.ok(trips.every((trip) => people.some((person) => person.id === trip.person_id)));
});

test("el libro actual de demostración se reimporta completo sin errores ni cambios", () => {
  const people = makeDemoPeople();
  const trips = makeDemoTrips(people);
  const peopleById = new Map(people.map((person) => [person.id, person]));
  // La descarga convierte las celdas a texto, salvo Sí/No para las booleanas.
  const serialize = (row: Record<string, unknown>) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      typeof value === "boolean" ? (value ? "Sí" : "No") : String(value ?? ""),
    ]),
  );
  const peopleRows = people.map((person) => serialize({
    daybookId: person.id,
    codigoPersona: person.employee_code,
    nombreCompleto: person.name,
    origen: person.origin,
    destino: person.destination,
    turno: person.shift,
    fechaInicio: person.start_date,
    fechaTermino: person.end_date,
    equipaje: person.baggage,
    activa: person.active,
    version: person.version,
    actualizadoEn: person.updated_at,
    accion: "",
    errorSincronizacion: "",
  }));
  const tripRows = trips.map((trip) => serialize(
    tripToExcelRow(trip, peopleById.get(trip.person_id)),
  ));
  const result = buildExcelSyncPayload({ peopleRows, tripRows });

  assert.deepEqual(result.errors, []);
  assert.equal(result.payload.people.length, people.length);
  assert.equal(result.payload.trips.length, trips.length);
  const preview = buildPreviewLines(result.payload, people, trips);
  assert.equal(preview.length, people.length + trips.length);
  assert.ok(preview.every((line) => line.action === "unchanged"), JSON.stringify(preview));
});
