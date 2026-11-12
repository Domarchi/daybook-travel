import test from "node:test";
import assert from "node:assert/strict";
import { claveDeNombre, personasConMismoNombre } from "./personas-repetidas.ts";

const persona = (id: string, name: string, active = true) => ({ id, name, active });

test("el nombre se compara sin tildes, mayúsculas ni espacios de más", () => {
  assert.equal(claveDeNombre("  MARÍA   Soto "), "maria soto");
  assert.equal(claveDeNombre("Íñigo Núñez"), claveDeNombre("INIGO NUNEZ"));
});

test("crear otra ficha con el nombre de alguien que ya está avisa de esa persona", () => {
  const personas = [persona("a", "MARÍA SOTO"), persona("b", "JUAN ROJAS")];
  assert.deepEqual(personasConMismoNombre("Maria Soto", personas).map((p) => p.id), ["a"]);
});

test("al editar, la persona no es repetida de sí misma, pero sí de su gemela", () => {
  const personas = [persona("a", "MARÍA SOTO"), persona("b", "MARÍA SOTO")];
  assert.deepEqual(personasConMismoNombre("MARÍA SOTO", personas, "a").map((p) => p.id), ["b"]);
  assert.deepEqual(personasConMismoNombre("JUAN ROJAS", [persona("d", "JUAN ROJAS")], "d"), []);
});

test("las activas van primero: son las que generan viajes", () => {
  const personas = [persona("vieja", "PEDRO LARA", false), persona("nueva", "PEDRO LARA")];
  assert.deepEqual(personasConMismoNombre("Pedro Lara", personas).map((p) => p.id), ["nueva", "vieja"]);
});

test("un nombre parecido no es el mismo, y uno vacío no avisa nada", () => {
  const personas = [persona("a", "MARÍA SOTO")];
  assert.deepEqual(personasConMismoNombre("María Soto Vera", personas), []);
  assert.deepEqual(personasConMismoNombre("", personas), []);
  assert.deepEqual(personasConMismoNombre(" a ", [persona("x", "A")]), []);
});
