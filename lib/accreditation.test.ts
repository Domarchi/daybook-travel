import test from "node:test";
import assert from "node:assert/strict";
import {
  hayExigencias,
  limpiarNombreDeTipo,
  motivosDeAcreditacion,
  nombreDeTipoValido,
  resumenDeMotivos,
  textoDeMotivo,
  tipoRepetido,
  type DocumentoDePersona,
  type TipoDeDocumento,
} from "./accreditation.ts";

const MEDICO: TipoDeDocumento = { id: "t-med", name: "Examen médico", active: true };
const INDUCCION: TipoDeDocumento = { id: "t-ind", name: "Inducción", active: true };
const CEDULA: TipoDeDocumento = { id: "t-ced", name: "Cédula", active: true };

const doc = (
  person_id: string,
  type_id: string,
  expires_on: string | null,
): DocumentoDePersona => ({ person_id, type_id, expires_on });

test("sin documentos exigidos nadie tiene motivos", () => {
  assert.deepEqual(motivosDeAcreditacion("p1", "2026-09-10", [], []), []);
  assert.equal(hayExigencias([]), false);
});

test("una persona con todo vigente queda al día", () => {
  const documentos = [doc("p1", "t-med", "2026-12-31"), doc("p1", "t-ind", "2027-01-01")];
  assert.deepEqual(
    motivosDeAcreditacion("p1", "2026-09-10", [MEDICO, INDUCCION], documentos),
    [],
  );
});

test("un documento no registrado es un motivo, aunque la fila exista", () => {
  const sinFila = motivosDeAcreditacion("p1", "2026-09-10", [MEDICO], []);
  const filaVacia = motivosDeAcreditacion("p1", "2026-09-10", [MEDICO], [doc("p1", "t-med", null)]);
  assert.deepEqual(sinFila, [{ tipo: "Examen médico", falta: true, venceEl: null }]);
  assert.deepEqual(filaVacia, sinFila);
});

test("vale hasta el día de su vencimiento, inclusive", () => {
  const documentos = [doc("p1", "t-med", "2026-09-10")];
  assert.deepEqual(motivosDeAcreditacion("p1", "2026-09-10", [MEDICO], documentos), []);
  assert.deepEqual(motivosDeAcreditacion("p1", "2026-09-11", [MEDICO], documentos), [
    { tipo: "Examen médico", falta: false, venceEl: "2026-09-10" },
  ]);
});

test("se evalúa contra la fecha del viaje, no contra hoy", () => {
  // El mismo documento sirve para un viaje cercano y no para uno lejano.
  const documentos = [doc("p1", "t-med", "2026-10-01")];
  assert.deepEqual(motivosDeAcreditacion("p1", "2026-09-20", [MEDICO], documentos), []);
  assert.equal(motivosDeAcreditacion("p1", "2026-11-20", [MEDICO], documentos).length, 1);
});

test("los documentos de otra persona no cuentan", () => {
  const documentos = [doc("p2", "t-med", "2030-01-01")];
  assert.equal(motivosDeAcreditacion("p1", "2026-09-10", [MEDICO], documentos).length, 1);
});

test("un tipo desactivado deja de exigirse", () => {
  const desactivado = { ...MEDICO, active: false };
  assert.deepEqual(motivosDeAcreditacion("p1", "2026-09-10", [desactivado], []), []);
  assert.equal(hayExigencias([desactivado]), false);
  assert.equal(hayExigencias([desactivado, INDUCCION]), true);
});

test("los motivos salen ordenados por nombre y dicen qué pasa con cada uno", () => {
  const motivos = motivosDeAcreditacion(
    "p1",
    "2026-09-10",
    [INDUCCION, CEDULA, MEDICO],
    [doc("p1", "t-ind", "2026-01-15")],
  );
  assert.deepEqual(motivos.map((motivo) => motivo.tipo), ["Cédula", "Examen médico", "Inducción"]);
  assert.equal(textoDeMotivo(motivos[0]), "Cédula: sin registrar");
  assert.match(textoDeMotivo(motivos[2]), /^Inducción: vence el .*2026$/);
  assert.match(resumenDeMotivos(motivos), /^Cédula: sin registrar; Examen médico: sin registrar; Inducción: vence el /);
});

test("los nombres de tipo se limpian y no se repiten con otra mayúscula", () => {
  assert.equal(limpiarNombreDeTipo("  Examen   médico "), "Examen médico");
  assert.equal(tipoRepetido(" examen  MÉDICO", [MEDICO]), true);
  assert.equal(tipoRepetido("Licencia", [MEDICO]), false);
  assert.equal(nombreDeTipoValido("a"), false);
  assert.equal(nombreDeTipoValido(" ab "), true);
  assert.equal(nombreDeTipoValido("x".repeat(81)), false);
});
