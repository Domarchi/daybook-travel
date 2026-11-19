import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { CLAVE_DEL_TEMA, etiquetaDeTema, leerPreferenciaDeTema, OPCIONES_DE_APARIENCIA, OPCIONES_DE_TEMA, SCRIPT_TEMA_INICIAL, siguientePreferenciaDeTema, temaEfectivo } from "./tema.ts";

test("sin elección guardada, el tema sigue al sistema (antes era oscuro fijo)", () => {
  assert.equal(leerPreferenciaDeTema(null), "system");
  assert.equal(leerPreferenciaDeTema(""), "system");
  assert.equal(leerPreferenciaDeTema("azul"), "system");
  assert.equal(leerPreferenciaDeTema("dark"), "dark");
  assert.equal(leerPreferenciaDeTema("light"), "light");
  assert.equal(leerPreferenciaDeTema("system"), "system");
});

test("«Sistema» pinta lo que diga el sistema; Claro y Oscuro mandan sobre él", () => {
  assert.equal(temaEfectivo("system", true), "dark");
  assert.equal(temaEfectivo("system", false), "light");
  assert.equal(temaEfectivo("light", true), "light");
  assert.equal(temaEfectivo("dark", false), "dark");
});

test("las tres opciones, en el orden de las tres apps Daybook", () => {
  assert.deepEqual(OPCIONES_DE_TEMA.map((o) => o.etiqueta), ["Sistema", "Claro", "Oscuro"]);
});

test("el botón del riel recorre Sistema → Claro → Oscuro y vuelve a Sistema", () => {
  assert.equal(siguientePreferenciaDeTema("system"), "light");
  assert.equal(siguientePreferenciaDeTema("light"), "dark");
  assert.equal(siguientePreferenciaDeTema("dark"), "system");
  assert.deepEqual(["system", "light", "dark"].map((p) => etiquetaDeTema(p as never)), ["Sistema", "Claro", "Oscuro"]);
});

test("Configuración ofrece las tres, como Parte Diario: Claro, Oscuro y Según el sistema", () => {
  assert.deepEqual(OPCIONES_DE_APARIENCIA.map((o) => o.etiqueta), ["Claro", "Oscuro", "Según el sistema"]);
  assert.deepEqual(new Set(OPCIONES_DE_APARIENCIA.map((o) => o.valor)), new Set(OPCIONES_DE_TEMA.map((o) => o.valor)));
});

// El script del <head> repite la regla en texto: se ejecuta con un navegador de
// mentira para que no se separe de temaEfectivo.
function correrScript(guardado: string | null, sistemaOscuro: boolean) {
  const documentElement = { dataset: {} as Record<string, string> };
  const window = {
    localStorage: { getItem: (clave: string) => (clave === CLAVE_DEL_TEMA ? guardado : null) },
    matchMedia: () => ({ matches: sistemaOscuro }),
  };
  vm.runInNewContext(SCRIPT_TEMA_INICIAL, { window, document: { documentElement } });
  return documentElement.dataset.theme;
}

test("el script inicial pinta lo mismo que temaEfectivo", () => {
  for (const guardado of [null, "light", "dark", "system", "otra"])
    for (const sistemaOscuro of [true, false])
      assert.equal(correrScript(guardado, sistemaOscuro), temaEfectivo(leerPreferenciaDeTema(guardado), sistemaOscuro), `${guardado}/${sistemaOscuro}`);
});
