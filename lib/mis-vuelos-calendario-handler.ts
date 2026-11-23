// La ruta del calendario del teléfono, sin Next ni Supabase adentro (la consulta
// entra por parámetro), para probarla sin red.
//
// La pide el calendario del teléfono, sin sesión ni código: la llave del enlace
// es lo único que la abre, y la base decide qué devuelve (worker_calendar(),
// migración 016). Un enlace viejo, bloqueado o de una ficha inactiva responde
// 404, sin decir cuál de las tres.

import { leerMisVuelos } from "./mis-vuelos.ts";
import { calendarioIcs } from "./mis-vuelos-ics.ts";

const LLAVE = /^[0-9a-f]{64}$/;

export async function manejarCalendario({
  llave,
  consultar,
  ahora = new Date(),
}: {
  llave: string;
  consultar: (llave: string) => Promise<unknown>;
  ahora?: Date;
}): Promise<Response> {
  // Los calendarios suelen pedir «…/llave.ics»: se acepta con o sin extensión.
  const limpia = llave.replace(/\.ics$/i, "");
  const noEncontrado = () =>
    new Response("Calendario no encontrado.", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!LLAVE.test(limpia)) return noEncontrado();

  let datos;
  try {
    datos = leerMisVuelos(await consultar(limpia));
  } catch (error) {
    console.error("calendario: no se pudo leer la base", error instanceof Error ? error.message : "error");
    return new Response("No se pudo leer el calendario.", { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  if (!datos) return noEncontrado();

  return new Response(calendarioIcs(datos, ahora), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="mis-vuelos.ics"',
      // Es de una persona: ningún intermediario lo guarda.
      "Cache-Control": "private, no-store",
    },
  });
}
