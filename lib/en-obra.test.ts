import test from "node:test";
import assert from "node:assert/strict";
import { enObra } from "./en-obra.ts";

const mov = (person_id: string, date: string, direction: "SUBIDA" | "BAJADA", status = "Emitido") => ({
  person_id, date, direction, status,
});

// Un 4×3: sube el lunes 9, baja el jueves 12, vuelve el lunes 16.
const TURNO = [mov("p1", "2026-11-09", "SUBIDA"), mov("p1", "2026-11-12", "BAJADA"), mov("p1", "2026-11-16", "SUBIDA")];
const estado = (dia: string, viajes = TURNO) => enObra(viajes, dia).find((e) => e.person_id === "p1")?.estado ?? null;

test("entre la subida y la bajada está en obra; el día de cada una se dice", () => {
  assert.equal(estado("2026-11-09"), "sube");
  assert.equal(estado("2026-11-10"), "en obra");
  assert.equal(estado("2026-11-12"), "baja");
  assert.equal(estado("2026-11-13"), null, "en su descanso no está");
  assert.equal(estado("2026-11-16"), "sube");
  assert.equal(estado("2026-11-20"), "en obra", "después de la última subida sigue en obra");
});

test("antes de su primer viaje no está, salvo que lo primero sea una bajada", () => {
  assert.equal(estado("2026-11-01"), null);
  const desdeAntes = [mov("p1", "2026-11-05", "BAJADA")];
  assert.equal(estado("2026-11-03", desdeAntes), "en obra", "los datos empiezan a mitad de turno");
  assert.equal(estado("2026-11-06", desdeAntes), null);
});

test("lo anulado y lo no presentado no cuentan", () => {
  const conAnulada = [mov("p1", "2026-11-09", "SUBIDA"), mov("p1", "2026-11-12", "BAJADA", "Anulado")];
  assert.equal(estado("2026-11-13", conAnulada), "en obra", "si la bajada se anuló, sigue en obra");
  const noSePresento = [mov("p1", "2026-11-09", "SUBIDA", "No presentado")];
  assert.equal(estado("2026-11-10", noSePresento), null);
});

test("cuenta a cada persona una vez", () => {
  const varios = [...TURNO, mov("p2", "2026-11-08", "SUBIDA"), mov("p3", "2026-11-12", "BAJADA")];
  const dia = enObra(varios, "2026-11-10");
  assert.deepEqual(dia.map((e) => e.person_id).sort(), ["p1", "p2", "p3"]);
});
