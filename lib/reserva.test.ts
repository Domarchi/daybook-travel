import test from "node:test";
import assert from "node:assert/strict";
import { cambioDeReserva, esReservable, problemaDeReserva } from "./reserva.ts";

const vuelo = (date = "2026-11-23", origin = "Santiago", destination = "Copiapó") => ({ date, origin, destination });

test("solo los solicitados sin código se pueden marcar", () => {
  assert.equal(esReservable({ status: "Solicitado", pnr: "" }), true);
  assert.equal(esReservable({ status: "Solicitado", pnr: "  " }), true);
  assert.equal(esReservable({ status: "Solicitado", pnr: "ABC123" }), false);
  assert.equal(esReservable({ status: "Planificado", pnr: "" }), false);
  assert.equal(esReservable({ status: "Emitido", pnr: "ABC123" }), false);
});

test("un código es un vuelo: mismo día y misma ruta", () => {
  assert.equal(problemaDeReserva([vuelo(), vuelo("2026-11-23", "santiago ", "COPIAPÓ")], "abc123"), null);
  assert.match(problemaDeReserva([vuelo(), vuelo("2026-11-24")], "abc123")!, /mismo día/);
  assert.match(problemaDeReserva([vuelo(), vuelo("2026-11-23", "Copiapó", "Santiago")], "abc123")!, /misma ruta/);
});

test("pide el código, y el monto solo si se escribió", () => {
  assert.match(problemaDeReserva([], "abc123")!, /Selecciona/);
  assert.match(problemaDeReserva([vuelo()], "  ")!, /código/);
  assert.equal(problemaDeReserva([vuelo()], "abc123", ""), null);
  assert.equal(problemaDeReserva([vuelo()], "abc123", "85000"), null);
  assert.match(problemaDeReserva([vuelo()], "abc123", "-1")!, /monto/);
  assert.match(problemaDeReserva([vuelo()], "abc123", "mucho")!, /monto/);
});

test("deja el viaje Emitido, con el código y el motivo, sin tocar lo que no se escribió", () => {
  const notas = "Prefiere pasillo.\nMotivo del cambio: Solicitud enviada.";
  assert.deepEqual(cambioDeReserva({ notes: notas }, { pnr: " djvhqq " }), {
    status: "Emitido",
    pnr: "DJVHQQ",
    notes: "Prefiere pasillo.\nMotivo del cambio: Reserva DJVHQQ confirmada por la agencia.",
  });
  assert.deepEqual(cambioDeReserva({ notes: "" }, { pnr: "DJVHQQ", vuelo: "la 342", monto: "85000" }), {
    status: "Emitido",
    pnr: "DJVHQQ",
    flight: "LA 342",
    amount: 85000,
    notes: "Motivo del cambio: Reserva DJVHQQ confirmada por la agencia.",
  });
});
