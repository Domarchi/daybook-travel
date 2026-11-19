// El riel de Travel es el de Parte Diario: las filas, los títulos de grupo, el
// pie, el cajón del teléfono y el velo vienen de @daybook/design/riel.css. Estas
// pruebas leen el código para que nadie vuelva a dibujarlos con clases propias;
// cómo se ven y se mueven lo comprueba `scripts/browser-flujos.mjs`.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const leer = (ruta: string) => readFile(new URL(`../${ruta}`, import.meta.url), "utf8");

test("la lista del riel usa las clases comunes, en dos grupos, con Configuración al final", async () => {
  const nav = await leer("components/side-nav.tsx");
  assert.match(nav, /<div className="db-rail-scroll">\s*<nav className="db-rail-nav" aria-label="Navegación principal">/);
  assert.match(nav, /<p className="db-rail-section">Operación<\/p>[\s\S]*<p className="db-rail-section">Administración<\/p>/);
  assert.match(nav, /const administracion = \[ACTIVIDAD, \.\.\.\(isAdmin && !demo \? \[ACCESOS\] : \[\]\), CONFIGURACION\];/);
  assert.match(nav, /className="db-rail-link"\s*aria-current=\{actual \? "page" : undefined\}/);
  assert.match(nav, /<span className="db-rail-link__label">\{label\}<\/span>/);
  // Las novedades cuentan, no piden atención: pastilla gris, sin --alert.
  assert.match(nav, /<span className="db-rail-count" data-novedades>/);
  assert.doesNotMatch(nav, /db-rail-count--alert/);
});

test("el pie es el común: quién está y el botón de tema, sin salir", async () => {
  const nav = await leer("components/side-nav.tsx");
  assert.match(nav, /<div className="db-rail-footer">\s*<div className="db-rail-account">\s*<span className="db-rail-avatar" aria-hidden="true">/);
  assert.match(nav, /className="db-rail-account__name"/);
  assert.match(nav, /<small className="db-rail-account__role">\{rolEnElRiel\(cuenta\)\}<\/small>/);
  assert.match(nav, /title=\{`Cambiar a \$\{etiquetaDeTema\(temaSiguiente\)\}`\}/);
});

test("en el teléfono el riel es el cajón común y el velo siempre está montado", async () => {
  const [nav, armazon] = await Promise.all([leer("components/side-nav.tsx"), leer("components/workspace.tsx")]);
  assert.match(nav, /data-open=\{telefono \? String\(menuAbierto\) : undefined\}/);
  // Mientras sale no atrapa el toque: el ☰ que está debajo vuelve a abrirlo.
  assert.match(nav, /telefono && "db-rail-drawer data-\[open=false\]:pointer-events-none"/);
  assert.match(nav, /className="db-rail-icon-button absolute top-2 right-2"\s*aria-label="Cerrar menú"/);
  assert.match(armazon, /className="db-rail-scrim min-\[820px\]:hidden"\s*data-open=\{menuAbierto\}/);
  assert.doesNotMatch(armazon, /\{menuAbierto && \(\s*<div/);
  // La vista entra con el fundido común, con key por vista.
  assert.match(armazon, /<div key=\{view\} className="db-view-enter">/);
});

test("sin colores propios del riel: salen de --db-rail-*", async () => {
  const [nav, css] = await Promise.all([leer("components/side-nav.tsx"), leer("app/globals.css")]);
  assert.doesNotMatch(nav, /\b(bg|text|border(-[trbl])?)-rail\b|text-rail-|bg-rail-|border-rail-|outline-rail-/);
  assert.doesNotMatch(css, /--rail-|--color-rail/);
});

test("al cambiar el tema nada se anima hasta el cuadro siguiente", async () => {
  const tema = await leer("app/estado/use-tema.ts");
  assert.match(tema, /raiz\.classList\.add\("db-theme-switching"\);\s*raiz\.dataset\.theme = theme;\s*void raiz\.offsetHeight;\s*const cuadro = requestAnimationFrame\(\(\) => raiz\.classList\.remove\("db-theme-switching"\)\);/);
});
