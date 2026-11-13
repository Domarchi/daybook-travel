import test from "node:test";
import assert from "node:assert/strict";
import { textoDeRevision, viajesARevisar } from "./revision.ts";

const HOY = "2026-11-13"; // viernes

let n = 0;
const viaje = (
  date: string,
  direction: "SUBIDA" | "BAJADA",
  status = "Planificado",
  person_id = "p1",
) => ({ id: `v${++n}`, person_id, date, direction, status });

// Un 4×3 de lunes a jueves, como el de la obra.
const persona = (extra: Record<string, unknown> = {}) => ({
  id: "p1",
  active: true,
  shift: "4×3",
  start_date: "2026-09-07",
  end_date: null,
  up_weekday: 1,
  down_weekday: 4,
  ...extra,
});

const revisar = (viajes: ReturnType<typeof viaje>[], personas = [persona()]) =>
  viajesARevisar(viajes, personas, HOY);

test("un turno bien registrado no tiene nada que revisar", () => {
  const viajes = [
    viaje("2026-11-09", "SUBIDA", "Completado"),
    viaje("2026-11-12", "BAJADA", "Completado"),
    viaje("2026-11-16", "SUBIDA"),
    viaje("2026-11-19", "BAJADA"),
  ];
  assert.equal(revisar(viajes).size, 0);
});

test("dos viajes iguales el mismo día se marcan los dos, una sola vez", () => {
  const a = viaje("2026-11-16", "SUBIDA");
  const b = viaje("2026-11-16", "SUBIDA", "Solicitado");
  const resultado = revisar([viaje("2026-11-12", "BAJADA"), a, b, viaje("2026-11-19", "BAJADA")]);
  assert.deepEqual(resultado.get(a.id), ["repetido"]);
  assert.deepEqual(resultado.get(b.id), ["repetido"], "el repetido no se cuenta además como secuencia");
  assert.equal(resultado.size, 2);
});

test("dos subidas seguidas: se marca la segunda, y lo pasado sirve de contexto", () => {
  // Subió el lunes 9 y nadie registró la bajada del jueves 12.
  const segunda = viaje("2026-11-16", "SUBIDA");
  const resultado = revisar([viaje("2026-11-09", "SUBIDA", "Completado"), segunda, viaje("2026-11-19", "BAJADA")]);
  assert.deepEqual(resultado.get(segunda.id), ["secuencia"]);
  assert.equal(resultado.size, 1);
});

test("dos bajadas seguidas también", () => {
  const segunda = viaje("2026-11-19", "BAJADA");
  const resultado = revisar([viaje("2026-11-16", "SUBIDA"), viaje("2026-11-17", "BAJADA", "Emitido"), segunda]);
  // La del 17 no calza con el turno, pero tiene reserva: no se mira.
  assert.deepEqual([...resultado.entries()], [[segunda.id, ["secuencia"]]]);
});

test("lo primero de alguien puede ser una bajada: los datos empiezan a mitad de turno", () => {
  assert.equal(revisar([viaje("2026-11-19", "BAJADA"), viaje("2026-11-23", "SUBIDA")]).size, 0);
});

test("lo anulado y lo no presentado no cuentan para la secuencia", () => {
  const viajes = [
    viaje("2026-11-09", "SUBIDA", "Completado"),
    viaje("2026-11-12", "BAJADA", "No presentado"),
    viaje("2026-11-12", "BAJADA", "Anulado"),
    viaje("2026-11-16", "SUBIDA"),
  ];
  // Para lo registrado, sigue arriba desde el 9: subir el 16 no cuadra.
  assert.deepEqual([...revisar(viajes).values()], [["secuencia"]]);
  // Y un viaje anulado nunca se marca.
  const anulado = viaje("2026-11-16", "SUBIDA", "Anulado");
  assert.equal(revisar([viaje("2026-11-12", "BAJADA"), anulado]).has(anulado.id), false);
});

test("lo pasado no se marca, aunque esté mal", () => {
  const viajes = [viaje("2026-11-02", "SUBIDA", "Completado"), viaje("2026-11-09", "SUBIDA", "Completado")];
  assert.equal(revisar(viajes).size, 0);
});

test("un planificado que ya no calza con el turno se marca", () => {
  // Le cambiaron la subida del lunes al martes; los viajes generados antes quedaron.
  const viejos = [viaje("2026-11-16", "SUBIDA"), viaje("2026-11-19", "BAJADA")];
  const resultado = revisar(viejos, [persona({ up_weekday: 2 })]);
  assert.deepEqual(resultado.get(viejos[0].id), ["fuera_de_turno"]);
  assert.equal(resultado.has(viejos[1].id), false, "la bajada del jueves sigue calzando");
});

test("solo los planificados se comparan con el turno", () => {
  const viajes = [viaje("2026-11-17", "SUBIDA", "Solicitado"), viaje("2026-11-19", "BAJADA", "Emitido")];
  assert.equal(revisar(viajes).size, 0);
});

test("un 10×10 que empezó hace años se compara igual", () => {
  // Desde el 2 de enero de 2023, una subida cada 20 días: el 2-nov-2026 sube y el 12 baja.
  const diez = persona({ shift: "10×10", start_date: "2023-01-02", up_weekday: null, down_weekday: null });
  const bien = viaje("2026-11-22", "SUBIDA");
  const mal = viaje("2026-12-01", "BAJADA");
  const resultado = revisar([viaje("2026-11-12", "BAJADA", "Completado"), bien, mal], [diez]);
  assert.equal(resultado.has(bien.id), false);
  assert.deepEqual(resultado.get(mal.id), ["fuera_de_turno"]);
});

test("sin turno rotativo, inactiva o con días imposibles no se compara con el turno", () => {
  const viajes = [viaje("2026-11-17", "SUBIDA")];
  assert.equal(revisar(viajes, [persona({ shift: "Sin turno" })]).size, 0);
  assert.equal(revisar(viajes, [persona({ shift: "Por confirmar" })]).size, 0);
  assert.equal(revisar(viajes, [persona({ active: false })]).size, 0);
  assert.equal(revisar(viajes, [persona({ up_weekday: 4, down_weekday: 4 })]).size, 0);
});

test("un viaje después del fin de vigencia no calza con el turno", () => {
  const tarde = viaje("2026-11-23", "SUBIDA");
  const resultado = revisar([viaje("2026-11-19", "BAJADA"), tarde], [persona({ end_date: "2026-11-20" })]);
  assert.deepEqual(resultado.get(tarde.id), ["fuera_de_turno"]);
});

test("los avisos se leen según el sentido", () => {
  assert.equal(textoDeRevision("secuencia", "SUBIDA"), "Sube sin haber bajado");
  assert.equal(textoDeRevision("secuencia", "BAJADA"), "Baja sin haber subido");
  assert.equal(textoDeRevision("repetido", "SUBIDA"), "Repetido: hay otro igual ese día");
  assert.equal(textoDeRevision("fuera_de_turno", "BAJADA"), "No calza con su turno");
});
