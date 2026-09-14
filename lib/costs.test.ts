import test from "node:test";
import assert from "node:assert/strict";
import {
  avisoDePrecio,
  cobertura,
  desviacion,
  formatoCLP,
  mediana,
  porMes,
  porPersona,
  porRuta,
  referenciaDeRuta,
  rutaDe,
  registroDeCosto,
} from "./costs.ts";

const viaje = (extra: {
  date?: string;
  origin?: string;
  destination?: string;
  amount?: number | null;
  status?: string;
  person_id?: string;
}) => ({
  date: extra.date ?? "2026-09-14",
  origin: extra.origin ?? "Santiago",
  destination: extra.destination ?? "Copiapó",
  amount: extra.amount ?? null,
  status: extra.status ?? "Emitido",
  person_id: extra.person_id ?? "p1",
});

// ---------------------------------------------------------------------------
// La mediana, que es de donde sale el precio de referencia.
// ---------------------------------------------------------------------------

test("la mediana resiste una tarifa disparatada", () => {
  // El promedio de esto sería 1.062.500 y no representa a nadie.
  assert.equal(mediana([100000, 110000, 120000, 3000000]), 115000);
  assert.equal(mediana([100000, 110000, 120000]), 110000);
  assert.equal(mediana([100000]), 100000);
  assert.equal(mediana([]), null);
});

// ---------------------------------------------------------------------------
// La cobertura: sin esto, un total de tres viajes parece el gasto de la obra.
// ---------------------------------------------------------------------------

test("la cobertura dice cuántos viajes tienen monto", () => {
  const c = cobertura([
    viaje({ amount: 100000 }),
    viaje({ amount: 120000 }),
    viaje({}),
    viaje({}),
  ]);
  assert.deepEqual(c, { viajes: 4, conMonto: 2, proporcion: 0.5 });
});

test("los anulados no cuentan ni arriba ni abajo", () => {
  const c = cobertura([
    viaje({ amount: 100000 }),
    viaje({ status: "Anulado" }),
    viaje({ status: "Anulado", amount: 999999 }),
  ]);
  assert.deepEqual(c, { viajes: 1, conMonto: 1, proporcion: 1 });
});

test("sin viajes no hay proporción que inventar", () => {
  assert.deepEqual(cobertura([]), {
    viajes: 0,
    conMonto: 0,
    proporcion: null,
  });
});

// ---------------------------------------------------------------------------
// Los totales. El monto es por pasajero: dos personas en la misma reserva son
// dos montos que se suman.
// ---------------------------------------------------------------------------

test("dos pasajeros del mismo vuelo suman los dos montos", () => {
  const grupos = porRuta([
    viaje({ amount: 545734, person_id: "p1" }),
    viaje({ amount: 545734, person_id: "p2" }),
  ]);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].clave, "Santiago → Copiapó");
  assert.equal(grupos[0].total, 1091468);
  assert.equal(grupos[0].viajes, 2);
  assert.equal(grupos[0].conMonto, 2);
});

test("por ruta separa ida y vuelta, que son rutas distintas", () => {
  const grupos = porRuta([
    viaje({ origin: "Santiago", destination: "Copiapó", amount: 100000 }),
    viaje({ origin: "Copiapó", destination: "Santiago", amount: 90000 }),
  ]);
  assert.deepEqual(
    grupos.map((g) => [g.clave, g.total]),
    [
      ["Copiapó → Santiago", 90000],
      ["Santiago → Copiapó", 100000],
    ],
  );
});

test("por mes agrupa por el mes del vuelo y viene ordenado", () => {
  const grupos = porMes([
    viaje({ date: "2026-10-02", amount: 120000 }),
    viaje({ date: "2026-09-14", amount: 100000 }),
    viaje({ date: "2026-09-28", amount: 110000 }),
  ]);
  assert.deepEqual(
    grupos.map((g) => [g.clave, g.viajes, g.total]),
    [
      ["2026-09", 2, 210000],
      ["2026-10", 1, 120000],
    ],
  );
});

test("por persona agrupa por su id", () => {
  const grupos = porPersona([
    viaje({ person_id: "ana", amount: 100000 }),
    viaje({ person_id: "ana", amount: 120000 }),
    viaje({ person_id: "beto", amount: 90000 }),
  ]);
  assert.deepEqual(
    grupos.map((g) => [g.clave, g.viajes, g.total]),
    [
      ["ana", 2, 220000],
      ["beto", 1, 90000],
    ],
  );
});

test("un grupo sin montos suma cero pero no inventa referencia", () => {
  const grupos = porRuta([viaje({}), viaje({})]);
  assert.equal(grupos[0].viajes, 2);
  assert.equal(grupos[0].conMonto, 0);
  assert.equal(grupos[0].total, 0);
  assert.equal(grupos[0].referencia, null);
});

// ---------------------------------------------------------------------------
// El precio de referencia y el aviso.
// ---------------------------------------------------------------------------

test("la referencia de una ruta sale de su propio historial", () => {
  const trips = [
    viaje({ origin: "Santiago", destination: "Copiapó", amount: 100000 }),
    viaje({ origin: "Santiago", destination: "Copiapó", amount: 120000 }),
    viaje({ origin: "Santiago", destination: "Copiapó", amount: 110000 }),
    viaje({ origin: "Concepción", destination: "Copiapó", amount: 900000 }),
  ];
  assert.deepEqual(referenciaDeRuta(trips, "Santiago → Copiapó"), {
    referencia: 110000,
    viajes: 3,
  });
  assert.deepEqual(referenciaDeRuta(trips, "Concepción → Copiapó"), {
    referencia: 900000,
    viajes: 1,
  });
  assert.deepEqual(referenciaDeRuta(trips, "Iquique → Copiapó"), {
    referencia: null,
    viajes: 0,
  });
});

test("la desviación se lee como porcentaje", () => {
  assert.equal(desviacion(140000, 100000), 0.4);
  assert.equal(desviacion(60000, 100000), -0.4);
  assert.equal(desviacion(100000, 100000), 0);
  assert.equal(desviacion(100000, null), null);
  assert.equal(desviacion(100000, 0), null);
});

test("el aviso salta en el borde y no antes", () => {
  assert.equal(avisoDePrecio(140000, 100000), "caro");
  assert.equal(avisoDePrecio(139000, 100000), null);
  assert.equal(avisoDePrecio(60000, 100000), "barato");
  assert.equal(avisoDePrecio(61000, 100000), null);
});

test("sin referencia no se avisa nada", () => {
  // Es lo que pasa la primera vez que se compra una ruta: no hay con qué
  // comparar, y callar es mejor que inventar una alarma.
  assert.equal(avisoDePrecio(999999, null), null);
});

test("un cero de más se nota", () => {
  // El caso que este aviso existe para atrapar.
  assert.equal(avisoDePrecio(1200000, 120000), "caro");
});

test("el umbral se puede apretar", () => {
  assert.equal(avisoDePrecio(115000, 100000, 0.4), null);
  assert.equal(avisoDePrecio(115000, 100000, 0.1), "caro");
});

// ---------------------------------------------------------------------------
// Presentación.
// ---------------------------------------------------------------------------

test("los montos se leen como pesos chilenos, sin decimales", () => {
  const texto = formatoCLP(545734);
  assert.ok(texto.includes("545"), texto);
  assert.ok(!texto.includes(","), texto);
});

test("rutaDe arma la clave con la flecha de siempre", () => {
  assert.equal(
    rutaDe({ origin: "Santiago", destination: "Copiapó" }),
    "Santiago → Copiapó",
  );
});

test("un plan sin monto no se trata como una reserva comprada sin costo", () => {
  assert.equal(registroDeCosto(viaje({ status: "Planificado", date: "2026-12-01" })), "planificado-sin-monto");
  assert.equal(registroDeCosto(viaje({ status: "Solicitado" })), "planificado-sin-monto");
  assert.equal(registroDeCosto({ ...viaje({ status: "Solicitado" }), pnr: "ABC123" }), "reserva-sin-monto");
  for (const status of ["Emitido", "Completado", "No presentado"]) {
    assert.equal(registroDeCosto(viaje({ status })), "reserva-sin-monto");
  }
});

test("los anulados se excluyen y un monto cero sigue siendo registrado", () => {
  assert.equal(registroDeCosto(viaje({ status: "Anulado", amount: 120000 })), "excluido");
  assert.equal(registroDeCosto(viaje({ amount: 0 })), "registrado");
});
