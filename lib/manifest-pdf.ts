import { FCC_BLUE, FCC_GREEN } from "./brand.ts";
import { formatDate } from "./format.ts";
import type { Bloque } from "./manifest.ts";

// Texto plano: nunca se interpreta HTML ni se cargan imágenes de los pasajeros.
const textoSeguro = (value: string) => value.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ");

export async function crearManifiestoPdf(bloques: Bloque[], date: string, logo: Uint8Array, demo = false) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ format: "a4", unit: "mm", compress: true });
  doc.setProperties({ title: "Solicitud de pasajes · FCC TRAVEL", author: "FCC Construcción", subject: "Coordinación de viajes de obra · Copiapó" });
  const total = bloques.reduce((sum, bloque) => sum + bloque.pasajeros.length, 0);
  let y = 70;

  function cabecera(continuation = false) {
    doc.addImage(logo, "PNG", 10, 0, 64, 64 * 279 / 550, "fcc-logo");
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(FCC_BLUE);
    doc.text("FCC TRAVEL", 192, 15, { align: "right" });
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor("#485360");
    doc.text("COORDINACIÓN DE VIAJES · COPIAPÓ", 192, 22, { align: "right" });
    doc.setDrawColor(FCC_BLUE).setLineWidth(1).line(18, 35, 130, 35);
    doc.setDrawColor(FCC_GREEN).line(130, 35, 192, 35);
    doc.setFont("helvetica", "bold").setFontSize(18).setTextColor("#18212c");
    doc.text("Solicitud de pasajes", 18, 47);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor("#485360");
    doc.text(`Generada el ${formatDate(date)} · ${total} ${total === 1 ? "pasaje" : "pasajes"} · ${bloques.length} ${bloques.length === 1 ? "bloque de viaje" : "bloques de viaje"}${continuation ? " · Continuación" : ""}`, 18, 55);
    if (demo) {
      doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(FCC_BLUE);
      doc.text("DEMOSTRACIÓN · DATOS FICTICIOS", 18, 62);
    }
    y = 70;
  }

  function nuevaPagina() {
    doc.addPage();
    cabecera(true);
  }

  function cabeceraBloque(bloque: Bloque, continuation = false) {
    doc.setFont("helvetica", "bold").setFontSize(10);
    const title = `${formatDate(bloque.fecha)} · ${textoSeguro(bloque.origen)} > ${textoSeguro(bloque.destino)} · ${bloque.sentido === "SUBIDA" ? "Subida" : "Bajada"}${continuation ? " (continuación)" : ""}`;
    const lines: string[] = doc.splitTextToSize(title, 170);
    const height = lines.length * 4.5 + 6;
    if (y + height + 21 > 270) nuevaPagina();
    doc.setFillColor("#eef3f0").rect(18, y, 174, height, "F");
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor("#135932").text(lines, 21, y + 6, { lineHeightFactor: 1.27 });
    y += height + 6;
    doc.setFont("helvetica", "bold").setFontSize(8).setTextColor("#485360");
    doc.text("PERSONA", 21, y);
    doc.text("HORA REQUERIDA", 119, y);
    doc.text("EQUIPAJE", 153, y);
    y += 3;
  }

  cabecera();
  for (const bloque of bloques) {
    cabeceraBloque(bloque);
    for (let index = 0; index < bloque.pasajeros.length; index++) {
      const passenger = bloque.pasajeros[index];
      doc.setFont("helvetica", "normal").setFontSize(9);
      const columns: string[][] = [
        doc.splitTextToSize(`${index + 1}. ${textoSeguro(passenger.nombre)}`, 92),
        doc.splitTextToSize(passenger.hora || "Por confirmar", 29),
        doc.splitTextToSize(textoSeguro(passenger.equipaje) || "Por confirmar", 36),
      ];
      let start = 0;
      const length = Math.max(...columns.map((lines) => lines.length));
      while (start < length) {
        if (y + 11 > 270) {
          nuevaPagina();
          cabeceraBloque(bloque, true);
        }
        const count = Math.min(length - start, Math.floor((270 - y - 6) / 4.5));
        const height = count * 4.5 + 6;
        if (index % 2 === 0) doc.setFillColor("#f3f5f7").rect(18, y, 174, height, "F");
        doc.setFont("helvetica", "normal").setFontSize(9).setTextColor("#18212c");
        columns.forEach((lines, column) => {
          const part = lines.slice(start, start + count);
          if (part.length) doc.text(part, [21, 119, 153][column], y + 6, { lineHeightFactor: 1.42 });
        });
        y += height;
        start += count;
      }
    }
    y += 9;
  }

  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page).setDrawColor("#dce2e7").setLineWidth(0.2).line(18, 280, 192, 280);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor("#5f6b78");
    doc.text("FCC Construcción · Solicitud para coordinación con la agencia", 18, 286);
    doc.text(`${page} / ${doc.getNumberOfPages()}`, 192, 286, { align: "right" });
  }
  return doc;
}
