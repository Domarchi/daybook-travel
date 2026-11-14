import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (relative: string) => readFile(new URL(relative, root), "utf8");

test("el login conserva la identidad completa y la jerarquía de Daybook Asistencia", async () => {
  const view = await read("components/login-view.tsx");

  // Los tamaños (logo común de @daybook/design, símbolo de 56 px, tarjeta) los mide el navegador
  // en `scripts/browser-login.mjs`, con el CSS ya aplicado. Aquí solo se exige que
  // las piezas estén y que el texto sea el aprobado: leer el CSS con expresiones
  // regulares rompía con cualquier cambio de clases aunque se viera igual.
  assert.match(view, /<BrandIdentity\b/, "la cabecera debe mostrar la identidad completa");
  assert.match(view, /<BrandMark grande\b/, "la tarjeta debe mostrar el símbolo Daybook de 56 px");
  assert.match(
    view,
    /<SectionKicker className="[^"]*text-caption[^"]*font-bold[^"]*tracking-\[0\.08em\][^"]*text-\[color:var\(--db-brand\)\][^"]*">\s*Acceso seguro/,
    "«Acceso seguro» va en el dorado de la marca, 12 px bold, .08em",
  );
  assert.match(view, />\s*Bienvenido a Daybook Travel\s*</);
  assert.match(
    view,
    /Usa el mismo correo y contraseña de Daybook Asistencia\./,
  );
  assert.match(view, /data-login-card/);
  assert.match(view, /data-demo-action/);
});

test("la identidad usa el descriptor aprobado de Travel", async () => {
  const identity = await read("components/ui/brand-identity.tsx");

  assert.match(
    identity,
    /<span className="db-lockup-descriptor">Gestión de traslados<\/span>/,
    "la identidad debe mostrar el descriptor exacto aprobado",
  );
  assert.doesNotMatch(identity, /Coordinación de viajes/);
});

test("el login comienza con un único h1", async () => {
  const view = await read("components/login-view.tsx");

  assert.equal((view.match(/<h1\b/g) ?? []).length, 1, "el login debe tener un único h1");
  assert.equal((view.match(/<h2\b/g) ?? []).length, 0, "el login no debe comenzar en h2");
});

test("el harness recorre y activa el login con teclado nativo", async () => {
  const browser = await read("scripts/browser-login.mjs");

  // El orden importa; los controles que se agreguen entre estos (como la casilla
  // de mostrar contraseña) no deben romper la prueba.
  const bloque = browser.slice(browser.indexOf("const keyboardStops = ["));
  const posicion = (selector: string) => bloque.indexOf(selector);
  const orden = [
    'button[aria-label^="Activar modo"]',
    'input[name="email"]',
    'input[name="password"]',
    "form button",
    "[data-demo-action]",
  ].map(posicion);
  assert.ok(orden.every((lugar) => lugar >= 0), "cada control del contrato está en las paradas");
  assert.deepEqual(
    [...orden].sort((a, b) => a - b),
    orden,
    "el contrato fija tema → correo → contraseña → entrar → demo, en ese orden relativo",
  );
  assert.match(
    browser,
    /for \(const stop of keyboardStops\) \{\s*await pressTab\(cdp\);\s*await assertKeyboardFocus\(cdp, stop, label\);/,
    "cada parada debe alcanzarse con Tab y comprobar el foco real",
  );
  assert.match(
    browser,
    /async function pressEnter\(cdp\)[\s\S]*?type: "rawKeyDown"[\s\S]*?type: "char"[\s\S]*?text: "\\r"[\s\S]*?type: "keyUp"/,
    "Enter debe usar rawKeyDown → char con retorno → keyUp",
  );
  assert.equal(
    (browser.match(/await pressEnter\(cdp\);/g) ?? []).length,
    2,
    "tema y demo deben activarse con Enter nativo",
  );
  assert.doesNotMatch(browser, /\.click\(\)/, "el flujo declarado de teclado no puede usar click() JavaScript");
});
