import test from "node:test";
import assert from "node:assert/strict";
import { letrasDe, problemaDeMotivo, MINIMO_LETRAS } from "./motivo.ts";

test("el caso real: un punto no es un motivo", () => {
  assert.match(problemaDeMotivo(".") ?? "", /al menos 5 letras/);
});

test("lo vacío pide motivo, y lo demasiado corto pide uno que se entienda", () => {
  assert.match(problemaDeMotivo("   ") ?? "", /Escribe el motivo/);
  for (const corto of ["ok", "x", "----", "1234567", "si.", "asdf"]) {
    assert.ok(problemaDeMotivo(corto), `«${corto}» no debía pasar`);
  }
});

test("los motivos cortos pero claros pasan", () => {
  for (const bueno of ["Duplicado", "No viajó", "Cambio de turno", "Licencia médica", "Pasaje comprado por la agencia"]) {
    assert.equal(problemaDeMotivo(bueno), null, `«${bueno}» debía pasar`);
  }
});

test("se cuentan letras con tilde y eñe, no signos ni números", () => {
  assert.equal(letrasDe("Ñuñoa, 2026."), 5);
  assert.equal(letrasDe("¿¡…!?"), 0);
  assert.equal(MINIMO_LETRAS, 5);
});
