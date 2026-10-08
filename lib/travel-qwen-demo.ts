import { ejecutarInferenciaPrivada } from "./travel-private-inference.ts";

export const URL_DEMO_QWEN = "http://127.0.0.1:8714/v1/private-inference" as const;
export const DEMO_QWEN_TIMEOUT_MS = 7_500;
export const ESCENARIO_DEMO_QWEN = "move-requested-time-v1" as const;
const SOLICITUD_ESCENARIO = "Mover la hora solicitada a las 09:30." as const;
const CONTEXTO_ESCENARIO = Object.freeze({
  date: "2026-11-12",
  requested_time: "08:00",
  baggage: "Mochila",
  notes: "Ejemplo sintético",
});
const PROPUESTA_ESCENARIO = Object.freeze({ requested_time: "09:30" });
const PROPUESTA_CONTROLADA = Object.freeze({
  ...CONTEXTO_ESCENARIO,
  ...PROPUESTA_ESCENARIO,
});
const CAMPOS_PROPUESTA_CONTROLADA = new Set(Object.keys(PROPUESTA_CONTROLADA));

type EntornoDemo = { NODE_ENV?: string; TRAVEL_QWEN_DEMO?: string };
type FetchDemo = typeof fetch;

function esRegistro(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function escenarioPermitido(value: unknown): boolean {
  return esRegistro(value) && Object.keys(value).length === 1 && value.scenario === ESCENARIO_DEMO_QWEN;
}

function esCambioEsperado(proposal: unknown): boolean {
  if (!esRegistro(proposal) || proposal.requested_time !== PROPUESTA_ESCENARIO.requested_time) return false;
  const fields = Object.keys(proposal);
  return fields.length > 0 && fields.every((field) =>
    CAMPOS_PROPUESTA_CONTROLADA.has(field) && proposal[field] === PROPUESTA_CONTROLADA[field as keyof typeof PROPUESTA_CONTROLADA],
  );
}

export function demoQwenHabilitado(env: EntornoDemo): boolean {
  return env.NODE_ENV === "development" && env.TRAVEL_QWEN_DEMO === "1";
}

function json(body: object, status: number): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

/** Server-only demo boundary. It deliberately has no trip, apply, or authorization inputs. */
export async function manejarDemoQwen({
  request,
  env = process.env,
  fetch = globalThis.fetch,
}: {
  request: Request;
  env?: EntornoDemo;
  fetch?: FetchDemo;
}): Promise<Response> {
  if (!demoQwenHabilitado(env)) return json({ error: "not_found" }, 404);
  if (request.method !== "POST") return json({ error: "not_found" }, 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "request_invalid" }, 400);
  }
  if (!escenarioPermitido(body)) return json({ error: "request_invalid" }, 400);

  const result = await ejecutarInferenciaPrivada({
    input: {
      fixture: "travel-b2-synthetic-v1",
      requestText: `SYNTHETIC: ${SOLICITUD_ESCENARIO}`,
      context: CONTEXTO_ESCENARIO,
    },
    endpoint: { baseUrl: "http://127.0.0.1:8714", path: "/v1/private-inference", timeoutMs: DEMO_QWEN_TIMEOUT_MS },
    fetch,
  });
  if (result.status !== "pending_confirmation" || !esCambioEsperado(result.proposal)) {
    return json({ error: "proposal_unavailable" }, 502);
  }
  return json({
    status: result.status,
    requiresHumanConfirmation: result.requiresHumanConfirmation,
    proposal: { ...PROPUESTA_ESCENARIO },
  }, 200);
}
