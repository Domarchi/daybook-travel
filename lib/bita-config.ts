// Cuándo y cómo está disponible Bita, la asistente de Travel. Todo sale de las
// variables de entorno del servidor; ninguna lleva NEXT_PUBLIC_ y ninguna se
// manda al navegador.
//
// Viene apagada: sin BITA_ENABLED las rutas responden 404 antes de leer la sesión
// y la pantalla no muestra el botón. Encenderla es una decisión aparte.

export type EntornoBita = {
  BITA_ENABLED?: string;
  ANTHROPIC_API_KEY?: string;
  BITA_MODEL?: string;
  BITA_DAILY_LIMIT?: string;
};

const SI = new Set(["1", "true", "on", "yes", "si", "sí"]);

export const MODELO_POR_OMISION = "claude-haiku-5-5";
export const CUPO_POR_OMISION = 20;

export const bitaHabilitada = (env: EntornoBita) => SI.has((env.BITA_ENABLED ?? "").trim().toLowerCase());

export const bitaTieneLlave = (env: EntornoBita) => Boolean((env.ANTHROPIC_API_KEY ?? "").trim());

export const modeloDeBita = (env: EntornoBita) => (env.BITA_MODEL ?? "").trim() || MODELO_POR_OMISION;

/** Mensajes por persona y día de Santiago. Un valor raro en Vercel no puede abrir el gasto: 1 a 200. */
export function cupoDiario(env: EntornoBita): number {
  const valor = Number.parseInt((env.BITA_DAILY_LIMIT ?? "").trim(), 10);
  if (!Number.isFinite(valor)) return CUPO_POR_OMISION;
  return Math.min(200, Math.max(1, valor));
}
