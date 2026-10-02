import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (relative: string) => readFile(new URL(relative, root), "utf8");

test("el login conserva la identidad completa y la jerarquía de Daybook Asistencia", async () => {
  const [view, styles] = await Promise.all([
    read("components/login-view.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(
    view,
    /<BrandIdentity className="login-header-identity"\s*\/>/,
    "la cabecera debe identificar su logo completo incluso en móvil",
  );
  assert.match(
    styles,
    /\.login-header-identity\s*\{[^}]*width:\s*168px;/,
    "el logo de cabecera debe medir 168 px",
  );
  assert.match(
    styles,
    /@media \(max-width:\s*430px\)[\s\S]*?\.login-header-identity \.daybook-logo\s*\{[^}]*display:\s*inline-block;/,
    "el breakpoint móvil debe mantener visible el logo completo",
  );
  assert.match(
    view,
    /<BrandMark className="login-card-mark"\s*\/>/,
    "la tarjeta debe mostrar el isotipo Daybook",
  );
  assert.match(
    styles,
    /\.login-card-mark\s*\{[^}]*display:\s*inline-block;[^}]*width:\s*56px;/,
    "el isotipo de la tarjeta debe medir 56 px",
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
    />\s*Gestión de traslados · FCC\s*</,
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

  assert.match(
    browser,
    /const keyboardStops = \[[\s\S]*?button\[aria-label\^="Activar modo"\][\s\S]*?input\[name="email"\][\s\S]*?input\[name="password"\][\s\S]*?form button[\s\S]*?\[data-demo-action\][\s\S]*?\];/,
    "el contrato rápido debe fijar tema → correo → contraseña → submit → demo",
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
