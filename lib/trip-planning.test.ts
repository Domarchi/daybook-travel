import test from "node:test";
import assert from "node:assert/strict";
import { missingPlannedMovements } from "./trip-planning.ts";

const persona = {
  id: "persona-1",
  shift: "4×3",
  start_date: "2026-11-02", // lunes
  up_weekday: 1,
  down_weekday: 4,
};
const hasta = "2026-11-12";
const ciclo = [
  { date: "2026-11-02", direction: "SUBIDA" },
  { date: "2026-11-05", direction: "BAJADA" },
  { date: "2026-11-09", direction: "SUBIDA" },
  { date: "2026-11-12", direction: "BAJADA" },
];

test("la primera planificación crea el ciclo y la segunda no lo repite", () => {
  const nuevos = missingPlannedMovements(persona, hasta, []);
  assert.deepEqual(nuevos, ciclo);

  const guardados = nuevos.map((paso) => ({
    ...paso,
    person_id: persona.id,
    planned_date: paso.date,
  }));
  assert.deepEqual(missingPlannedMovements(persona, hasta, guardados), []);
});

test("reprogramar una subida conserva su movimiento original al volver a planificar", () => {
  const reprogramado = {
    person_id: persona.id,
    planned_date: "2026-11-02",
    date: "2026-11-03",
    direction: "SUBIDA",
  };

  assert.deepEqual(
    missingPlannedMovements(persona, hasta, [reprogramado]),
    ciclo.slice(1),
  );
});

test("una reprogramación que coincide con otro ciclo reserva también la fecha actual", () => {
  const reprogramado = {
    person_id: persona.id,
    planned_date: "2026-11-02",
    date: "2026-11-09",
    direction: "SUBIDA",
  };

  assert.deepEqual(
    missingPlannedMovements(persona, hasta, [reprogramado]),
    [ciclo[1], ciclo[3]],
  );
});

test("un viaje manual sin fecha planificada ocupa su fecha actual", () => {
  for (const planned_date of [null, undefined]) {
    const manual = {
      person_id: persona.id,
      planned_date,
      date: "2026-11-05",
      direction: "BAJADA",
    };

    assert.deepEqual(
      missingPlannedMovements(persona, hasta, [manual]),
      [ciclo[0], ciclo[2], ciclo[3]],
    );
  }
});

test("los viajes de otra persona o de otro sentido no bloquean un movimiento", () => {
  const otros = [
    {
      person_id: "persona-2",
      planned_date: "2026-11-02",
      date: "2026-11-09",
      direction: "SUBIDA",
    },
    {
      person_id: persona.id,
      planned_date: "2026-11-02",
      date: "2026-11-09",
      direction: "BAJADA",
    },
  ];

  assert.deepEqual(missingPlannedMovements(persona, hasta, otros), ciclo);
});

test("un viaje anulado conserva su identidad y no reaparece al planificar", () => {
  const anulado = {
    person_id: persona.id,
    planned_date: "2026-11-02",
    date: "2026-11-09",
    direction: "SUBIDA",
    status: "Anulado",
  };

  assert.deepEqual(
    missingPlannedMovements(persona, hasta, [anulado]),
    [ciclo[1], ciclo[3]],
  );
});

test("el 10×10 también conserva una bajada reprogramada", () => {
  const personaDiez = { ...persona, shift: "10×10" };
  const reprogramado = {
    person_id: persona.id,
    planned_date: "2026-11-12",
    date: "2026-11-13",
    direction: "BAJADA",
  };

  assert.deepEqual(
    missingPlannedMovements(personaDiez, "2026-11-22", [reprogramado]),
    [
      { date: "2026-11-02", direction: "SUBIDA" },
      { date: "2026-11-22", direction: "SUBIDA" },
    ],
  );
});
