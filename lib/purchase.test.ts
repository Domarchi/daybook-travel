import test from "node:test";
import assert from "node:assert/strict";
import {
  estadoDeCompra,
  diasParaVolar,
  resumenDeCompra,
  ventanaValida,
  VENTANA_POR_OMISION,
} from "./purchase.ts";

const HOY = "2026-09-10";

const viaje = (extra: { date: string; status?: string; pnr?: string }) => ({
  date: extra.date,
  status: extra.status ?? "Planificado",
  pnr: extra.pnr ?? "",
});

// ---------------------------------------------------------------------------
// La regla básica: qué está resuelto y qué no.
// ---------------------------------------------------------------------------

test("un viaje con código de reserva está resuelto, sin importar la fecha", () => {
  assert.equal(
    estadoDeCompra(viaje({ date: "2026-09-11", pnr: "ABC123" }), HOY),
    "resuelto",
  );
  assert.equal(
    estadoDeCompra(
      viaje({ date: "2026-09-11", status: "Emitido", pnr: "ABC123" }),
      HOY,
    ),
    "resuelto",
  );
});

test("solicitado sin código sigue pendiente", () => {
  // Es la decisión de la obra: hasta que no hay PNR, nadie tiene asiento.
  assert.equal(
    estadoDeCompra(viaje({ date: "2026-09-15", status: "Solicitado" }), HOY),
    "urgente",
  );
  assert.equal(
    estadoDeCompra(viaje({ date: "2026-12-15", status: "Solicitado" }), HOY),
    "proximo",
  );
});

test("un viaje anulado queda cerrado y no molesta más", () => {
  assert.equal(
    estadoDeCompra(viaje({ date: "2026-09-11", status: "Anulado" }), HOY),
    "cerrado",
  );
  assert.equal(
    estadoDeCompra(viaje({ date: "2026-01-01", status: "Anulado" }), HOY),
    "cerrado",
  );
});

// ---------------------------------------------------------------------------
// Los bordes de la ventana. Es donde un error de un día se paga con un pasaje
// comprado tarde, así que están escritos uno por uno.
// ---------------------------------------------------------------------------

test("el borde exacto de la ventana entra como urgente", () => {
  assert.equal(estadoDeCompra(viaje({ date: "2026-10-01" }), HOY, 21), "urgente");
  assert.equal(diasParaVolar("2026-10-01", HOY), 21);
});

test("un día más allá de la ventana todavía no es urgente", () => {
  assert.equal(estadoDeCompra(viaje({ date: "2026-10-02" }), HOY, 21), "proximo");
  assert.equal(diasParaVolar("2026-10-02", HOY), 22);
});

test("el vuelo de hoy es urgente, no vencido", () => {
  assert.equal(estadoDeCompra(viaje({ date: HOY }), HOY, 21), "urgente");
  assert.equal(diasParaVolar(HOY, HOY), 0);
});

test("el vuelo de ayer sin comprar está vencido", () => {
  assert.equal(estadoDeCompra(viaje({ date: "2026-09-09" }), HOY, 21), "vencido");
});

test("cambiar la ventana mueve la frontera", () => {
  const enQuince = viaje({ date: "2026-09-25" }); // faltan 15 días
  assert.equal(estadoDeCompra(enQuince, HOY, 21), "urgente");
  assert.equal(estadoDeCompra(enQuince, HOY, 14), "proximo");
  assert.equal(estadoDeCompra(enQuince, HOY, 15), "urgente");
});

test("la ventana por omisión son 21 días", () => {
  assert.equal(VENTANA_POR_OMISION, 21);
  assert.equal(
    estadoDeCompra(viaje({ date: "2026-10-01" }), HOY),
    estadoDeCompra(viaje({ date: "2026-10-01" }), HOY, 21),
  );
});

test("los días no se corren con el cambio de horario de Chile", () => {
  // Chile adelanta el reloj el primer domingo de septiembre.
  assert.equal(diasParaVolar("2026-09-10", "2026-09-03"), 7);
  assert.equal(diasParaVolar("2026-04-10", "2026-04-03"), 7);
});

// ---------------------------------------------------------------------------
// Lo que se muestra en pantalla.
// ---------------------------------------------------------------------------

test("el resumen cuenta cada viaje una sola vez", () => {
  const lista = [
    viaje({ date: "2026-09-09" }), // vencido
    viaje({ date: "2026-09-12" }), // urgente
    viaje({ date: "2026-09-12", status: "Solicitado" }), // urgente
    viaje({ date: "2026-12-01" }), // proximo
    viaje({ date: "2026-09-12", pnr: "OK1" }), // resuelto
    viaje({ date: "2026-09-30", status: "Anulado" }), // cerrado
  ];
  const r = resumenDeCompra(lista, HOY, 21);
  assert.deepEqual(
    { v: r.vencidos, u: r.urgentes, p: r.proximos, r: r.resueltos, c: r.cerrados },
    { v: 1, u: 2, p: 1, r: 1, c: 1 },
  );
  assert.equal(
    r.vencidos + r.urgentes + r.proximos + r.resueltos + r.cerrados,
    lista.length,
  );
});

test("las fechas abiertas son fechas distintas, no viajes", () => {
  // Los pasajes se compran por bloque de fecha, así que dos personas que
  // vuelan el mismo día son una sola fecha que atender.
  const lista = [
    viaje({ date: "2026-09-14" }),
    viaje({ date: "2026-09-14" }),
    viaje({ date: "2026-09-14" }),
    viaje({ date: "2026-09-17" }),
    viaje({ date: "2026-09-09" }), // vencida, también cuenta como abierta
    viaje({ date: "2026-12-01" }), // próxima, no está abierta todavía
    viaje({ date: "2026-09-21", pnr: "OK1" }), // resuelta, no cuenta
  ];
  const r = resumenDeCompra(lista, HOY, 21);
  assert.deepEqual(r.fechasAbiertas, ["2026-09-09", "2026-09-14", "2026-09-17"]);
  assert.equal(r.urgentes, 4);
});

test("una lista vacía no rompe nada", () => {
  const r = resumenDeCompra([], HOY);
  assert.deepEqual(r.fechasAbiertas, []);
  assert.equal(r.urgentes + r.vencidos + r.proximos, 0);
});

// ---------------------------------------------------------------------------
// La ventana configurable.
// ---------------------------------------------------------------------------

test("solo se aceptan ventanas razonables", () => {
  assert.ok(ventanaValida(21));
  assert.ok(ventanaValida(1));
  assert.ok(ventanaValida(120));
  assert.ok(!ventanaValida(0));
  assert.ok(!ventanaValida(121));
  assert.ok(!ventanaValida(7.5));
  assert.ok(!ventanaValida(Number.NaN));
});
