import test from "node:test";
import assert from "node:assert/strict";
import { ENCABEZADOS_CSV, celdaCsv, csvDeCostos, csvDeViajes } from "./trips-csv.ts";
import type { Trip } from "./types.ts";

const viaje = (extra: Partial<Trip> = {}): Trip => ({
  id: "t1", person_id: "p1", date: "2026-09-14", direction: "SUBIDA", origin: "Santiago",
  destination: "Copiapó", requested_time: "08:30", baggage: "Mochila", status: "Planificado",
  pnr: "", flight: "", amount: null, notes: "", ...extra,
});

test("una celda que empieza como fórmula queda como texto", () => {
  for (const peligrosa of ["=1+1", "+cmd", "-2", "@SUM(A1)"]) {
    assert.equal(celdaCsv(peligrosa), `"'${peligrosa}"`, peligrosa);
  }
  assert.equal(celdaCsv("Ana = Luis"), '"Ana = Luis"', "solo importa el primer carácter");
});

test("las comillas se duplican y lo vacío queda vacío", () => {
  assert.equal(celdaCsv('dijo "hola"'), '"dijo ""hola"""');
  assert.equal(celdaCsv(null), '""');
  assert.equal(celdaCsv(undefined), '""');
  assert.equal(celdaCsv(84990), '"84990"');
});

test("el CSV lleva BOM, separador punto y coma y una fila por viaje", () => {
  const csv = csvDeViajes([viaje(), viaje({ id: "t2", date: "2026-09-15", direction: "BAJADA" })], (id) => `Persona ${id}`);
  assert.ok(csv.startsWith("﻿"), "el BOM va primero");
  const filas = csv.slice(1).split("\r\n");
  assert.equal(filas.length, 3);
  assert.equal(filas[0], ENCABEZADOS_CSV.map((h) => `"${h}"`).join(";"));
  assert.equal(filas[1].split(";")[0], '"Persona p1"');
  assert.equal(filas[1].split(";").length, ENCABEZADOS_CSV.length);
});

test("la columna de acreditación solo aparece si se pide", () => {
  const sin = csvDeViajes([viaje()], () => "Ana").slice(1).split("\r\n");
  const con = csvDeViajes([viaje()], () => "Ana", () => "Examen médico: sin registrar").slice(1).split("\r\n");
  assert.equal(sin[0].split(";").length, ENCABEZADOS_CSV.length);
  assert.equal(con[0].split(";").at(-1), '"Acreditación"');
  assert.equal(con[1].split(";").at(-1), '"Examen médico: sin registrar"');
});

test("un nombre que empieza como fórmula no llega al libro como fórmula", () => {
  const csv = csvDeViajes([viaje()], () => "=HYPERLINK(\"x\")");
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
});

test("el CSV de costos va por fecha, con el monto como número y vacío si falta", () => {
  const csv = csvDeCostos(
    [
      viaje({ id: "b", date: "2026-11-09", pnr: "BBB222", amount: null, status: "Emitido", flight: "LA 112" }),
      viaje({ id: "a", date: "2026-11-02", pnr: "=HYPERLINK(1)", amount: 85990, status: "Emitido", flight: "LA 112" }),
    ],
    () => "MARÍA SOTO",
  );
  assert.ok(csv.startsWith("\uFEFF"), "con BOM, para que Excel lea las tildes");
  const filas = csv.slice(1).split("\r\n");
  assert.equal(filas[0], '"Fecha";"Persona";"Sentido";"Origen";"Destino";"Estado";"Reserva";"Vuelo";"Monto CLP"');
  assert.equal(filas[1].split(";")[0], '"2026-11-02"', "va por fecha");
  assert.ok(filas[1].includes(`"'=HYPERLINK(1)"`), "la reserva que parece fórmula queda como texto");
  assert.ok(filas[1].endsWith('"85990"'), "el monto es un número sin formato");
  assert.ok(filas[2].endsWith(';""'), "sin monto, la celda queda vacía");
});
