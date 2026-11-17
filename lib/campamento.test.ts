import test from "node:test";
import assert from "node:assert/strict";
import { armarCampamento, cabeceraDeTraslado, DIAS_SIN_BAJADA, rangoDeFechas, textoDeCampamento } from "./campamento.ts";
import { addDays } from "./calendar.ts";
import type { Trip } from "./types.ts";

const NOMBRES: Record<string, string> = { a: "Ana Prueba", b: "Bruno Ejemplo", c: "Carla Ficticia", d: "Diego Demo" };
const nombreDe = (id: string) => NOMBRES[id] ?? id;
const personas = Object.keys(NOMBRES).map((id) => ({ id, active: true, end_date: null }));

let n = 0;
function viaje(person_id: string, date: string, direction: "SUBIDA" | "BAJADA", extra: Partial<Trip> = {}): Trip {
  const desdeSantiago = direction === "SUBIDA";
  return {
    id: `v${++n}`,
    person_id,
    date,
    direction,
    origin: desdeSantiago ? "Santiago" : "Copiapó",
    destination: desdeSantiago ? "Copiapó" : "Santiago",
    requested_time: null,
    baggage: "",
    status: "Emitido",
    pnr: "ABC123",
    flight: "",
    amount: null,
    notes: "",
    ...extra,
  };
}

const LUNES = "2026-11-16";

test("los del mismo vuelo van en un traslado; por hora, y lo que no tiene hora al final", () => {
  const c = armarCampamento({
    viajes: [
      viaje("b", LUNES, "SUBIDA", { flight: "LA112", requested_time: "08:10:00" }),
      viaje("a", LUNES, "SUBIDA", { flight: "LA112", requested_time: "08:10:00" }),
      viaje("c", LUNES, "SUBIDA", { origin: "Concepción", pnr: "" }),
      viaje("d", LUNES, "SUBIDA", { flight: "LA004", requested_time: "06:36:00" }),
    ],
    personas,
    desde: LUNES,
    dias: 1,
    nombreDe,
  });
  const llegan = c.dias[0].llegan;
  assert.deepEqual(
    llegan.map((t) => cabeceraDeTraslado(t, "llega")),
    [
      "Vuelo LA004 · 06:36 · desde Santiago",
      "Vuelo LA112 · 08:10 · desde Santiago",
      "Vuelo por confirmar · hora por confirmar · desde Concepción",
    ],
  );
  assert.deepEqual(llegan[1].pasajeros.map((p) => p.nombre), ["Ana Prueba", "Bruno Ejemplo"]);
  assert.equal(llegan[2].pasajeros[0].sinPasaje, true, "sin código de reserva se avisa");
});

test("duermen quienes llegaron y no han bajado; quien baja ese día ya no", () => {
  const c = armarCampamento({
    viajes: [
      viaje("a", LUNES, "SUBIDA"),
      viaje("a", "2026-11-19", "BAJADA"),
      viaje("b", "2026-11-17", "SUBIDA"),
    ],
    personas,
    desde: LUNES,
    dias: 4,
    nombreDe,
  });
  assert.deepEqual(c.dias.map((d) => d.pernoctan), [1, 2, 2, 1]);
  assert.equal(c.hasta, "2026-11-19");
  assert.equal(c.dias[3].salen[0].ciudad, "Santiago");
});

test("anulados, no presentados y conexiones que no tocan la obra no cuentan", () => {
  const c = armarCampamento({
    viajes: [
      viaje("a", LUNES, "SUBIDA", { status: "Anulado" }),
      viaje("b", LUNES, "SUBIDA", { status: "No presentado" }),
      viaje("c", LUNES, "SUBIDA", { origin: "Concepción", destination: "Santiago" }),
      viaje("d", LUNES, "SUBIDA", { origin: "Santiago", destination: "copiapo" }),
    ],
    personas,
    desde: LUNES,
    dias: 1,
    nombreDe,
  });
  assert.deepEqual(c.dias[0].llegan.flatMap((t) => t.pasajeros.map((p) => p.nombre)), ["Diego Demo"]);
  assert.equal(c.dias[0].pernoctan, 1, "la ciudad se compara sin tildes ni mayúsculas");
});

test("una ficha inactiva o vencida no ocupa cama", () => {
  const c = armarCampamento({
    viajes: [viaje("a", "2026-11-10", "SUBIDA"), viaje("b", "2026-11-10", "SUBIDA"), viaje("c", "2026-11-10", "SUBIDA")],
    personas: [
      { id: "a", active: true, end_date: null },
      { id: "b", active: false, end_date: null },
      { id: "c", active: true, end_date: "2026-11-15" },
    ],
    desde: LUNES,
    dias: 1,
    nombreDe,
  });
  assert.equal(c.dias[0].pernoctan, 1);
});

test("quien lleva más de 20 días en obra sin bajada se avisa; quien ya estaba, no", () => {
  const c = armarCampamento({
    viajes: [
      viaje("a", addDays(LUNES, -(DIAS_SIN_BAJADA + 1)), "SUBIDA"),
      viaje("b", addDays(LUNES, -3), "SUBIDA"),
      viaje("c", "2026-11-18", "BAJADA"), // su primer viaje es una bajada: ya estaba
    ],
    personas,
    desde: LUNES,
    dias: 1,
    nombreDe,
  });
  assert.deepEqual(c.sinBajada, [{ nombre: "Ana Prueba", subio: "2026-10-26" }]);
  assert.equal(c.dias[0].pernoctan, 3, "igual se cuentan: el aviso es para revisar, no para descontar");
});

test("el texto para el campamento", () => {
  const c = armarCampamento({
    viajes: [
      viaje("a", LUNES, "SUBIDA", { flight: "LA112", requested_time: "08:10:00" }),
      viaje("b", LUNES, "SUBIDA", { flight: "LA112", requested_time: "08:10:00", pnr: "" }),
      viaje("c", "2026-11-17", "BAJADA", { flight: "LA117", requested_time: "15:20:00" }),
    ],
    personas,
    desde: LUNES,
    dias: 3,
    nombreDe,
  });
  assert.equal(
    textoDeCampamento(c, "2026-11-14"),
    [
      "CAMPAMENTO — Daybook Travel",
      "Llegadas, salidas y traslados del 16 al 18 de noviembre de 2026",
      "Generada el 14 de noviembre de 2026",
      "",
      "LUNES 16 DE NOVIEMBRE",
      "Llegan — traslado aeropuerto → campamento (2)",
      "  Vuelo LA112 · 08:10 · desde Santiago",
      "    1. Ana Prueba",
      "    2. Bruno Ejemplo (sin pasaje aún)",
      "Duermen en el campamento: 3 personas",
      "",
      "MARTES 17 DE NOVIEMBRE",
      "Salen — traslado campamento → aeropuerto (1)",
      "  Vuelo LA117 · 15:20 · a Santiago",
      "    1. Carla Ficticia",
      "Duermen en el campamento: 2 personas",
      "",
      "MIÉRCOLES 18 DE NOVIEMBRE",
      "Sin llegadas ni salidas.",
      "Duermen en el campamento: 2 personas",
      "",
      "Total: 2 llegadas y 1 salida en 2 traslados.",
    ].join("\n"),
  );
});

test("el rango de fechas no repite el mes ni el año si no cambian", () => {
  assert.equal(rangoDeFechas("2026-11-16", "2026-11-22"), "del 16 al 22 de noviembre de 2026");
  assert.equal(rangoDeFechas("2026-11-27", "2026-12-03"), "del 27 de noviembre al 3 de diciembre de 2026");
  assert.equal(rangoDeFechas("2026-12-28", "2027-01-03"), "del 28 de diciembre de 2026 al 3 de enero de 2027");
});
