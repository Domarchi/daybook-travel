// Los errores al guardar se leen en español y dicen qué pasó con lo escrito.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mensajeDeError } from "./errores.ts";

test("sin señal: se dice que no hay conexión y que lo escrito sigue ahí", () => {
  const fetch = new TypeError("Failed to fetch");
  assert.equal(
    mensajeDeError(fetch, "form"),
    "Sin conexión. No se pudo guardar; lo escrito sigue en el formulario. Intenta de nuevo cuando vuelva la señal.",
  );
  assert.match(mensajeDeError(fetch, "global"), /^Sin conexión\. No se pudo completar la acción\./);
  // Supabase no lanza: devuelve el fallo de red como un error con el texto pegado.
  assert.match(mensajeDeError({ message: "TypeError: Failed to fetch", code: "" }, "form"), /^Sin conexión\./);
  assert.match(mensajeDeError(new TypeError("Load failed")), /^Sin conexión\./, "Safari");
  assert.match(mensajeDeError(new TypeError("NetworkError when attempting to fetch resource.")), /^Sin conexión\./, "Firefox");
});

test("los rechazos de Postgres se traducen; los de los triggers pasan", () => {
  assert.equal(
    mensajeDeError({ code: "P0001", message: "El viaje debe estar dentro de la vigencia de una persona activa" }),
    "El viaje debe estar dentro de la vigencia de una persona activa.",
  );
  assert.match(mensajeDeError({ code: "23505", message: "duplicate key value violates unique constraint" }), /^No se pudo guardar: ya hay un registro igual/);
  assert.match(mensajeDeError({ code: "23514", message: "new row violates check constraint" }), /^No se pudo guardar: falta un dato/);
  assert.equal(mensajeDeError({ code: "42501", message: "new row violates row-level security policy" }), "No se pudo guardar: tu acceso no permite este cambio.");
  assert.match(mensajeDeError({ code: "PGRST301", message: "JWT expired" }), /la sesión venció/);
  assert.equal(mensajeDeError({ code: "XX000", message: "internal error" }), "No se pudo completar la acción. Intenta de nuevo.");
});

test("los mensajes de la pantalla pasan tal cual; un defecto del programa, no", () => {
  assert.equal(mensajeDeError(new Error("Selecciona una persona activa.")), "Selecciona una persona activa.");
  assert.equal(mensajeDeError(new TypeError("Cannot read properties of undefined (reading 'id')")), "No se pudo completar la acción. Intenta de nuevo.");
  assert.equal(mensajeDeError(null), "No se pudo completar la acción. Intenta de nuevo.");
});

test("runAction traduce y el error del diálogo recibe el foco", async () => {
  const [avisos, capa] = await Promise.all([
    readFile(new URL("../app/estado/use-avisos.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/modal-layer.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(avisos, /const message = mensajeDeError\(error, destination\);/);
  assert.match(avisos, /querySelector<HTMLElement>\("\.dialog-error"\)\?\.focus\(\)/);
  assert.match(capa, /role="alert"\s*tabIndex=\{-1\}\s*className="dialog-error /, "el párrafo que se enfoca existe");
});

test("la anticipación dice que es para todo el equipo y confirma al guardar", async () => {
  const [vista, acciones] = await Promise.all([
    readFile(new URL("../components/agenda-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/estado/use-acciones-viajes.ts", import.meta.url), "utf8"),
  ]);
  assert.match(vista, /Avisar compras con\s*<Select/);
  assert.match(vista, /de anticipación\s*<span[^>]*>\(para todo el equipo\)<\/span>/);
  assert.match(acciones, /const guardado = `Anticipación guardada: \$\{dias\} días, para todo el equipo\.`;/);
  assert.equal(acciones.match(/setNotice\(avisoDeExito\(guardado\)\)/g)?.length, 2, "en la demostración y al guardar");
});
