import test from "node:test";
import assert from "node:assert/strict";
import {
  digitoVerificador,
  formatearRut,
  formatearTelefono,
  baseConContacto,
  leerContacto,
  normalizarCorreo,
  normalizarRut,
  normalizarTelefono,
  rutValido,
} from "./contacto.ts";

test("el dígito verificador sigue el módulo 11, con 0 y K", () => {
  // Los mismos casos que la base (rut_valido() de la migración 016).
  assert.equal(digitoVerificador("11111111"), "1");
  assert.equal(digitoVerificador("12345678"), "5");
  assert.equal(digitoVerificador("7654321"), "6");
  assert.equal(digitoVerificador("10000013"), "K");
  assert.equal(digitoVerificador("5126663"), "3");
  const conCero = Array.from({ length: 40 }, (_, i) => String(10000000 + i)).find((c) => digitoVerificador(c) === "0");
  assert.ok(conCero, "algún cuerpo da 0");
});

test("el RUT se guarda sin puntos, con guion y K mayúscula", () => {
  assert.equal(normalizarRut("12.345.678-5"), "12345678-5");
  assert.equal(normalizarRut(" 10.000.013-k "), "10000013-K");
  assert.equal(normalizarRut("123456785"), "12345678-5");
  assert.equal(normalizarRut("1"), "1");
  assert.equal(rutValido("12345678-5"), true);
  assert.equal(rutValido("12345678-4"), false);
  assert.equal(rutValido("12.345.678-5"), false, "valida la forma guardada");
  assert.equal(rutValido("123456-0"), false, "muy corto");
  assert.equal(formatearRut("12345678-5"), "12.345.678-5");
  assert.equal(formatearRut("7654321-6"), "7.654.321-6");
});

test("el teléfono queda internacional; sin código de país se toma como chileno", () => {
  assert.equal(normalizarTelefono("+56 9 1234 5678"), "+56912345678");
  assert.equal(normalizarTelefono("9 1234 5678"), "+56912345678");
  assert.equal(normalizarTelefono("912345678"), "+56912345678");
  assert.equal(normalizarTelefono("1234 5678"), "+56912345678");
  assert.equal(normalizarTelefono("0056912345678"), "+56912345678");
  assert.equal(normalizarTelefono("+54 9 11 2345 6789"), "+5491123456789");
  assert.equal(normalizarTelefono("123"), null);
  assert.equal(normalizarTelefono("sin teléfono"), null);
  assert.equal(formatearTelefono("+56912345678"), "+56 9 1234 5678");
  assert.equal(formatearTelefono("+5491123456789"), "+5491123456789");
});

test("el correo va en minúscula", () => {
  assert.equal(normalizarCorreo("  Ana@Obra.Test "), "ana@obra.test");
  assert.equal(normalizarCorreo("ana@obra"), null);
});

test("leerContacto: vacío es null y mal escrito dice cuál campo", () => {
  assert.deepEqual(leerContacto({ rut: "", phone: " ", email: "" }), { rut: null, phone: null, email: null });
  assert.deepEqual(
    leerContacto({ rut: "12.345.678-5", phone: "9 1234 5678", email: "Ana@Obra.test" }),
    { rut: "12345678-5", phone: "+56912345678", email: "ana@obra.test" },
  );
  assert.throws(() => leerContacto({ rut: "12.345.678-4", phone: "", email: "" }), /RUT/);
  assert.throws(() => leerContacto({ rut: "", phone: "12", email: "" }), /teléfono/);
  assert.throws(() => leerContacto({ rut: "", phone: "", email: "ana" }), /correo/);
});

test("sin la migración 016 las personas no traen rut, y la ficha no manda contacto", () => {
  assert.equal(baseConContacto([{ name: "a" }, { name: "b" }]), false);
  assert.equal(baseConContacto([{ name: "a", rut: null }]), true);
  assert.equal(baseConContacto([]), false);
});
