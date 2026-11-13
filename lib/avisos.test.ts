// Fase 5 · el aviso tras una acción: tono obligatorio, el éxito se va a los 4 s
// y el error se queda; la franja de arriba del contenido pasó a ser el aviso
// flotante común de las tres apps.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DURACION_DEL_AVISO_MS,
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
    const sueltas = [...fuente.matchAll(/setNotice\((?!\s*(?:avisoDe|null\)))[^)]{0,40}/g)].map(
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
