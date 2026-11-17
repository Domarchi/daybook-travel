// Bita lee un documento (Excel, Word o PDF) y propone viajes. POST con el archivo
// en el campo «archivo». La lógica y el orden de las comprobaciones están en
// lib/bita-documento-handler.ts; esta ruta no escribe en ninguna tabla.
import { manejarDocumento } from "@/lib/bita-documento-handler";
import type { EntornoBita } from "@/lib/bita-config";
import { dependenciasReales } from "../_dependencias";

export const dynamic = "force-dynamic";
// pdf.js y el lector de Excel necesitan Node, no el entorno ligero.
export const runtime = "nodejs";
// Leer el archivo y una llamada al modelo de hasta 45 s.
export const maxDuration = 60;

export async function POST(request: Request) {
  return manejarDocumento({ request, env: process.env as EntornoBita, deps: dependenciasReales() });
}
