// Fase 5c · la carga se dibuja con la forma del contenido y el vacío es uno solo,
// con el CSS de @daybook/design/estados.css (el mismo de Parte Diario y Ticket).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const leer = (ruta: string) => readFile(new URL(`../${ruta}`, import.meta.url), "utf8");

test("el CSS de carga y vacío es el del paquete, importado después de los tokens", async () => {
  const layout = await leer("app/layout.tsx");
  assert.match(layout, /import "@daybook\/design\/tokens\.css";\nimport "@daybook\/design\/estados\.css";/);
  const paquete = await leer("node_modules/@daybook/design/src/estados.css");
  assert.match(paquete, /\.db-empty \{/);
  assert.match(paquete, /@media \(prefers-reduced-motion: reduce\)/);
});

test("el vacío y el esqueleto usan las clases comunes", async () => {
  const [vacio, esqueleto] = await Promise.all([
    leer("components/ui/empty-state.tsx"),
    leer("components/ui/esqueleto.tsx"),
  ]);
  for (const clase of ["db-empty__icon", "db-empty__title", "db-empty__text", "db-empty__action"]) {
    assert.match(vacio, new RegExp(clase), clase);
  }
  assert.match(esqueleto, /role="status" aria-live="polite" aria-busy="true">\s*<span className="db-visually-hidden">\{etiqueta\}<\/span>/);
});

test("ningún «Cargando…» suelto ni tabla vacía con texto plano", async () => {
  for (const archivo of ["components/members-view.tsx", "components/history-dialog.tsx", "components/costs-view.tsx"]) {
    const fuente = await leer(archivo);
    assert.doesNotMatch(fuente, />\s*(?:\{[^}]*)?"?Cargando[^"<]*…"?\s*</, `${archivo}: «Cargando…» visible`);
    assert.doesNotMatch(fuente, /<Td colSpan=\{\d\}>Todavía no hay/, `${archivo}: fila vacía con texto plano`);
  }
});
