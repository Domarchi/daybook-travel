import test from "node:test";
import assert from "node:assert/strict";
import { notasConMotivo, observacionesDe, ultimoMotivo } from "./notas.ts";

// Así quedaban las notas de un viaje editado varias veces.
const ACUMULADAS = [
  "Importado desde la planilla.",
  "Motivo del cambio: Solicitud enviada.",
  "Prefiere vuelo de la tarde.",
  "Motivo del cambio: Pasaje emitido",
].join("\n");

test("las observaciones son todo lo que no es motivo", () => {
  assert.equal(observacionesDe(ACUMULADAS), "Importado desde la planilla.\nPrefiere vuelo de la tarde.");
  assert.equal(observacionesDe(""), "");
  assert.equal(observacionesDe(null), "");
});

test("el último motivo es el de abajo", () => {
  assert.equal(ultimoMotivo(ACUMULADAS), "Pasaje emitido");
  assert.equal(ultimoMotivo("Sin motivos aquí"), "");
});

test("al editar se guardan las observaciones y solo el motivo nuevo", () => {
  assert.equal(
    notasConMotivo(ACUMULADAS, "Cambio de hora"),
    "Importado desde la planilla.\nPrefiere vuelo de la tarde.\nMotivo del cambio: Cambio de hora",
  );
  // Sin observaciones no queda una línea en blanco arriba.
  assert.equal(notasConMotivo("", "No viajó"), "Motivo del cambio: No viajó");
});

test("un motivo con saltos de línea queda en una sola línea", () => {
  // Si no, la segunda línea se leería después como observación.
  const notas = notasConMotivo("", "Cambio de turno\npor licencia");
  assert.equal(notas, "Motivo del cambio: Cambio de turno por licencia");
  assert.equal(observacionesDe(notas), "");
});
