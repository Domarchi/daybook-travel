// Bita, la asistente de Travel. GET: cuántos mensajes quedan hoy. POST: una pregunta.
// La lógica y el orden de las comprobaciones están en lib/bita-handler.ts.
import { manejarCupo, manejarPregunta } from "@/lib/bita-handler";
import type { EntornoBita } from "@/lib/bita-config";
import { dependenciasReales } from "./_dependencias";

export const dynamic = "force-dynamic";
// Hasta tres vueltas de herramientas son varias llamadas seguidas; el presupuesto propio (50 s) cabe aquí.
export const maxDuration = 60;

export async function GET(request: Request) {
  return manejarCupo({ request, env: process.env as EntornoBita, deps: dependenciasReales() });
}

export async function POST(request: Request) {
  return manejarPregunta({ request, env: process.env as EntornoBita, deps: dependenciasReales() });
}
