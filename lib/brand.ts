import type { ImageType, SheetData } from "write-excel-file";

export const DAYBOOK_LOGO = "/brand/daybook-travel-logo.png";
export const DAYBOOK_INK = "#11120F";
export const DAYBOOK_GOLD = "#D99B27";

export async function cargarLogo(): Promise<Uint8Array> {
  const response = await fetch(DAYBOOK_LOGO);
  if (!response.ok) throw new Error("No se pudo cargar el logo de Daybook Travel.");
  return new Uint8Array(await response.arrayBuffer());
}

export function logoParaExcel(content: Uint8Array): ImageType<ArrayBuffer> {
  return {
    content: content.slice().buffer,
    contentType: "image/png",
    width: 220,
    height: (220 * 288) / 984,
    dpi: 96,
    anchor: { row: 1, column: 1 },
    title: "Daybook Travel",
    description: "Logo de Daybook Travel",
  };
}

// Tres filas de identidad; los encabezados siguen dentro de las primeras diez
// filas que reconoce el importador. No cambia ningún identificador ni columna.
export function cabeceraExcel(title: string, date: string, demo: boolean): SheetData {
  return [
    [{ value: "", height: 84 }],
    [{ value: `DAYBOOK TRAVEL · ${title}`, fontWeight: "bold", fontSize: 16, color: DAYBOOK_INK, height: 28, span: 2 }],
    [{ value: `Copiapó · ${date}${demo ? " · DEMOSTRACIÓN: datos ficticios" : ""}`, fontSize: 10, color: "#485360", height: 24, span: 2 }],
  ];
}
