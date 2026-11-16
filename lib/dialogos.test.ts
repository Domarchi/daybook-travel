// Lo escrito en un diálogo no se pierde sin preguntar, y cerrar sesión pregunta.
//
// Los formularios guardan sus valores solo en los campos: cerrar el diálogo los
// borra. Tocar el velo ya no cierra un formulario; Escape, la ✕ y «Cancelar»
// preguntan si hay algo escrito. El historial se abre dentro del formulario, sin
// desmontarlo.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const leer = (ruta: string) => readFile(new URL(`../${ruta}`, import.meta.url), "utf8");

test("los formularios preguntan antes de descartar lo escrito", async () => {
  const [estado, capa] = await Promise.all([
    leer("app/estado/use-dialogos.ts"),
    leer("components/modal-layer.tsx"),
  ]);
  assert.match(estado, /DIALOGOS_DE_FORMULARIO: readonly ModalName\[\] = \[\s*"trip",\s*"person",\s*"generate",\s*"close",\s*"reserve",\s*\]/);
  assert.match(estado, /if \(event\.key === "Escape"\) pedirCierre\(\);/);
  assert.match(estado, /if \(modificadoRef\.current\) \{\s*setConfirmandoDescarte\(true\);/);
  // El velo no cierra un formulario.
  assert.match(capa, /if \(DIALOGOS_DE_FORMULARIO\.includes\(modal\)\) return;/);
  assert.match(capa, /onChange=\{marcarModificado\}/);
  assert.match(capa, /aria-label="Cerrar"[\s\S]{0,80}onClick=\{pedirCierre\}/);
  assert.match(capa, /cancelLabel="Seguir editando"\s*confirmLabel="Descartar cambios"/);
  for (const dialogo of ["trip", "person", "generate", "close", "reserve"]) {
    const fuente = await leer(`components/${dialogo}-dialog.tsx`);
    assert.match(fuente, /onCancel=\{pedirCierre\}/, `${dialogo}: «Cancelar» pregunta`);
    assert.doesNotMatch(fuente, /closeModal/, `${dialogo}: no cierra sin preguntar`);
  }
});

test("el historial se abre dentro del formulario", async () => {
  for (const [dialogo, titulo] of [["trip", "Historial del viaje"], ["person", "Historial de la persona"]]) {
    const fuente = await leer(`components/${dialogo}-dialog.tsx`);
    assert.match(fuente, new RegExp(`<HistorialEnFicha titulo="${titulo}" />`));
    assert.doesNotMatch(fuente, /showHistory|showPersonHistory/, `${dialogo}: no cambia de diálogo`);
  }
  const acciones = await leer("app/estado/use-acciones-viajes.ts");
  const cargar = acciones.slice(acciones.indexOf("async function cargarHistorial"));
  assert.doesNotMatch(cargar.slice(0, cargar.indexOf("\n  }\n")), /abrirModal/, "cargar no abre otro diálogo");
});

test("el historial dentro del formulario no borra el error del formulario y, si no carga, ofrece Reintentar", async () => {
  const acciones = await leer("app/estado/use-acciones-viajes.ts");
  const cargar = acciones.slice(acciones.indexOf("async function cargarHistorial"));
  const cuerpo = cargar.slice(0, cargar.indexOf("\n  }\n"));
  // Desde la ficha no se limpia el error que ya muestra el formulario, ni el
  // fallo del historial va arriba del formulario: lo dice la sección.
  assert.match(cuerpo, /if \(!enFicha\) clearMessages\(\);/);
  assert.match(cuerpo, /if \(!enFicha\) setFormError\(/);
  assert.match(acciones, /verHistorialEnFicha\(\): Promise<boolean> \{\s*if \(editTrip\) return cargarHistorial\(\[editTrip\.id\], true\);/);
  const historial = await leer("components/history-dialog.tsx");
  const enFicha = historial.slice(historial.indexOf("export function HistorialEnFicha"));
  assert.match(enFicha, /if \(!\(await verHistorialEnFicha\(\)\)\) setEstado\("fallo"\);/);
  assert.match(enFicha, /role="alert"[\s\S]*No se pudo cargar el historial\. Intenta de nuevo\.[\s\S]*Reintentar/);
});

test("la confirmación es la de la familia: foco en la salida segura y botón rojo", async () => {
  const caja = await leer("components/ui/confirm-dialog.tsx");
  assert.match(caja, /role="alertdialog"/);
  assert.match(caja, /cancelar\.current\?\.focus\(\)/);
  assert.match(caja, /variant="danger" onClick=\{onConfirm\}/);
  assert.match(caja, /window\.addEventListener\("keydown", teclas, true\)/);
});

test("cerrar sesión mide 44 px y pregunta; en la demostración avisa que se pierden los cambios", async () => {
  const nav = await leer("components/side-nav.tsx");
  assert.match(nav, /className=\{cn\(BOTON_RIEL, "size-11"\)\}\s*aria-label=\{demo \? "Salir de la demostración" : "Cerrar sesión"\}\s*onClick=\{\(\) => setConfirmandoSalida\(true\)\}/);
  assert.match(nav, /Se pierden los cambios que hiciste en la demostración/);
  assert.match(nav, /Vas a salir de Daybook Travel en este dispositivo/);
  assert.doesNotMatch(nav, /onClick=\{async \(\) => \{\s*if \(!demo\) await db\(\)\.auth\.signOut\(\)/);
});
