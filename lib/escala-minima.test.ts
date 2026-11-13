// La escala común de @daybook/design no baja de 11 px (--db-text-overline). Los
// seis textos de 7–9 px que quedaban en Travel (estado de la persona, «Hoy»,
// «viajes», la etiqueta de las tarjetas de tabla y las de turno del calendario)
// pasaron a 11 px; en el día de 44 px del teléfono la etiqueta se abrevia en vez
// de encoger. Y en claro, el texto apagado, el borde de campo, peligro e
// información salen del paquete, como en Parte Diario y Ticket.
import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

async function fuentes(dir: string): Promise<[string, string][]> {
  const out: [string, string][] = [];
  for (const entrada of await readdir(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
    const ruta = `${dir}/${entrada.name}`;
    if (entrada.isDirectory()) out.push(...(await fuentes(ruta)));
    else if (/\.(tsx|css)$/.test(entrada.name)) out.push([ruta, await readFile(new URL(`../${ruta}`, import.meta.url), "utf8")]);
  }
  return out;
}

test("ningún texto de la interfaz baja de 11 px", async () => {
  for (const [ruta, fuente] of [...(await fuentes("app")), ...(await fuentes("components"))]) {
    assert.deepEqual([...fuente.matchAll(/text-\[(?:[0-9]|10)(?:\.\d+)?px\]/g)].map((m) => m[0]), [], ruta);
  }
});

test("en claro, apagado, borde de campo, peligro e información son los del paquete", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const claro = css.slice(css.indexOf(':root[data-theme="light"] {'));
  const bloque = claro.slice(0, claro.indexOf("\n}"));
  for (const variable of ["--muted", "--border-strong", "--danger", "--info"]) {
    assert.doesNotMatch(bloque, new RegExp(`${variable}:`), `${variable} no se redefine en claro`);
  }
  assert.match(css, /--danger: var\(--db-danger\);/);
  assert.match(css, /--info: var\(--db-info\);/);
});
