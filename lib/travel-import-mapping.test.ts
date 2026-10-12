import assert from "node:assert/strict";
import test from "node:test";

const {
  enmascararMuestra,
  construirSolicitudMapeo,
  solicitarMapeoImportacion,
  validarMapeo,
  aplicarMapeo,
} = await import("./travel-ai-queue.ts");

test("enmascara muestras sin enviar texto original, RUT o fechas", () => {
  assert.equal(enmascararMuestra("José Ñandú"), "Xxxx Xxxxx");
  assert.equal(enmascararMuestra("12.345.678-9"), "99.999.999-9");
  assert.equal(enmascararMuestra(new Date(Date.UTC(2026, 9, 12))), "9999-99-99");
  const masked = enmascararMuestra("NombreConMásDeVeinticuatroCaracteres");
  assert.equal(masked.length, 24);
  assert.doesNotMatch(masked, /José|Ñandú|NombreCon/i);
});

test("construye una solicitud acotada sin nombre de archivo ni hoja", () => {
  const request = construirSolicitudMapeo({
    entity: "people",
    headers: ["Trabajador", "Inicio"],
    rows: [
      { row_number: 8, Trabajador: "Ana Pérez", Inicio: new Date(Date.UTC(2026, 9, 12)) },
      { row_number: 9, Trabajador: "Beto", Inicio: "2026-11-13" },
      { row_number: 10, Trabajador: "Carla", Inicio: "2026-11-14" },
      { row_number: 11, Trabajador: "Dani", Inicio: "2026-11-15" },
    ],
  });
  assert.deepEqual(request, {
    schema: "travel-import-map-v1",
    entity: "people",
    headers: ["Trabajador", "Inicio"],
    samples: [["Xxx Xxxxx", "9999-99-99"], ["Xxxx", "9999-99-99"], ["Xxxxx", "9999-99-99"]],
  });
  assert.doesNotMatch(JSON.stringify(request), /row_number|archivo|hoja|Ana Pérez/i);
  assert.equal(construirSolicitudMapeo({ entity: "people", headers: Array.from({ length: 41 }, (_, index) => `H${index}`), rows: [] }), null);
});

test("no encola muestras que no tengan forma enmascarada", async () => {
  let calls = 0;
  const client = { async rpc() { calls += 1; return { data: null, error: null }; } };
  const base = { schema: "travel-import-map-v1", entity: "people", headers: ["Nombre"], samples: [["Xxxx"]] };
  for (const sample of ["Ana Pérez", "12345678-9", "xñx", "999A"]) {
    const result = await solicitarMapeoImportacion(client, { ...base, samples: [[sample]] });
    assert.deepEqual(result, { ok: false, reason: "entrada_invalida" });
  }
  assert.equal(calls, 0);
});

test("valida el mapeo con claves exactas, allowlist, unicidad y null", () => {
  const context = { entity: "people" as const, headers: ["Nombre", "Inicio", "Ignorar"] };
  assert.equal(validarMapeo(context, {
    mapping: { Nombre: "nombreCompleto", Inicio: "fechaInicio", Ignorar: null },
  }), true);
  for (const mapping of [
    { Nombre: "nombreCompleto", Inicio: "fechaInicio" },
    { Nombre: "nombreCompleto", Inicio: "fechaInicio", Ignorar: null, extra: null },
    { Nombre: "campoSecreto", Inicio: "fechaInicio", Ignorar: null },
    { Nombre: "nombreCompleto", Inicio: "nombreCompleto", Ignorar: null },
  ]) {
    assert.equal(validarMapeo(context, { mapping }), false);
  }
});

test("aplica el mapeo de forma determinista, ignora null y no muta las filas", () => {
  const rows = [
    { row_number: 6, Trabajador: "Ana Pérez", Desde: "2026-11-12", Nota: "privada" },
  ];
  const mapped = aplicarMapeo(rows, { Trabajador: "nombreCompleto", Desde: "fechaInicio", Nota: null });
  assert.deepEqual(mapped, [{ row_number: 6, nombreCompleto: "Ana Pérez", fechaInicio: "2026-11-12" }]);
  assert.deepEqual(rows, [{ row_number: 6, Trabajador: "Ana Pérez", Desde: "2026-11-12", Nota: "privada" }]);
});
