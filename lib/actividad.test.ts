import test from "node:test";
import assert from "node:assert/strict";
import { agruparPorDia, describir, diaDe, nombreDelDia } from "./actividad.ts";
import type { HistoryItem } from "./types.ts";

const mapas = {
  trips: new Map([["v1", { id: "v1", person_id: "p1", date: "2026-11-16", direction: "SUBIDA" }]]),
  people: new Map([["p1", { id: "p1", name: "MARÍA SOTO" }]]),
  tiposDeDocumento: new Map([["t1", "Examen médico"]]),
};

const viaje = (extra: Record<string, unknown> = {}) => ({
  id: "v1", person_id: "p1", date: "2026-11-16", direction: "SUBIDA", origin: "Santiago",
  destination: "Copiapó", status: "Planificado", pnr: "", notes: "", ...extra,
});

const entrada = (extra: Partial<HistoryItem>): HistoryItem => ({
  id: 1, action: "UPDATE", created_at: "2026-11-12T13:00:00Z", actor: null, after_data: {}, ...extra,
});

test("un viaje dice de quién es, de qué día y en qué sentido, y qué cambió", () => {
  const e = describir(entrada({
    entity: "trips", record_id: "v1",
    before_data: viaje(),
    after_data: viaje({ status: "Emitido", pnr: "ABC123", notes: "Motivo del cambio: Pasaje emitido" }),
  }), mapas);
  assert.equal(e.titulo, "Viaje actualizado");
  assert.equal(e.sujeto, "MARÍA SOTO · 16 nov 2026 · Subida");
  assert.deepEqual(e.cambios.map((c) => c.campo), ["Estado", "Reserva"]);
  assert.equal(e.nota, "Motivo del cambio: Pasaje emitido");
  assert.deepEqual(e.abre, { tipo: "viaje", id: "v1" });
});

test("un viaje que ya no está en la lista se describe igual, pero no se puede abrir", () => {
  const e = describir(entrada({ entity: "trips", record_id: "otro", action: "INSERT", after_data: viaje({ id: "otro" }) }), mapas);
  assert.equal(e.titulo, "Viaje creado");
  assert.equal(e.abre, null);
});

test("una persona y un documento llevan a la ficha de la persona", () => {
  const persona = describir(entrada({
    entity: "people", record_id: "p1",
    before_data: { name: "MARÍA SOTO", active: true }, after_data: { name: "MARÍA SOTO", active: false },
  }), mapas);
  assert.equal(persona.titulo, "Persona actualizada");
  assert.equal(persona.sujeto, "MARÍA SOTO");
  assert.deepEqual(persona.cambios, [{ campo: "Estado", antes: "Activa", despues: "Inactiva" }]);
  assert.deepEqual(persona.abre, { tipo: "persona", id: "p1" });

  const documento = describir(entrada({
    entity: "person_documents", record_id: "d1", action: "INSERT",
    after_data: { person_id: "p1", type_id: "t1", expires_on: "2027-03-01" },
  }), mapas);
  assert.equal(documento.titulo, "Examen médico: registrado");
  assert.equal(documento.sujeto, "MARÍA SOTO");
  assert.deepEqual(documento.cambios, [{ campo: "Vencimiento", antes: "—", despues: "1 mar 2027" }]);
  assert.deepEqual(documento.abre, { tipo: "persona", id: "p1" });
});

test("el día es el de Santiago, no el de UTC", () => {
  // 02:30 UTC del 13 es 23:30 del 12 en Chile (horario de verano, UTC-3).
  assert.equal(diaDe("2026-11-13T02:30:00Z"), "2026-11-12");
});

test("los días se titulan Hoy, Ayer o con su fecha, y se agrupan en orden", () => {
  assert.equal(nombreDelDia("2026-11-12", "2026-11-12"), "Hoy");
  assert.equal(nombreDelDia("2026-11-11", "2026-11-12"), "Ayer");
  assert.equal(nombreDelDia("2026-11-01", "2026-11-12"), "1 nov 2026");
  const grupos = agruparPorDia(
    [
      { created_at: "2026-11-12T15:00:00Z" },
      { created_at: "2026-11-12T12:00:00Z" },
      { created_at: "2026-11-11T12:00:00Z" },
    ],
    "2026-11-12",
  );
  assert.deepEqual(grupos.map((g) => [g.nombre, g.items.length]), [["Hoy", 2], ["Ayer", 1]]);
});
