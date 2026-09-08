import test from "node:test";
import assert from "node:assert/strict";
import {
  formatDate,
  formatDateTime,
  localDate,
  nextWeekday,
  normalize,
  statusClass,
} from "./format.ts";
import { TRIP_STATUSES } from "./types.ts";

test("statusClass produce las clases que colorean globals.css", () => {
  assert.deepEqual(
    TRIP_STATUSES.map(statusClass),
    [
      "status-planificado",
      "status-solicitado",
      "status-emitido",
      "status-completado",
      "status-anulado",
      "status-no-presentado",
    ],
  );
});

test("normalize quita tildes, baja a minúscula y recorta", () => {
  assert.equal(normalize("  Concepción  "), "concepcion");
  assert.equal(normalize("Copiapó"), "copiapo");
  assert.equal(normalize("  Maleta EN Bodega "), "maleta en bodega");
  assert.equal(normalize("No presentado"), "no presentado");
  // conserva los separadores: es lo que la distingue de `normalizeName` del importador
  assert.equal(normalize("LB-001"), "lb-001");
});

test("formatDate lee la fecha en UTC y no se corre de día", () => {
  assert.equal(formatDate("2026-09-07"), "7 sept 2026");
  assert.equal(formatDate("2026-01-01"), "1 ene 2026");
  assert.equal(formatDate("2026-12-31"), "31 dic 2026");
  // el cambio de hora de Chile no debe mover la fecha mostrada
  assert.equal(formatDate("2026-04-05"), "5 abr 2026");
  assert.equal(formatDate("2026-09-06"), "6 sept 2026");
});

test("formatDateTime muestra fecha y hora del historial", () => {
  const salida = formatDateTime("2026-09-07T15:30:00Z");
  assert.match(salida, /2026/);
  assert.match(salida, /\d{2}:\d{2}/);
});

test("nextWeekday encuentra el lunes del turno 4×3", () => {
  // 2026-09-07 es lunes: se queda donde está
  assert.equal(nextWeekday("2026-09-07", 1), "2026-09-07");
  assert.equal(nextWeekday("2026-09-08", 1), "2026-09-14");
  assert.equal(nextWeekday("2026-09-13", 1), "2026-09-14");
  // jueves, el día de bajada
  assert.equal(nextWeekday("2026-09-07", 4), "2026-09-10");
});

test("localDate entrega el día de Santiago en formato AAAA-MM-DD", () => {
  const hoy = localDate();
  assert.match(hoy, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(
    hoy,
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(
      new Date(),
    ),
  );
});
