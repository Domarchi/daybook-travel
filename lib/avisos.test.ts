// Fase 5 · el aviso tras una acción: tono obligatorio, el éxito se va a los 4 s
// y el error se queda; la franja de arriba del contenido pasó a ser el aviso
// flotante común de las tres apps.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DURACION_DEL_AVISO_CON_DESHACER_MS,
  DURACION_DEL_AVISO_MS,
  avisoConDeshacer,
  avisoDeError,
  avisoDeExito,
  duracionDelAviso,
} from "./avisos.ts";

const leer = (ruta: string) =>
  readFile(new URL(`../${ruta}`, import.meta.url), "utf8");

test("el éxito dura lo que dice el paquete y el error no se va solo", async () => {
  const paquete = JSON.parse(
    await leer("node_modules/@daybook/design/src/tokens.json"),
  );
  assert.equal(`${DURACION_DEL_AVISO_MS}ms`, paquete.escala["toast-duration"]);
  assert.equal(duracionDelAviso(avisoDeExito("Viaje guardado.")), 4000);
  assert.equal(duracionDelAviso(avisoDeError("No pudimos guardar.")), null);
  assert.equal(`${DURACION_DEL_AVISO_CON_DESHACER_MS}ms`, paquete.escala["toast-duration-undo"]);
  assert.equal(duracionDelAviso(avisoConDeshacer("Acceso quitado.", () => {})), 10000);
});

test("ninguna llamada a setNotice pasa un texto suelto: dice su tono", async () => {
  const archivos = [
    "app/estado/use-acciones-generar.ts",
    "app/estado/use-acciones-viajes.ts",
    "app/estado/use-acciones-personas.ts",
    "app/estado/use-acreditacion.ts",
    "app/estado/use-avisos.ts",
    "app/estado/use-datos.ts",
    "app/estado/use-manifiesto.ts",
    "app/estado/use-sesion.ts",
    "components/members-view.tsx",
    "components/modal-layer.tsx",
  ];
  for (const archivo of archivos) {
    const fuente = await leer(archivo);
    const sueltas = [...fuente.matchAll(/setNotice\((?!\s*(?:avisoDe|avisoConDeshacer|deshacer \?|null\)))[^)]{0,40}/g)].map(
      (m) => m[0],
    );
    assert.deepEqual(sueltas, [], `${archivo}: setNotice sin avisoDeExito/avisoDeError`);
  }
});

test("el aviso flota abajo al centro, en una región viva siempre montada", async () => {
  const workspace = await leer("components/workspace.tsx");
  assert.match(
    workspace,
    /<div className="toast-region" role="status" aria-live="polite" aria-atomic="true">/,
  );
  assert.doesNotMatch(workspace, /mb-\[22px\] flex min-h-12/, "la franja de arriba ya no existe");
  const css = await leer("app/globals.css");
  assert.match(css, /\.toast\s*\{[^}]*left: calc\(50% \+ var\(--db-rail-width\) \/ 2\)/);
  assert.match(css, /\.toast\s*\{[^}]*background: var\(--db-toast-bg\)/);
  assert.match(css, /\.toast\.error\s*\{[^}]*background: var\(--db-toast-danger-bg\)/);
});

test("Fase 5b · anular va en rojo; quitar un acceso se hace sin preguntar y se deshace", async () => {
  const [boton, acciones, cierre, miembros, workspace, css] = await Promise.all([
    leer("components/ui/button.tsx"),
    leer("components/ui/dialog-actions.tsx"),
    leer("components/close-dialog.tsx"),
    leer("components/members-view.tsx"),
    leer("components/workspace.tsx"),
    leer("app/globals.css"),
  ]);
  assert.match(boton, /danger: \[\s*"min-h-\[var\(--db-button-height\)\] border-\[var\(--db-danger-action\)\] bg-\[var\(--db-danger-action\)\]/);
  assert.match(acciones, /<Button variant=\{submitVariant\}/);
  assert.match(cierre, /submitVariant=\{modo === "anular" \? "danger" : "primary"\}/);
  assert.match(miembros, /setNotice\(deshacer \? avisoConDeshacer\(exito, deshacer\) : avisoDeExito\(exito\)\)/);
  assert.match(miembros, /p_active: true \}\),\s*`\$\{miembro\.email\} puede volver a entrar\.`/);
  assert.match(miembros, /p_role: "admin" \}\),\s*`\$\{miembro\.email\} vuelve a administrar los accesos\.`/);
  assert.match(workspace, /notice\.deshacer && \(\s*<button\s*type="button"\s*className="toast-undo"/);
  assert.match(css, /\.toast-undo \{[^}]*color: var\(--db-toast-text\)/);
  for (const fuente of [boton, acciones, cierre, miembros, workspace]) {
    assert.doesNotMatch(fuente, /window\.confirm/);
  }
});
