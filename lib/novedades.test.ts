import test from "node:test";
import assert from "node:assert/strict";
import { cifraDeNovedades, claveDeVisita, esNovedad, masReciente, textoDeNovedades } from "./novedades.ts";

const YO = "u-yo";
const OTRA = "u-otra";
const VISITA = "2026-11-13T12:00:00.500000+00:00";

test("lo de otra persona después de la visita es nuevo; lo anterior, no", () => {
  assert.equal(esNovedad({ created_at: "2026-11-13T12:05:00+00:00", actor: OTRA }, VISITA, YO), true);
  assert.equal(esNovedad({ created_at: "2026-11-13T11:59:00+00:00", actor: OTRA }, VISITA, YO), false);
  assert.equal(esNovedad({ created_at: VISITA, actor: OTRA }, VISITA, YO), false, "lo último que se vio ya está visto");
});

test("lo que hizo uno mismo no es novedad, pero un cambio interno sí", () => {
  assert.equal(esNovedad({ created_at: "2026-11-13T12:05:00+00:00", actor: YO }, VISITA, YO), false);
  assert.equal(esNovedad({ created_at: "2026-11-13T12:05:00+00:00", actor: null }, VISITA, YO), true);
});

test("sin visita anterior nada se marca: en un computador nuevo no hay avisos falsos", () => {
  assert.equal(esNovedad({ created_at: "2026-11-13T12:05:00+00:00", actor: OTRA }, null, YO), false);
});

test("la visita nunca retrocede, aunque las marcas traigan otro formato", () => {
  assert.equal(masReciente(null, VISITA), VISITA);
  assert.equal(masReciente(VISITA, null), VISITA);
  assert.equal(masReciente(VISITA, "2026-11-13T09:00:00-03:00"), VISITA, "es la misma hora en Santiago, no después");
  assert.equal(masReciente(VISITA, "2026-11-13T09:30:00-03:00"), "2026-11-13T09:30:00-03:00");
  assert.equal(masReciente("2026-11-14T00:00:00+00:00", VISITA), "2026-11-14T00:00:00+00:00");
});

test("la cifra y el texto", () => {
  assert.equal(cifraDeNovedades(7), "7");
  assert.equal(cifraDeNovedades(120), "99+");
  assert.equal(textoDeNovedades(1), "1 cambio nuevo");
  assert.equal(textoDeNovedades(4), "4 cambios nuevos");
  assert.equal(claveDeVisita("abc"), "actividad-visto:abc");
});
