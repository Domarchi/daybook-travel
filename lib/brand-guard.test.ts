// Guardia de la identidad Daybook Travel. Comprueba activos, texto visible y
// metadata en runtime/public — nunca historia Git ni este propio archivo.
//
// Los aliases técnicos heredados del sincronizador se conservan para importar
// libros antiguos, pero sus encabezados, errores y mensajes públicos son Daybook.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  PERSON_EXCEL_FIELDS,
  TRIP_EXCEL_FIELDS,
  issuePublicoAlLeerExcel,
  mensajePublicoExcel,
  normalizeExcelPersonRow,
  normalizeExcelTripRow,
} from "./excel-sync.ts";

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
  "app/estado/use-acciones-generar.ts",
  "app/estado/use-acciones-personas.ts",
  "app/estado/use-acciones-sesion.ts",
  "app/estado/use-acciones-viajes.ts",
  "app/estado/use-acreditacion.ts",
  "app/estado/use-avisos.ts",
  "app/estado/use-datos.ts",
  "app/estado/use-derivados.ts",
  "app/estado/use-dialogos.ts",
  "app/estado/use-manifiesto.ts",
  "app/estado/use-navegacion.ts",
  "app/estado/use-sesion.ts",
  "app/estado/use-tema.ts",
  "app/excel-sync-panel.tsx",
  "components/ui/brand-logo.tsx",
  "components/ui/brand-mark.tsx",
  "components/ui/brand-identity.tsx",
  "components/ui/button.tsx",
  "components/ui/data-table.tsx",
  "components/ui/field.tsx",
  "components/login-view.tsx",
  "components/access-state.tsx",
  "components/workspace.tsx",
  "components/side-nav.tsx",
  "components/manifest-dialog.tsx",
  "lib/brand.ts",
  "lib/manifest-pdf.ts",
  "README.md",
  "CLAUDE.md",
];

const FORBIDDEN_PHRASES = [
  "FCC Construcción",
  "FCC TRAVEL",
  "FCC Travel",
  "fcc-construccion",
  "fcc-travel-solicitud.csv",
  "FCC-TRAVEL",
  "ID FCC",
  "· FCC",
  "fcc-travel-theme",
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

test("lib/manifest-pdf.ts se conserva como texto sin bytes de control literales", async () => {
  const content = await readFile(path("lib/manifest-pdf.ts"));
  const controls = [...content].filter(
    (byte) => byte === 0 || byte === 0x1f || byte === 0x7f,
  );

  assert.deepEqual(controls, []);
  assert.ok(content.includes(Buffer.from("[\\u0000-\\u001f\\u007f]")));
});

test("app/layout.tsx anuncia Daybook Travel en la metadata", async () => {
  const content = await readFile(path("app/layout.tsx"), "utf8");
  assert.match(content, /title:\s*"Daybook Travel/);
});

test("lib/brand.ts expone constantes Daybook, no FCC_*", async () => {
  const content = await readFile(path("lib/brand.ts"), "utf8");
  assert.ok(!/FCC_LOGO|FCC_BLUE|FCC_GREEN/.test(content));
  assert.match(content, /daybook-travel-logo\.png/);
});

test("CSV y Excel exponen identidad Daybook sin romper aliases antiguos", async () => {
  const manifiesto = await readFile(path("app/estado/use-manifiesto.ts"), "utf8");
  assert.match(manifiesto, /daybook-travel-solicitud\.csv/);
  assert.equal(PERSON_EXCEL_FIELDS[0], "daybookId");
  assert.equal(TRIP_EXCEL_FIELDS[0], "daybookId");

  const person = normalizeExcelPersonRow({
    daybookId: "no-es-uuid",
    nombreCompleto: "Persona Prueba",
    origen: "Santiago",
    destino: "Copiapó",
    turno: "4×3",
    fechaInicio: "2026-09-14",
    equipaje: "Mochila",
  }, 2);
  const trip = normalizeExcelTripRow({ daybookId: "no-es-uuid" }, 2);
  assert.ok(person.errors.every((error) => !/FCC/i.test(error.message)));
  assert.ok(trip.errors.every((error) => !/FCC/i.test(error.message)));
  assert.equal(
    mensajePublicoExcel("La persona ya no existe en FCC TRAVEL"),
    "La persona ya no existe en Daybook Travel",
  );
});

test("el catch de lectura de Excel no expone el alias histórico de un encabezado duplicado", async () => {
  const issue = issuePublicoAlLeerExcel(
    new Error('La hoja Personas repite el encabezado “ID FCC”.'),
  );

  assert.deepEqual(issue, {
    entity: "Archivo",
    message: "La hoja Personas repite el encabezado “ID Daybook”.",
  });
  assert.doesNotMatch(issue.message, /ID FCC/i);

  const panel = await readFile(path("app/excel-sync-panel.tsx"), "utf8");
  assert.match(
    panel,
    /catch \(error\) \{[\s\S]*setIssues\(\[issuePublicoAlLeerExcel\(error\)\]\);/,
  );
});

// El logo es el sello común de `@daybook/design/marca.css`: el mismo marcado y
// las mismas medidas en Parte Diario, Travel y Ticket. Antes era un SVG de 328×96
// mostrado a 168 px y el nombre del producto quedaba en unos 5 px.
test("el diseño compartido trae el sello de la familia", async () => {
  const layout = await readFile(path("app/layout.tsx"), "utf8");
  const tokens = layout.indexOf('import "@daybook/design/tokens.css";');
  const estados = layout.indexOf('import "@daybook/design/estados.css";');
  const marca = layout.indexOf('import "@daybook/design/marca.css";');
  assert.ok(tokens >= 0 && estados > tokens && marca > estados, "marca.css va después de estados.css");
});

test("BrandLogo usa el marcado del sello: símbolo, DAYBOOK y TRAVEL, sin imagen ni tamaño propio", async () => {
  const content = await readFile(path("components/ui/brand-logo.tsx"), "utf8");
  assert.match(content, /className=\{cn\("db-lockup", className\)\}/);
  assert.match(content, /role="img"/);
  assert.match(content, /aria-label="Daybook Travel"/);
  assert.match(content, /<span className="db-mark" aria-hidden="true" \/>/);
  assert.match(content, /<span className="db-lockup__type" aria-hidden="true">/);
  assert.match(content, /<span className="db-lockup__name">Daybook<\/span>/);
  assert.match(content, /<span className="db-lockup__product">Travel<\/span>/);
  assert.doesNotMatch(content, /<img\b/, "el logo no es una imagen");
  assert.doesNotMatch(content, /logo-on-(dark|light)\.svg/);
  assert.doesNotMatch(content, /w-\[\d+px\]|text-\[\d+px\]|tracking-/, "el tamaño lo pone el paquete");
  // El descriptor nunca es parte del logo ni de su nombre accesible.
  assert.doesNotMatch(content, /db-lockup-descriptor|Gestión de traslados|Copiapó/);
});

test("BrandMark es el símbolo del paquete: 48 px, o 56 px en la tarjeta", async () => {
  const content = await readFile(path("components/ui/brand-mark.tsx"), "utf8");
  assert.match(content, /"db-mark"/);
  assert.match(content, /grande && "db-mark--large"/);
  assert.match(content, /aria-label="Daybook"/);
  assert.doesNotMatch(content, /<img\b/);
});

test("ningún componente dibuja el logo completo con una imagen", async () => {
  const carpetas = ["components", "components/ui", "app"];
  for (const carpeta of carpetas) {
    for (const nombre of await readdir(path(carpeta))) {
      if (!/\.tsx?$/.test(nombre)) continue;
      const content = await readFile(path(`${carpeta}/${nombre}`), "utf8");
      assert.doesNotMatch(content, /daybook-travel-logo-on-(dark|light)\.svg/, `${carpeta}/${nombre}`);
      assert.doesNotMatch(content, /daybook-mark-on-(dark|light)\.svg/, `${carpeta}/${nombre}`);
    }
  }
});

test("el riel lleva el bloque de marca común; la cabecera del teléfono no lleva símbolo", async () => {
  // Desde el menú hamburguesa (Fase 4b) el riel es siempre de 232 px, también
  // como cajón en el teléfono: ahí vive la marca. La barra superior es ☰ · título.
  const barra = await readFile(path("components/side-nav.tsx"), "utf8");
  assert.match(
    barra,
    /<div className="db-brand-block db-on-dark">\s*<BrandLogo \/>\s*<span className="db-lockup-descriptor">Traslados · Copiapó<\/span>\s*<\/div>/,
  );
  const cabecera = await readFile(path("components/workspace.tsx"), "utf8");
  assert.doesNotMatch(cabecera, /<BrandMark\b|<BrandLogo\b|db-mark|db-lockup/);

  const identidad = await readFile(path("components/ui/brand-identity.tsx"), "utf8");
  assert.match(
    identidad,
    /<BrandLogo \/>\s*<span className="db-lockup-descriptor">Gestión de traslados<\/span>/,
    "el descriptor va fuera del logo",
  );
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
