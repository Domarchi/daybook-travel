import type { ImageType, SheetData } from "write-excel-file";

export const FCC_LOGO = "/brand/fcc-construccion.png";
export const FCC_BLUE = "#293582";
export const FCC_GREEN = "#0c7b3d";

export async function cargarLogo(): Promise<Uint8Array> {
  const response = await fetch(FCC_LOGO);
  if (!response.ok) throw new Error("No se pudo cargar el logo de FCC.");
  return new Uint8Array(await response.arrayBuffer());
}

export function logoParaExcel(content: Uint8Array): ImageType<ArrayBuffer> {
  return {
    content: content.slice().buffer,
    contentType: "image/png",
    width: 220,
    height: 220 * 279 / 550,
    dpi: 96,
    anchor: { row: 1, column: 1 },
    title: "FCC Construcción",
    description: "Logo institucional de FCC Construcción",
  };
}

// Tres filas de identidad; los encabezados siguen dentro de las primeras diez
// filas que reconoce el importador. No cambia ningún identificador ni columna.
export function cabeceraExcel(title: string, date: string, demo: boolean): SheetData {
  return [
    [{ value: "", height: 84 }],
    [{ value: `FCC TRAVEL · ${title}`, fontWeight: "bold", fontSize: 16, color: FCC_BLUE, height: 28, span: 2 }],
    [{ value: `Copiapó · ${date}${demo ? " · DEMOSTRACIÓN: datos ficticios" : ""}`, fontSize: 10, color: "#485360", height: 24, span: 2 }],
  ];
}
