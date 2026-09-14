import test from "node:test";
import assert from "node:assert/strict";
import { movimientosParaEntrega, pendientesDelMovimiento } from "./agenda.ts";

const viaje = (date: string, status = "Planificado", requested_time: string | null = null) =>
  ({ date, status, requested_time, pnr: "", baggage: "Mochila" });

test("la entrega abarca hoy y mañana al cruzar un mes y excluye movimientos cerrados", () => {
  const rows = movimientosParaEntrega([
    viaje("2026-10-01"), viaje("2026-09-29"), viaje("2026-10-02"),
    viaje("2026-09-30", "Solicitado", "09:00"),
    viaje("2026-09-30", "Emitido", "08:00"),
    viaje("2026-09-30", "Anulado"), viaje("2026-10-01", "Completado"),
    viaje("2026-10-01", "No presentado"),
  ], "2026-09-30");
  assert.deepEqual(rows.map((row) => [row.date, row.requested_time]), [
    ["2026-09-30", "08:00"], ["2026-09-30", "09:00"], ["2026-10-01", null],
  ]);
});

test("una reserva registrada no oculta la hora o el equipaje por confirmar", () => {
  assert.deepEqual(pendientesDelMovimiento({ ...viaje("2026-09-14", "Emitido"), pnr: "ABC123", baggage: "Por confirmar" }), ["Hora por confirmar", "Equipaje por confirmar"]);
  assert.deepEqual(pendientesDelMovimiento({ ...viaje("2026-09-14", "Emitido", "08:30"), pnr: "ABC123" }), []);
  assert.deepEqual(pendientesDelMovimiento(viaje("2026-09-14", "Solicitado", "09:00")), ["Confirmación de agencia pendiente"]);
});
