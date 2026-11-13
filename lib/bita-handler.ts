// Las rutas de Bita en Travel, sin red: todo lo que toca afuera (Supabase,
// Anthropic, el contador) llega inyectado, como en el cron de alertas. Así se
// prueba cada respuesta sin llaves ni base.
//
// Travel no tiene servidor propio: el navegador habla con Supabase y la
// seguridad vive en las políticas. Bita respeta eso: la ruta recibe el token de
// la sesión de la persona y lee con ESE token, así que ve exactamente lo que la
// persona puede ver. La llave de servicio solo cuenta mensajes (migración 014).
//
// Orden de las comprobaciones, de la más barata a la más cara:
//   1. Bita apagada → 404, sin leer nada
//   2. sin llave de Anthropic → 503
//   3. sin sesión o sesión inválida → 401; no es miembro de Travel → 403
//   4. forma y tamaño de la conversación → 415 / 413 / 400
//   5. cupo del día → 429 (si el contador no responde, 503: falla cerrado)
//   6. recién ahí se leen los datos y se llama al modelo
//
// No se guarda ninguna conversación. El registro anota resultado, herramientas y
// tokens; nunca el texto.

import { bitaHabilitada, bitaTieneLlave, cupoDiario, modeloDeBita, type EntornoBita } from "./bita-config.ts";
import { crearSeudonimos } from "./bita-seudonimos.ts";
import type { DatosBita } from "./bita-herramientas.ts";
import { clasificarFallo, conversar, ErrorDeBita, type ClienteMensajes, type MensajeChat } from "./bita-agente.ts";
import type { HistoryItem } from "./types.ts";

export const MAX_BYTES = 120_000;
export const MAX_MENSAJES = 40;
export const MAX_PREGUNTA = 2000;
const MAX_RESPUESTA_PREVIA = 4000;

export type DependenciasBita = {
  verificarSesion: (token: string) => Promise<{ userId: string } | null>;
  esMiembro: (token: string) => Promise<boolean>;
  cargarDatos: (token: string) => Promise<Omit<DatosBita, "hoy">>;
  leerHistorial: (token: string, tripId: string) => Promise<HistoryItem[]>;
  cupo: {
    reservar: (userId: string, limite: number) => Promise<{ permitido: boolean; usados: number }>;
    devolver: (userId: string) => Promise<void>;
    usados: (userId: string) => Promise<number>;
  };
  cliente: () => ClienteMensajes;
  hoy: () => string;
  registrar?: (evento: string, datos: Record<string, unknown>) => void;
};

const json = (cuerpo: object, estado = 200) =>
  Response.json(cuerpo, { status: estado, headers: { "cache-control": "no-store" } });

const registrarPorOmision = (evento: string, datos: Record<string, unknown>) =>
  console.info(JSON.stringify({ evento, ...datos }));

/** «Bearer xxx» → «xxx», o null. Nunca se registra ni se devuelve. */
function tokenDe(request: Request): string | null {
  const valor = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(valor.trim());
  return m ? m[1] : null;
}

type Validacion<T> = { ok: true; valor: T } | { ok: false; error: string };

export function validarConversacion(cuerpo: unknown): Validacion<MensajeChat[]> {
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return { ok: false, error: "El cuerpo no es válido." };
  const mensajes = (cuerpo as { messages?: unknown }).messages;
  if (!Array.isArray(mensajes) || !mensajes.length) return { ok: false, error: "Falta la pregunta." };
  if (mensajes.length > MAX_MENSAJES) return { ok: false, error: "La conversación es demasiado larga. Empieza una nueva." };
  const limpios: MensajeChat[] = [];
  for (const m of mensajes) {
    if (!m || typeof m !== "object") return { ok: false, error: "Un mensaje no es válido." };
    const { role, content } = m as { role?: unknown; content?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content.trim())
      return { ok: false, error: "Un mensaje no es válido." };
    if (role === "user" && content.length > MAX_PREGUNTA)
      return { ok: false, error: `La pregunta puede tener hasta ${MAX_PREGUNTA} caracteres.` };
    limpios.push({ role, content: role === "assistant" ? content.slice(0, MAX_RESPUESTA_PREVIA) : content });
  }
  if (limpios[limpios.length - 1].role !== "user") return { ok: false, error: "El último mensaje debe ser una pregunta." };
  return { ok: true, valor: limpios };
}

/** GET /api/bita/estado: si Bita está encendida. No lee la sesión ni datos. */
export function manejarEstado(env: EntornoBita): Response {
  if (!bitaHabilitada(env)) return json({ error: "not_found" }, 404);
  return json({ disponible: bitaTieneLlave(env) });
}

async function quien(request: Request, deps: DependenciasBita): Promise<Response | { userId: string; token: string }> {
  const token = tokenDe(request);
  if (!token) return json({ error: "Inicia sesión para usar a Bita." }, 401);
  const sesion = await deps.verificarSesion(token).catch(() => null);
  if (!sesion) return json({ error: "Tu sesión venció. Vuelve a entrar." }, 401);
  const miembro = await deps.esMiembro(token).catch(() => false);
  if (!miembro) return json({ error: "Tu cuenta no tiene acceso a Travel." }, 403);
  return { userId: sesion.userId, token };
}

/** GET /api/bita: cuántos mensajes le quedan hoy a la persona. */
export async function manejarCupo({ request, env, deps }: { request: Request; env: EntornoBita; deps: DependenciasBita }) {
  if (!bitaHabilitada(env)) return json({ error: "not_found" }, 404);
  const persona = await quien(request, deps);
  if (persona instanceof Response) return persona;
  const limite = cupoDiario(env);
  try {
    const usados = await deps.cupo.usados(persona.userId);
    return json({ restantes: Math.max(0, limite - usados), limite });
  } catch {
    return json({ restantes: null, limite });
  }
}

/** POST /api/bita: una pregunta a Bita. */
export async function manejarPregunta({ request, env, deps }: { request: Request; env: EntornoBita; deps: DependenciasBita }) {
  if (!bitaHabilitada(env)) return json({ error: "not_found" }, 404);
  if (!bitaTieneLlave(env)) return json({ error: "Bita no está configurada." }, 503);
  const registrar = deps.registrar ?? registrarPorOmision;
  const persona = await quien(request, deps);
  if (persona instanceof Response) return persona;

  if (!(request.headers.get("content-type") ?? "").includes("application/json"))
    return json({ error: "Envía los datos en formato JSON." }, 415);
  const texto = await request.text().catch(() => null);
  if (texto === null) return json({ error: "El cuerpo no es válido." }, 400);
  if (texto.length > MAX_BYTES) return json({ error: "La conversación es demasiado larga." }, 413);
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    return json({ error: "El cuerpo no es válido." }, 400);
  }
  const conversacion = validarConversacion(cuerpo);
  if ("error" in conversacion) return json({ error: conversacion.error }, 400);

  const limite = cupoDiario(env);
  let reserva: { permitido: boolean; usados: number };
  try {
    reserva = await deps.cupo.reservar(persona.userId, limite);
  } catch {
    registrar("bita_cupo_no_disponible", {});
    return json({ error: "Bita no está disponible por ahora." }, 503);
  }
  if (!reserva.permitido)
    return json({ error: `Llegaste al límite de ${limite} mensajes de hoy. Mañana vuelve a estar disponible.` }, 429);
  const restantes = Math.max(0, limite - reserva.usados);
  const devolver = () => deps.cupo.devolver(persona.userId).catch(() => registrar("bita_devolucion_fallida", {}));

  let datos: DatosBita;
  try {
    datos = { ...(await deps.cargarDatos(persona.token)), hoy: deps.hoy() };
  } catch {
    await devolver();
    registrar("bita_datos_no_disponibles", {});
    return json({ error: "No pude leer los viajes ahora. Intenta de nuevo en un momento." }, 503);
  }
  const seud = crearSeudonimos(datos.personas, datos.viajes);

  try {
    const respuesta = await conversar({
      cliente: deps.cliente(),
      modelo: modeloDeBita(env),
      mensajes: conversacion.valor,
      contexto: { datos, seud, leerHistorial: (id) => deps.leerHistorial(persona.token, id) },
    });
    registrar("bita_pregunta", {
      resultado: respuesta.resultado,
      herramientas: respuesta.herramientas.join(",") || null,
      caracteres: conversacion.valor[conversacion.valor.length - 1].content.length,
      tokensEntrada: respuesta.tokensEntrada,
      tokensEnCache: respuesta.tokensEnCache,
      tokensSalida: respuesta.tokensSalida,
    });
    // Los seudónimos de viaje que quedaron en la respuesta, con su id, para que la pantalla los abra.
    const viajes: Record<string, string> = {};
    for (const token of respuesta.texto.match(/\bV-[0-9a-f]{4}(?:[0-9a-f]{4})?\b/g) ?? []) {
      const id = seud.idDeViaje(token);
      if (id) viajes[token] = id;
    }
    return json({ respuesta: respuesta.texto, viajes, restantes, limite });
  } catch (fallo) {
    const veredicto = clasificarFallo(fallo);
    // Si alguna vuelta ya se cobró, el mensaje cuenta. Solo vuelve si no costó nada.
    const gastado = fallo instanceof ErrorDeBita && fallo.tokensEntrada + fallo.tokensSalida > 0;
    if (!gastado && veredicto.devolver) await devolver();
    registrar("bita_fallo", { motivo: veredicto.motivo });
    return json({ error: veredicto.mensaje }, veredicto.estado);
  }
}
