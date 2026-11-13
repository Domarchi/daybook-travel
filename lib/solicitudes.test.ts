import test from "node:test";
import assert from "node:assert/strict";
import { diasEsperando, textoDeEspera, ESPERA_LARGA } from "./solicitudes.ts";

const HOY = "2026-11-12";
const viaje = (extra: Record<string, string | undefined> = {}) => ({
  status: "Solicitado",
  pnr: "",
  updated_at: "2026-11-07T15:00:00Z",
  ...extra,
});

test("una solicitud sin reserva cuenta los días desde que se pidió", () => {
  assert.equal(diasEsperando(viaje(), HOY), 5);
  assert.equal(textoDeEspera(5), "hace 5 días");
  assert.ok(5 >= ESPERA_LARGA, "cinco días ya es una espera larga");
});

test("hoy y ayer se dicen con palabras", () => {
  assert.equal(diasEsperando(viaje({ updated_at: "2026-11-12T13:00:00Z" }), HOY), 0);
  assert.equal(textoDeEspera(0), "hoy");
  assert.equal(diasEsperando(viaje({ updated_at: "2026-11-11T13:00:00Z" }), HOY), 1);
  assert.equal(textoDeEspera(1), "ayer");
});

test("el día es el de Santiago: lo pedido a las 22:00 en Chile es de ese día", () => {
  // 01:00 UTC del 12 es 22:00 del 11 en Chile.
  assert.equal(diasEsperando(viaje({ updated_at: "2026-11-12T01:00:00Z" }), HOY), 1);
});

test("con reserva, en otro estado o sin fecha, no está esperando", () => {
  assert.equal(diasEsperando(viaje({ pnr: "ABC123" }), HOY), null);
  assert.equal(diasEsperando(viaje({ status: "Planificado" }), HOY), null);
  assert.equal(diasEsperando(viaje({ updated_at: undefined }), HOY), null);
});
