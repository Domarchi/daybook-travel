import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExcelSyncPayload,
  normalizeExcelPersonRow,
  normalizeExcelTripRow,
} from "./excel-sync.ts";

const personId = "d9c06cad-e6bf-47ba-8754-81f7cc68dd80";
const tripId = "30d1ccdb-4c03-4124-b992-80a0648b888c";

test("mapea los encabezados operativos a un payload normalizado", () => {
  const excelDate =
    (Date.UTC(2026, 8, 7) - Date.UTC(1899, 11, 30)) / 86_400_000;
  const result = buildExcelSyncPayload({
    peopleRows: [
      {
        row_number: 5,
        fccId: "",
        codigoPersona: " lb-001 ",
        nombreCompleto: "Ana Pérez",
        origen: "Santiago",
        destino: "Copiapó",
        turno: "4x3",
        fechaInicio: excelDate,
        fechaTermino: "",
        equipaje: "Maleta cabina",
        activa: "Sí",
      },
    ],
    tripRows: [
      {
        row_number: 8,
        codigoPersona: "lb-001",
        fechaPlanificada: "07/09/2026",
        fechaViaje: "2026-09-07",
        sentido: "Subida",
        origen: "Santiago",
        destino: "Copiapó",
        horaRequerida: 0.5,
        equipaje: "Maleta en bodega",
        estado: "Emitido",
        pnr: "ABC123",
        vuelo: "LA 112",
        montoClp: "$ 84.990",
        observaciones: "Ventana",
      },
    ],
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.payload.people[0], {
    row_number: 5,
    id: null,
    version: null,
    employee_code: "LB-001",
    name: "Ana Pérez",
    origin: "Santiago",
    destination: "Copiapó",
    shift: "4×3",
    start_date: "2026-09-07",
    end_date: null,
    baggage: "Maleta de cabina",
    active: true,
  });
  assert.deepEqual(result.payload.trips[0], {
    row_number: 8,
    id: null,
    version: null,
    person_id: null,
    person_employee_code: "LB-001",
    date: "2026-09-07",
    planned_date: "2026-09-07",
    direction: "SUBIDA",
    origin: "Santiago",
    destination: "Copiapó",
    requested_time: "12:00",
    baggage: "Maleta en bodega",
    status: "Emitido",
    pnr: "ABC123",
    flight: "LA 112",
    amount: 84990,
    notes: "Ventana",
    change_reason: "",
  });
});

test("acepta encabezados legibles y conserva IDs y versiones", () => {
  const person = normalizeExcelPersonRow(
    {
      "ID FCC": personId,
      Versión: 3,
      "Código trabajador": "emp-17",
      "Nombre completo": "Beatriz Soto",
      Origen: "Concepción",
      Destino: "Copiapó",
      Turno: "10×10",
      "Fecha inicio": "2026-09-08",
      "Fecha término": "2026-12-31",
      Equipaje: "Mochila",
      Activo: "No",
    },
    14,
  );
  const trip = normalizeExcelTripRow(
    {
      "ID FCC": tripId,
      Versión: 7,
      "ID persona": personId,
      "Fecha viaje": "08-09-2026",
      "Fecha planificada": "08-09-2026",
      Movimiento: "BAJADA",
      Origen: "Copiapó",
      Destino: "Concepción",
      "Hora requerida": "17:30:00",
      Equipaje: "Por confirmar",
      Estado: "Solicitado",
      "Monto CLP": "1.234,50",
      "Motivo del cambio": "Cambio de hora",
    },
    19,
  );

  assert.equal(person.errors.length, 0);
  assert.equal(person.value?.id, personId);
  assert.equal(person.value?.version, 3);
  assert.equal(person.value?.employee_code, "EMP-17");
  assert.equal(person.value?.active, false);
  assert.equal(trip.errors.length, 0);
  assert.equal(trip.value?.person_id, personId);
  assert.equal(trip.value?.requested_time, "17:30");
  assert.equal(trip.value?.amount, 1234.5);
});

test("mantiene el número real de fila y omite filas vacías", () => {
  const result = buildExcelSyncPayload({
    peopleRows: [
      { row_number: 11 },
      {
        row_number: 23,
        nombreCompleto: "Camila Díaz",
        origen: "Santiago",
        destino: "Copiapó",
        turno: "10x10",
        fechaInicio: "2026-09-08",
        equipaje: "Mochila",
        activa: true,
      },
    ],
    tripRows: [],
  });

  assert.equal(result.payload.people.length, 1);
  assert.equal(result.payload.people[0].row_number, 23);
});

test("conserva un turno desconocido como Por confirmar", () => {
  const result = normalizeExcelPersonRow(
    {
      codigoPersona: "LB-099",
      nombreCompleto: "Carolina Vera",
      origen: "Concepción",
      destino: "Copiapó",
      turno: "",
      fechaInicio: "2026-09-08",
      equipaje: "",
      activa: "Sí",
    },
    27,
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.value?.shift, "Por confirmar");
  assert.equal(result.value?.baggage, "Por confirmar");
});

test("acepta Sin turno y sus alias para viajes manuales", () => {
  for (const turno of ["Sin turno", "sin rotación", "manual"]) {
    const result = normalizeExcelPersonRow(
      {
        nombreCompleto: "Jefatura de proyecto",
        origen: "Santiago",
        destino: "Copiapó",
        turno,
        fechaInicio: "2026-09-08",
        equipaje: "Maleta de cabina",
        activa: "Sí",
      },
      28,
    );

    assert.deepEqual(result.errors, []);
    assert.equal(result.value?.shift, "Sin turno");
  }
});

test("rechaza fechas imposibles y un inicio 4x3 que no sea lunes", () => {
  const result = normalizeExcelPersonRow(
    {
      nombreCompleto: "Diego Rojas",
      origen: "Santiago",
      destino: "Copiapó",
      turno: "4×3",
      fechaInicio: "2026-09-08",
      fechaTermino: "2026-02-30",
      equipaje: "Mochila",
      activa: true,
    },
    6,
  );

  assert.equal(result.value, null);
  assert.deepEqual(
    result.errors.map((error) => error.field).sort(),
    ["fechaInicio", "fechaTermino"],
  );
});

test("exige versión para registros existentes y PNR en estados emitidos", () => {
  const person = normalizeExcelPersonRow(
    {
      fccId: personId,
      nombreCompleto: "Elena Torres",
      origen: "Santiago",
      destino: "Copiapó",
      turno: "10x10",
      fechaInicio: "2026-09-08",
      equipaje: "Mochila",
    },
    9,
  );
  const trip = normalizeExcelTripRow(
    {
      fccId: tripId,
      version: 2,
      personaId: personId,
      fechaViaje: "2026-09-08",
      fechaPlanificada: "2026-09-08",
      sentido: "Subida",
      origen: "Santiago",
      destino: "Copiapó",
      equipaje: "Mochila",
      estado: "Completado",
      pnr: "",
    },
    10,
  );

  assert(person.errors.some((error) => error.field === "version"));
  assert(trip.errors.some((error) => error.field === "pnr"));
});
