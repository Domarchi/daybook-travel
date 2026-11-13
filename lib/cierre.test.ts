import test from "node:test";
import assert from "node:assert/strict";
import { cambioDeCierre, mismoVuelo, problemaDeCierre } from "./cierre.ts";

const viaje = (extra: Partial<{ date: string; origin: string; destination: string; notes: string }> = {}) => ({
  date: extra.date ?? "2026-10-05",
  origin: extra.origin ?? "Santiago",
  destination: extra.destination ?? "Copiapó",
  notes: extra.notes ?? "",
});

test("una reserva es un vuelo: mismo día y misma ruta", () => {
  assert.equal(mismoVuelo([viaje(), viaje(), viaje()]), true);
  // Mayúsculas y espacios no cuentan como otra ruta.
  assert.equal(mismoVuelo([viaje(), viaje({ origin: " santiago " })]), true);
  assert.equal(mismoVuelo([viaje(), viaje({ date: "2026-10-06" })]), false);
  assert.equal(mismoVuelo([viaje(), viaje({ origin: "Concepción" })]), false);
  assert.equal(mismoVuelo([viaje(), viaje({ origin: "Copiapó", destination: "Santiago" })]), false);
  assert.equal(mismoVuelo([]), false);
});

test("anular pide motivo y nada más", () => {
  const varios = [viaje(), viaje({ date: "2026-10-08", origin: "Copiapó", destination: "Santiago" })];
  assert.match(problemaDeCierre(varios, "anular", "  ", "") ?? "", /motivo/);
  // El mismo mínimo que al editar un viaje: un punto no explica nada.
  assert.match(problemaDeCierre(varios, "anular", ".", "") ?? "", /al menos 5 letras/);
  assert.equal(problemaDeCierre(varios, "anular", "No viajó: dejó la obra", ""), null);
});

test("registrar una reserva pide motivo, código y el mismo vuelo", () => {
  assert.match(problemaDeCierre([viaje(), viaje()], "reserva", "Pasaje comprado por la agencia", " ") ?? "", /código/);
  assert.match(problemaDeCierre([viaje(), viaje({ date: "2026-10-06" })], "reserva", "Comprado", "ABC123") ?? "", /mismo día/);
  assert.equal(problemaDeCierre([viaje(), viaje()], "reserva", "Comprado", "ABC123"), null);
});

test("sin viajes no hay nada que cerrar", () => {
  assert.match(problemaDeCierre([], "anular", "x", "") ?? "", /Selecciona/);
});

test("anular deja el viaje Anulado y agrega el motivo a lo que ya decía", () => {
  assert.deepEqual(
    cambioDeCierre(viaje({ notes: "Importado desde la planilla." }), "anular", " No viajó ", ""),
    { status: "Anulado", notes: "Importado desde la planilla.\nMotivo del cambio: No viajó" },
  );
  // Sin notas previas, no queda una línea en blanco arriba.
  assert.equal(cambioDeCierre(viaje(), "anular", "No viajó", "").notes, "Motivo del cambio: No viajó");
});

test("registrar la reserva deja el viaje Completado, con el código en mayúsculas", () => {
  assert.deepEqual(cambioDeCierre(viaje(), "reserva", "Comprado por fuera", " yqjkym "), {
    status: "Completado",
    pnr: "YQJKYM",
    notes: "Motivo del cambio: Comprado por fuera",
  });
});

test("al cerrar, los motivos viejos no se repiten en las notas: quedan en el historial", () => {
  const acumuladas = viaje({ notes: "Importado.\nMotivo del cambio: Solicitud enviada." });
  assert.equal(
    cambioDeCierre(acumuladas, "anular", "No viajó", "").notes,
    "Importado.\nMotivo del cambio: No viajó",
  );
});

test("al registrar una reserva común se puede poner el monto por pasajero", () => {
  assert.deepEqual(cambioDeCierre(viaje(), "reserva", "Comprado por fuera", "abc123", "85990"), {
    status: "Completado",
    pnr: "ABC123",
    notes: "Motivo del cambio: Comprado por fuera",
    amount: 85990,
  });
  // Sin monto, el viaje conserva el que tenía: no se pisa con vacío.
  assert.equal("amount" in cambioDeCierre(viaje(), "reserva", "Comprado por fuera", "abc123", ""), false);
  assert.match(problemaDeCierre([viaje(), viaje()], "reserva", "Comprado por fuera", "ABC123", "caro") ?? "", /monto/);
  assert.equal(problemaDeCierre([viaje(), viaje()], "reserva", "Comprado por fuera", "ABC123", "0"), null);
});
