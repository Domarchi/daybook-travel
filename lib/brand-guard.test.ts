// Guardia de la identidad Daybook Travel. Comprueba activos, texto visible y
// metadata en runtime/public — nunca historia Git ni este propio archivo.
//
// Deliberadamente NO revisa lib/manifest.ts, lib/excel-sync.ts ni supabase/*.sql:
// "FCC" ahí nombra al proyecto/cliente real (el proyecto FCC en Copiapó) o la
// clave técnica interna `fccId` del sincronizador, no la marca del producto.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";

const root = new URL("../", import.meta.url);
const path = (relative: string) => new URL(relative, root);

const ASSET_HASHES: Record<string, string> = {
  "public/brand/daybook-travel-logo-on-dark.svg":
    "6a052764cdeb85a75d78c360bf7bc370dc280c87b46cd599ca7bac84e590f036",
  "public/brand/daybook-travel-logo-on-light.svg":
    "37c7715884eb4586ea624db577cc48018c2d9e6352127a3ec4fce50cff8803cb",
  "public/brand/daybook-mark-on-dark.svg":
    "9363860ea294e605d4e38eb0f5da639be4615acd15549bf33905dc074ae72e78",
  "public/brand/daybook-mark-on-light.svg":
    "22fd86cd6c603034047c7165e5b055eb1316057fb8cfbf604a624c46fe78757f",
  "public/brand/daybook-favicon.svg":
    "2b585cde880d4f9253a6dd89c2ddbc7b2fd3598863c0532384a6e9c120524ac0",
};

// Superficies públicas: lo que el usuario ve, lo que se exporta, y la
// metadata. lib/manifest.ts, lib/excel-sync.ts y supabase/*.sql quedan
// afuera a propósito (ver comentario de cabecera).
const PUBLIC_SURFACE_FILES = [
  "app/layout.tsx",
  "app/globals.css",
  "app/store.tsx",
  "app/excel-sync-panel.tsx",
  "components/brand-background.tsx",
  "components/ui/brand-logo.tsx",
  "components/ui/brand-mark.tsx",
  "components/ui/brand-identity.tsx",
  "components/ui/button.tsx",
  "components/ui/data-table.tsx",
  "components/ui/field.tsx",
  "components/login-view.tsx",
  "components/access-state.tsx",
  "components/workspace.tsx",
  "components/top-bar.tsx",
  "components/manifest-dialog.tsx",
  "lib/brand.ts",
  "lib/manifest-pdf.ts",
  "README.md",
];

const FORBIDDEN_PHRASES = [
  "FCC Construcción",
  "FCC TRAVEL",
  "FCC Travel",
  "fcc-construccion",
  "FCC-TRAVEL",
  "#293582", // FCC_BLUE
  "#0c7b3d", // FCC_GREEN
  "#135932", // verde heredado en el PDF
];

for (const [relative, hash] of Object.entries(ASSET_HASHES)) {
  test(`el activo aprobado ${relative} existe con su hash exacto`, async () => {
    const content = await readFile(path(relative));
    const actual = createHash("sha256").update(content).digest("hex");
    assert.equal(actual, hash);
  });
}

test("el icono que Next sirve replica el favicon aprobado", async () => {
  const [favicon, icon] = await Promise.all([
    readFile(path("public/brand/daybook-favicon.svg")),
    readFile(path("app/icon.svg")),
  ]);
  assert.deepEqual(icon, favicon);
});

test("no queda ningún archivo FCC en public/", async () => {
  const files = await readdir(path("public/brand"), { recursive: true } as never);
  const leftover = (files as string[]).filter((file) => /fcc/i.test(file));
  assert.deepEqual(leftover, []);
});

for (const relative of PUBLIC_SURFACE_FILES) {
  test(`${relative} no contiene identidad FCC`, async () => {
    const content = await readFile(path(relative), "utf8");
    for (const phrase of FORBIDDEN_PHRASES) {
      assert.ok(
        !content.includes(phrase),
        `${relative} todavía contiene "${phrase}"`,
      );
    }
  });
}

test("app/layout.tsx anuncia Daybook Travel en la metadata", async () => {
  const content = await readFile(path("app/layout.tsx"), "utf8");
  assert.match(content, /title:\s*"Daybook Travel/);
});

test("lib/brand.ts expone constantes Daybook, no FCC_*", async () => {
  const content = await readFile(path("lib/brand.ts"), "utf8");
  assert.ok(!/FCC_LOGO|FCC_BLUE|FCC_GREEN/.test(content));
  assert.match(content, /daybook-travel-logo\.png/);
});

test("BrandLogo referencia los dos SVG de Daybook (tema oscuro y claro)", async () => {
  const content = await readFile(path("components/ui/brand-logo.tsx"), "utf8");
  assert.match(content, /daybook-travel-logo-on-dark\.svg/);
  assert.match(content, /daybook-travel-logo-on-light\.svg/);
});

test("BrandMark referencia los dos isotipos de Daybook (tema oscuro y claro)", async () => {
  const content = await readFile(path("components/ui/brand-mark.tsx"), "utf8");
  assert.match(content, /daybook-mark-on-dark\.svg/);
  assert.match(content, /daybook-mark-on-light\.svg/);
});

test("la identidad usa el isotipo en espacios compactos, el logo completo en los amplios", async () => {
  const content = await readFile(path("components/ui/brand-identity.tsx"), "utf8");
  assert.match(content, /BrandLogo/);
  assert.match(content, /BrandMark/);
});

test("el PNG de exportación es válido y conserva la proporción del SVG (328:96)", async () => {
  const buffer = await readFile(path("public/brand/daybook-travel-logo.png"));
  assert.deepEqual(
    buffer.subarray(0, 8),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const ratio = width / height;
  assert.ok(
    Math.abs(ratio - 328 / 96) < 0.01,
    `proporción ${ratio} se aleja de 328:96`,
  );
});

test("el manual distribuible no queda con la marca anterior colgando del README", async () => {
  const readme = await readFile(path("README.md"), "utf8");
  assert.ok(!readme.includes("Manual_FCC_TRAVEL.pdf"));
  await assert.rejects(readFile(path("docs/Manual_FCC_TRAVEL.pdf")));
});
