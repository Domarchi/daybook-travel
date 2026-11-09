import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MENSAJES_DE_ACCESOS,
  MENSAJE_GENERICO,
  correoValido,
  mensajeDeError,
  normalizarCorreo,
  resumenDeAccesos,
  type Miembro,
} from "./members.ts";

test("el correo se normaliza en minúsculas y sin espacios", () => {
  assert.equal(normalizarCorreo("  Nuevo@Example.TEST \n"), "nuevo@example.test");
});

test("correoValido acepta correos normales y rechaza lo que la base rechazaría", () => {
  for (const bueno of ["a@b.cl", " Ana.Perez@empresa.cl ", "x+y@sub.dominio.com"]) {
    assert.equal(correoValido(bueno), true, bueno);
  }
  for (const malo of ["", "   ", "sin-arroba", "a@b", "a@@b.cl", "con espacio@b.cl", "a@b .cl", `${"x".repeat(250)}@b.cl`]) {
    assert.equal(correoValido(malo), false, malo);
  }
});

test("los mensajes de la base se muestran tal cual y todo lo demás se oculta", () => {
  for (const mensaje of MENSAJES_DE_ACCESOS) {
    assert.equal(mensajeDeError({ message: mensaje }), mensaje);
  }
  for (const privado of [
    'duplicate key value violates unique constraint "members_pkey"',
    "connection to server at 10.0.0.5 failed",
    "",
  ]) {
    assert.equal(mensajeDeError({ message: privado }), MENSAJE_GENERICO);
  }
  assert.equal(mensajeDeError(null), MENSAJE_GENERICO);
  assert.equal(mensajeDeError(undefined), MENSAJE_GENERICO);
});

test("cada mensaje que la pantalla acepta existe en la migración, y al revés", async () => {
  const sql = await readFile(new URL("../supabase/009_accesos.sql", import.meta.url), "utf8");
  const levantados = [...sql.matchAll(/raise exception '([^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual([...new Set(levantados)], [...MENSAJES_DE_ACCESOS].sort());
});

test("el resumen cuenta solo a quienes tienen acceso", () => {
  const fila = (role: Miembro["role"], active: boolean): Miembro =>
    ({ email: `${role}${active}${Math.random()}@x.cl`, role, active, created_at: "2026-11-09" });
  assert.deepEqual(
    resumenDeAccesos([fila("admin", true), fila("member", true), fila("member", true), fila("admin", false), fila("member", false)]),
    { activos: 3, administradores: 1, desactivados: 2 },
  );
  assert.deepEqual(resumenDeAccesos([]), { activos: 0, administradores: 0, desactivados: 0 });
});
