import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import writeXlsxFile from "write-excel-file/node";
import readXlsxFile from "read-excel-file/node";
import { cabeceraExcel, logoParaExcel } from "./brand.ts";
import { PERSON_EXCEL_FIELDS } from "./excel-sync.ts";
import { crearManifiestoPdf } from "./manifest-pdf.ts";

const logo = () => readFile(new URL("../public/brand/fcc-construccion.png", import.meta.url));

test("el Excel con logo conserva encabezados importables, identificadores y acentos", async () => {
  const image = logoParaExcel(await logo());
  const workbook = await writeXlsxFile([
    ...cabeceraExcel("Personas", "2026-09-14", true),
    PERSON_EXCEL_FIELDS.map((value) => ({ value })),
    [{ value: "id-conservar" }, { value: "FCC-001" }, { value: "Joaquín Muñoz" }],
  ], {
    buffer: true,
    images: [{ ...image, content: Buffer.from(image.content) }],
    stickyRowsCount: 4,
  });
  const rows = await readXlsxFile(workbook);
  const headerIndex = rows.findIndex((row) => row[0] === PERSON_EXCEL_FIELDS[0]);
  assert.ok(headerIndex >= 0 && headerIndex < 10);
  assert.deepEqual(rows[headerIndex].slice(0, PERSON_EXCEL_FIELDS.length), [...PERSON_EXCEL_FIELDS]);
  assert.deepEqual(rows[headerIndex + 1].slice(0, 3), ["id-conservar", "FCC-001", "Joaquín Muñoz"]);
  assert.ok(workbook.includes(Buffer.from("xl/media/")), "el libro debe incorporar la imagen, sin depender de una URL");
});

test("el PDF de un bloque numeroso se pagina y repite su identidad y pie", async () => {
  const pdf = await crearManifiestoPdf([{
    fecha: "2026-09-14", origen: "Concepción", destino: "Copiapó", sentido: "SUBIDA",
    pasajeros: Array.from({ length: 100 }, (_, index) => ({
      nombre: `Persona de prueba ${index + 1} · Joaquín Muñoz`,
      hora: index % 2 ? null : "09:00", equipaje: "Maleta en bodega",
    })),
  }], "2026-09-14", await logo(), true);
  assert.ok(pdf.getNumberOfPages() >= 5);
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
    const commands = JSON.stringify(pdf.internal.pages[page]);
    assert.ok(commands.includes("FCC TRAVEL"));
    assert.ok(commands.includes(`${page} / ${pdf.getNumberOfPages()}`));
    assert.ok(commands.includes("/I0 Do"), "cada página debe incorporar el logo");
  }
});
