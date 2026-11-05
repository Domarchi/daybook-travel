import test from "node:test";
import assert from "node:assert/strict";
import writeXlsxFile from "write-excel-file/node";
import readXlsxFile from "read-excel-file/node";
import {
  TRIP_EXCEL_FIELDS,
  buildExcelSyncPayload,
  tripToExcelRow,
  type ExcelRow,
} from "./excel-sync.ts";
import { buildPreviewLines } from "./excel-sync-preview.ts";
import type { Person, Trip } from "./types.ts";

const person: Person = {
  id: "d9c06cad-e6bf-47ba-8754-81f7cc68dd80",
  employee_code: "LB-001",
  version: 1,
  name: "Ana Pérez",
  origin: "Santiago",
  destination: "Copiapó",
  shift: "Sin turno",
  start_date: "2026-01-01",
  end_date: null,
  baggage: "Mochila",
  active: true,
};

const trip: Trip = {
  id: "30d1ccdb-4c03-4124-b992-80a0648b888c",
  version: 7,
  person_id: person.id,
  date: "2026-11-10",
  planned_date: null,
  direction: "SUBIDA",
  origin: "Santiago",
  destination: "Copiapó",
  requested_time: "09:30:00",
  baggage: "Mochila",
  status: "Planificado",
  pnr: "",
  flight: "",
  amount: null,
  notes: "Confirmar horario",
};

async function roundtrip(current: Trip, changes: ExcelRow = {}) {
  const exported = { ...tripToExcelRow(current, person), ...changes };
  const workbook = await writeXlsxFile([
    TRIP_EXCEL_FIELDS.map((value) => ({ value })),
    // La descarga escribe los valores como texto para conservar IDs y fechas.
    TRIP_EXCEL_FIELDS.map((key) => ({ value: String(exported[key] ?? "") })),
  ], { buffer: true });
  const rows = await readXlsxFile(workbook);
  const imported = Object.fromEntries(
    rows[0].map((header, index) => [String(header), rows[1][index]]),
  );
  const result = buildExcelSyncPayload({ peopleRows: [], tripRows: [imported] });
  assert.deepEqual(result.errors, []);
  return {
    record: result.payload.trips[0],
    preview: buildPreviewLines(result.payload, [person], [current])[0],
  };
}

test("descargar y cargar un viaje manual o legado conserva fecha planificada nula sin conflictos", async () => {
  for (const planned_date of [null, undefined]) {
    const current = { ...trip, planned_date };
    const before = structuredClone(current);
    const result = await roundtrip(current);
    assert.equal(result.record.planned_date, null);
    assert.equal(result.preview.action, "unchanged");
    assert.deepEqual(current, before, "la revisión no debe modificar el registro actual");
  }
});

test("el roundtrip conserva la fecha planificada de viajes originales y reprogramados", async () => {
  for (const date of ["2026-11-10", "2026-11-12"]) {
    const result = await roundtrip({ ...trip, planned_date: "2026-11-10", date });
    assert.equal(result.record.planned_date, "2026-11-10");
    assert.equal(result.record.date, date);
    assert.equal(result.preview.action, "unchanged");
  }
});

test("editar fecha y reserva desde Excel conserva la identidad de viajes manuales y planificados", async () => {
  for (const planned_date of [null, "2026-11-10"]) {
    const result = await roundtrip({ ...trip, planned_date }, {
      fechaViaje: "2026-11-12",
      estado: "Emitido",
      pnr: "ABC123",
      montoClp: "84990",
      motivoCambio: "Vuelo confirmado para el jueves",
    });
    assert.equal(result.record.planned_date, planned_date);
    assert.equal(result.record.person_id, person.id);
    assert.equal(result.record.direction, "SUBIDA");
    assert.equal(result.record.date, "2026-11-12");
    assert.equal(result.record.amount, 84990);
    assert.equal(result.preview.action, "change");
  }
});

test("importar no permite rellenar, quitar ni cambiar una fecha planificada inmutable", async () => {
  for (const [planned_date, fechaPlanificada] of [
    [null, "2026-11-10"],
    ["2026-11-10", ""],
    ["2026-11-10", "2026-11-12"],
  ] as const) {
    const result = await roundtrip({ ...trip, planned_date }, {
      fechaPlanificada,
      motivoCambio: "Intento de cambiar la identidad",
    });
    assert.equal(result.preview.action, "conflict");
    assert.match(result.preview.detail, /fecha planificada.*no se pueden cambiar/);
  }
});

test("importar tampoco permite cambiar persona ni sentido aunque se indique un motivo", async () => {
  for (const changes of [
    { personaId: "0d6edc01-ac67-4ec5-b70b-97ef6e45c1d9" },
    { sentido: "Bajada" },
  ]) {
    const result = await roundtrip(trip, {
      ...changes,
      motivoCambio: "Intento de cambiar la identidad",
    });
    assert.equal(result.preview.action, "conflict");
    assert.match(result.preview.detail, /no se pueden cambiar desde Excel/);
  }
});

test("un viaje manual sigue exigiendo motivo cuando se modifica un campo editable", async () => {
  const result = await roundtrip(trip, { fechaViaje: "2026-11-12" });
  assert.equal(result.preview.action, "conflict");
  assert.match(result.preview.detail, /motivoCambio/);
});
