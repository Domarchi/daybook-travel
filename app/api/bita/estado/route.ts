// Si Bita está encendida en este despliegue. No lee la sesión ni datos: con Bita
// apagada responde 404 y la pantalla no muestra el botón.
import type { EntornoBita } from "@/lib/bita-config";
import { manejarEstado } from "@/lib/bita-handler";

export const dynamic = "force-dynamic";

export function GET() {
  return manejarEstado(process.env as EntornoBita);
}
