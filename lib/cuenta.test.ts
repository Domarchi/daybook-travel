import assert from "node:assert/strict";
import test from "node:test";
import { accesoDeLaCuenta, inicialDeLaCuenta, nombreDeLaCuenta, rolEnElRiel } from "./cuenta.ts";

const base = { demo: false, email: "katy@example.com", isAdmin: false, accessStatus: "allowed" };

test("el pie dice quién está: el correo o «Demostración»", () => {
  assert.equal(nombreDeLaCuenta(base), "katy@example.com");
  assert.equal(inicialDeLaCuenta(base), "K");
  assert.equal(nombreDeLaCuenta({ ...base, demo: true, email: null }), "Demostración");
  assert.equal(inicialDeLaCuenta({ ...base, demo: true, email: null }), "D");
});

test("debajo del nombre, el rol que Travel conoce", () => {
  assert.equal(rolEnElRiel({ ...base, isAdmin: true }), "Administrador");
  assert.equal(rolEnElRiel(base), "Sesión activa");
  assert.equal(rolEnElRiel({ ...base, demo: true }), "Datos ficticios");
});

test("Configuración dice el acceso sin suponer: miembro solo si ya se comprobó", () => {
  assert.equal(accesoDeLaCuenta({ ...base, isAdmin: true }), "Administrador");
  assert.equal(accesoDeLaCuenta(base), "Miembro");
  assert.equal(accesoDeLaCuenta({ ...base, accessStatus: "denied" }), "Sin habilitar");
  assert.equal(accesoDeLaCuenta({ ...base, accessStatus: "checking" }), "Comprobando…");
  assert.equal(accesoDeLaCuenta({ ...base, demo: true }), "Demostración");
});
