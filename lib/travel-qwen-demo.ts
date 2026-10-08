import { ejecutarInferenciaPrivada } from "./travel-private-inference.ts";

export const URL_DEMO_QWEN = "http://127.0.0.1:8714/v1/private-inference" as const;
export const DEMO_QWEN_TIMEOUT_MS = 7_500;
const LIMITE_SOLICITUD = 500;
const CAMPOS_CONTEXTO = new Set(["date", "requested_time", "baggage", "notes"]);

type EntornoDemo = { NODE_ENV?: string; TRAVEL_QWEN_DEMO?: string };
type FetchDemo = typeof fetch;

function esRegistro(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function solicitudPermitida(value: unknown): value is {
  request: string;
  context: { date: string; requested_time: string | null; baggage: string; notes: string };
} {
  if (!esRegistro(value) || Object.keys(value).some((key) => key !== "request" && key !== "context") ||
    typeof value.request !== "string" || value.request.length < 1 || value.request.length > LIMITE_SOLICITUD ||
    !esRegistro(value.context) || Object.keys(value.context).some((key) => !CAMPOS_CONTEXTO.has(key))) return false;
  for (const field of CAMPOS_CONTEXTO) if (!Object.hasOwn(value.context, field)) return false;
  return typeof value.context.date === "string" &&
    (typeof value.context.requested_time === "string" || value.context.requested_time === null) &&
    typeof value.context.baggage === "string" && typeof value.context.notes === "string";
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
  if (!solicitudPermitida(body)) return json({ error: "request_invalid" }, 400);

  const result = await ejecutarInferenciaPrivada({
    input: {
      fixture: "travel-b2-synthetic-v1",
      requestText: `SYNTHETIC: ${body.request}`,
      context: body.context,
    },
    endpoint: { baseUrl: "http://127.0.0.1:8714", path: "/v1/private-inference", timeoutMs: DEMO_QWEN_TIMEOUT_MS },
    fetch,
  });
  if (result.status !== "pending_confirmation") return json({ error: "proposal_unavailable" }, 502);
  return json({
    status: result.status,
    requiresHumanConfirmation: result.requiresHumanConfirmation,
    proposal: result.proposal,
  }, 200);
}
