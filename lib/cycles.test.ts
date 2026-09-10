import test from "node:test";
import assert from "node:assert/strict";
import { movimientos, diaSemana, type CicloPersona } from "./cycles.ts";
import { addDays } from "./calendar.ts";

// Copia exacta del calendario que se retira de lib/calendar.ts. Vive aquí, y
// solo aquí, para que la primera prueba pueda comparar el motor nuevo contra el
// comportamiento viejo sin dejar código muerto en producción.
function calendarioAnterior(start: string, end: string) {
  if (new Date(start + "T12:00:00Z").getUTCDay() !== 1) {
    throw new Error("La primera subida debe ser un lunes.");
  }
  const out: { date: string; direction: string }[] = [];
  for (let d = start; d <= end; d = addDays(d, 7)) {
    out.push({ date: d, direction: "SUBIDA" });
    const down = addDays(d, 3);
    if (down <= end) out.push({ date: down, direction: "BAJADA" });
  }
  return out;
}

const cuatroPorTres = (extra: Partial<CicloPersona> = {}): CicloPersona => ({
  shift: "4×3",
  start_date: "2026-09-07", // lunes
  ...extra,
});

const diezPorDiez = (extra: Partial<CicloPersona> = {}): CicloPersona => ({
  shift: "10×10",
  start_date: "2026-09-07",
  ...extra,
});

// ---------------------------------------------------------------------------
// Lo primero y lo más importante: para la gente que ya está cargada en la obra,
// el motor nuevo tiene que producir exactamente las mismas fechas que el viejo.
// Todas las personas 4×3 de hoy empiezan un lunes y viajan lunes y jueves.
// ---------------------------------------------------------------------------

test("4×3 por omisión reproduce exactamente el calendario anterior", () => {
  const lunes = ["2026-09-07", "2026-10-05", "2027-01-04", "2026-04-06"];
  for (const inicio of lunes) {
    for (const meses of [1, 3, 12]) {
      const hasta = addDays(inicio, meses * 30);
      assert.deepEqual(
        movimientos(cuatroPorTres({ start_date: inicio }), hasta),
        calendarioAnterior(inicio, hasta),
        `difieren desde ${inicio} por ${meses} meses`,
      );
    }
  }
});

test("4×3 atraviesa el cambio de horario de Chile sin correrse un día", () => {
  // Chile adelanta el reloj el primer domingo de septiembre.
  assert.deepEqual(movimientos(cuatroPorTres(), "2026-09-17"), [
    { date: "2026-09-07", direction: "SUBIDA" },
    { date: "2026-09-10", direction: "BAJADA" },
    { date: "2026-09-14", direction: "SUBIDA" },
    { date: "2026-09-17", direction: "BAJADA" },
  ]);
});

// ---------------------------------------------------------------------------
// Lo nuevo del 4×3: los días se eligen, y la fecha de inicio ya no tiene que
// caer un lunes.
// ---------------------------------------------------------------------------

test("4×3 con otros días: martes y viernes", () => {
  assert.deepEqual(
    movimientos(
      cuatroPorTres({ start_date: "2026-09-08", up_weekday: 2, down_weekday: 5 }),
      "2026-09-18",
    ),
    [
      { date: "2026-09-08", direction: "SUBIDA" },
      { date: "2026-09-11", direction: "BAJADA" },
      { date: "2026-09-15", direction: "SUBIDA" },
      { date: "2026-09-18", direction: "BAJADA" },
    ],
  );
});

test("4×3 cuando la bajada cae en la semana siguiente: jueves y lunes", () => {
  // Sube el jueves y baja el lunes: cuatro noches en faena, cruzando el fin de
  // semana. La bajada es del lunes siguiente, no del lunes anterior.
  assert.deepEqual(
    movimientos(
      cuatroPorTres({ start_date: "2026-09-10", up_weekday: 4, down_weekday: 1 }),
      "2026-09-25",
    ),
    [
      { date: "2026-09-10", direction: "SUBIDA" },
      { date: "2026-09-14", direction: "BAJADA" },
      { date: "2026-09-17", direction: "SUBIDA" },
      { date: "2026-09-21", direction: "BAJADA" },
      { date: "2026-09-24", direction: "SUBIDA" },
    ],
  );
});

test("4×3 que empieza a mitad de semana sube el primer día que corresponde", () => {
  // Entra un miércoles con turno lunes/jueves: su primera subida es el lunes
  // siguiente. No se inventa una bajada del ciclo en el que no estuvo.
  const salida = movimientos(
    cuatroPorTres({ start_date: "2026-09-09" }),
    "2026-09-20",
  );
  assert.equal(salida[0].date, "2026-09-14");
  assert.equal(salida[0].direction, "SUBIDA");
  assert.equal(diaSemana(salida[0].date), 1);
});

test("4×3 siempre empieza subiendo y alterna", () => {
  const salida = movimientos(cuatroPorTres(), "2027-03-01");
  assert.equal(salida[0].direction, "SUBIDA");
  salida.forEach((paso, i) => {
    assert.equal(paso.direction, i % 2 === 0 ? "SUBIDA" : "BAJADA");
    if (i > 0) assert.ok(paso.date > salida[i - 1].date, "fechas desordenadas");
  });
});

// ---------------------------------------------------------------------------
// El 10×10, que hasta ahora no se generaba en ninguna parte.
// ---------------------------------------------------------------------------

test("10×10 sube, baja a los diez días y vuelve a subir a los veinte", () => {
  assert.deepEqual(movimientos(diezPorDiez(), "2026-10-17"), [
    { date: "2026-09-07", direction: "SUBIDA" },
    { date: "2026-09-17", direction: "BAJADA" },
    { date: "2026-09-27", direction: "SUBIDA" },
    { date: "2026-10-07", direction: "BAJADA" },
    { date: "2026-10-17", direction: "SUBIDA" },
  ]);
});

test("10×10: dos personas desfasadas diez días quedan cruzadas", () => {
  // Esto es el relevo: cuando una sube, la otra baja, siempre, sin grupos.
  const a = movimientos(diezPorDiez({ start_date: "2026-09-07" }), "2027-03-01");
  const b = movimientos(diezPorDiez({ start_date: "2026-09-17" }), "2027-03-01");
  const porFecha = new Map(b.map((m) => [m.date, m.direction]));
  let cruces = 0;
  for (const paso of a) {
    const otro = porFecha.get(paso.date);
    if (!otro) continue;
    assert.notEqual(otro, paso.direction, `mismo sentido el ${paso.date}`);
    cruces++;
  }
  assert.ok(cruces > 10, `esperaba muchos cruces, hubo ${cruces}`);
});

test("10×10 no depende del día de la semana", () => {
  // Da lo mismo qué día caiga: el ciclo es de veinte días, no semanal.
  const salida = movimientos(diezPorDiez({ start_date: "2026-09-12" }), "2026-10-02");
  assert.deepEqual(salida, [
    { date: "2026-09-12", direction: "SUBIDA" },
    { date: "2026-09-22", direction: "BAJADA" },
    { date: "2026-10-02", direction: "SUBIDA" },
  ]);
});

// ---------------------------------------------------------------------------
// Vigencia y bordes.
// ---------------------------------------------------------------------------

test("el fin de vigencia corta los movimientos", () => {
  assert.deepEqual(
    movimientos(cuatroPorTres({ end_date: "2026-09-15" }), "2026-12-31"),
    [
      { date: "2026-09-07", direction: "SUBIDA" },
      { date: "2026-09-10", direction: "BAJADA" },
      { date: "2026-09-14", direction: "SUBIDA" },
    ],
  );
  assert.deepEqual(
    movimientos(diezPorDiez({ end_date: "2026-09-20" }), "2026-12-31"),
    [
      { date: "2026-09-07", direction: "SUBIDA" },
      { date: "2026-09-17", direction: "BAJADA" },
    ],
  );
});

test("una fecha tope anterior al inicio no genera nada", () => {
  assert.deepEqual(movimientos(cuatroPorTres(), "2026-09-01"), []);
  assert.deepEqual(movimientos(diezPorDiez(), "2026-09-01"), []);
  assert.deepEqual(
    movimientos(cuatroPorTres({ end_date: "2026-08-01" }), "2026-12-31"),
    [],
  );
});

test("ningún movimiento cae fuera del período pedido", () => {
  for (const persona of [cuatroPorTres(), diezPorDiez()]) {
    for (const paso of movimientos(persona, "2027-06-30")) {
      assert.ok(paso.date >= persona.start_date, `${paso.date} antes del inicio`);
      assert.ok(paso.date <= "2027-06-30", `${paso.date} después del tope`);
    }
  }
});

// ---------------------------------------------------------------------------
// Lo que el motor tiene que rechazar.
// ---------------------------------------------------------------------------

test("rechaza fechas mal escritas", () => {
  assert.throws(() => movimientos(cuatroPorTres({ start_date: "07-09-2026" }), "2026-12-31"));
  assert.throws(() => movimientos(cuatroPorTres(), "diciembre"));
});

test("rechaza períodos de más de dos años", () => {
  assert.throws(
    () => movimientos(cuatroPorTres(), "2029-01-01"),
    /dos años/,
  );
});

test("rechaza subir y bajar el mismo día", () => {
  assert.throws(
    () => movimientos(cuatroPorTres({ up_weekday: 3, down_weekday: 3 }), "2026-12-31"),
    /mismo día/,
  );
});

test("rechaza días fuera de rango", () => {
  assert.throws(() => movimientos(cuatroPorTres({ up_weekday: 0 }), "2026-12-31"));
  assert.throws(() => movimientos(cuatroPorTres({ down_weekday: 8 }), "2026-12-31"));
  assert.throws(() => movimientos(cuatroPorTres({ up_weekday: 2.5 }), "2026-12-31"));
});

test("rechaza una jornada que no existe", () => {
  assert.throws(
    () => movimientos({ shift: "7×7", start_date: "2026-09-07" } as never, "2026-12-31"),
    /desconocida/,
  );
});

test("addDays no se corre un día en los cambios de horario ni en fin de año", () => {
  assert.equal(addDays("2026-09-05", 3), "2026-09-08");
  assert.equal(addDays("2026-04-03", 3), "2026-04-06");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
