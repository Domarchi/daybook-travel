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
