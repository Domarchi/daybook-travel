import { validarPropuestaTravel, type PropuestaTravel } from "./travel-agent-contract.ts";

export const FIXTURE_B2_SINTETICO = "travel-b2-synthetic-v1" as const;

export type DiagnosticoB2 = {
  code:
    | "input_field_not_allowed"
    | "input_invalid"
    | "endpoint_not_allowed"
    | "transport_error"
    | "timeout"
    | "http_error"
    | "model_response_invalid";
};

export type ResultadoInferenciaPrivada =
  | {
      status: "pending_confirmation";
      requiresHumanConfirmation: true;
      proposal: PropuestaTravel;
    }
  | {
      status: "failed" | "invalid";
      diagnostic: DiagnosticoB2;
    };

type RespuestaFetch = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

type FetchInyectado = (
  url: string,
  init: {
    method: "POST";
    headers: { "content-type": "application/json" };
    body: string;
    signal: AbortSignal;
  },
) => Promise<RespuestaFetch>;

type SolicitudSintetica = {
  fixture: typeof FIXTURE_B2_SINTETICO;
  requestText: string;
  context: {
    date: string;
    requested_time: string | null;
    baggage: string;
    notes: string;
  };
};

const CAMPOS_ENTRADA = new Set(["fixture", "requestText", "context"]);
const CAMPOS_CONTEXTO = new Set(["date", "requested_time", "baggage", "notes"]);
const CAMPOS_ENDPOINT = new Set(["baseUrl", "path", "timeoutMs"]);
const CAMPO_SINTETICO = "SYNTHETIC:";

function esRegistro(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function tieneSoloCampos(value: Record<string, unknown>, allowlist: Set<string>): boolean {
  return Object.keys(value).every((field) => allowlist.has(field));
}

function congelar<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) congelar(nested);
    Object.freeze(value);
  }
  return value;
}

function diagnostico(status: "failed" | "invalid", code: DiagnosticoB2["code"]): ResultadoInferenciaPrivada {
  return congelar({ status, diagnostic: { code } });
}

function propuestaPendiente(proposal: PropuestaTravel): ResultadoInferenciaPrivada {
  return congelar({
    status: "pending_confirmation",
    requiresHumanConfirmation: true,
    proposal: { ...proposal },
  });
}

function validarSolicitudSintetica(value: unknown): SolicitudSintetica | null {
  if (!esRegistro(value) || !tieneSoloCampos(value, CAMPOS_ENTRADA)) return null;
  if (value.fixture !== FIXTURE_B2_SINTETICO || typeof value.requestText !== "string" ||
    !value.requestText.startsWith(CAMPO_SINTETICO) || value.requestText.length > 500 ||
    !esRegistro(value.context) || !tieneSoloCampos(value.context, CAMPOS_CONTEXTO)) {
    return null;
  }

  for (const field of CAMPOS_CONTEXTO) {
    if (!Object.hasOwn(value.context, field)) return null;
  }
  const contextValidation = validarPropuestaTravel(value.context);
  if (!contextValidation.ok) return null;

  return {
    fixture: FIXTURE_B2_SINTETICO,
    requestText: value.requestText,
    context: {
      date: value.context.date as string,
      requested_time: value.context.requested_time as string | null,
      baggage: value.context.baggage as string,
      notes: value.context.notes as string,
    },
  };
}

function resolverEndpoint(value: unknown): { url: string; timeoutMs: number } | null {
  if (!esRegistro(value) || !tieneSoloCampos(value, CAMPOS_ENDPOINT) ||
    typeof value.baseUrl !== "string" || typeof value.path !== "string" ||
    typeof value.timeoutMs !== "number" || !Number.isSafeInteger(value.timeoutMs) ||
    value.timeoutMs < 1 || value.timeoutMs > 10_000 ||
    !value.path.startsWith("/") || value.path.startsWith("//") ||
    value.path.includes("?") || value.path.includes("#") || value.path.includes("..")) {
    return null;
  }

  try {
    const base = new URL(value.baseUrl);
    const loopback = base.hostname === "127.0.0.1" || base.hostname === "[::1]";
    if (!loopback || (base.protocol !== "http:" && base.protocol !== "https:") ||
      base.username || base.password || base.pathname !== "/" || base.search || base.hash) {
      return null;
    }
    return { url: `${base.origin}${value.path}`, timeoutMs: value.timeoutMs };
  } catch {
    return null;
  }
}

/**
 * Adaptador B2 sin autoridad: sólo transporta un fixture sintético, acepta la
 * allowlist de propuesta y nunca confirma ni aplica una mutación de viaje.
 */

const AGOTADO = Symbol("timeout");

async function esperarHastaLimite<T>(operation: Promise<T>, controller: AbortController, deadline: number): Promise<T | typeof AGOTADO> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    controller.abort();
    return AGOTADO;
  }
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T | typeof AGOTADO>([
      operation,
      new Promise<typeof AGOTADO>((resolve) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          resolve(AGOTADO);
        }, remaining);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function ejecutarInferenciaPrivada(value: unknown): Promise<ResultadoInferenciaPrivada> {
  if (!esRegistro(value) || !Object.hasOwn(value, "input") || !Object.hasOwn(value, "endpoint") ||
    !Object.hasOwn(value, "fetch") || Object.keys(value).some((field) =>
      field !== "input" && field !== "endpoint" && field !== "fetch",
    )) {
    return diagnostico("invalid", "input_invalid");
  }

  if (esRegistro(value.input) && !tieneSoloCampos(value.input, CAMPOS_ENTRADA)) {
    return diagnostico("invalid", "input_field_not_allowed");
  }
  const input = validarSolicitudSintetica(value.input);
  if (!input) return diagnostico("invalid", "input_invalid");

  const endpoint = resolverEndpoint(value.endpoint);
  if (!endpoint) return diagnostico("failed", "endpoint_not_allowed");
  if (typeof value.fetch !== "function") return diagnostico("failed", "transport_error");

  const controller = new AbortController();
  const deadline = Date.now() + endpoint.timeoutMs;
  try {
    const response = await esperarHastaLimite(
      (value.fetch as FetchInyectado)(endpoint.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal,
      }),
      controller,
      deadline,
    );
    if (response === AGOTADO) return diagnostico("failed", "timeout");
    if (!response.ok || !Number.isInteger(response.status) || response.status < 200 || response.status > 299) {
      return diagnostico("failed", "http_error");
    }

    let text: string;
    try {
      const body = await esperarHastaLimite(response.text(), controller, deadline);
      if (body === AGOTADO) return diagnostico("failed", "timeout");
      text = body;
    } catch {
      return diagnostico("invalid", "model_response_invalid");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return diagnostico("invalid", "model_response_invalid");
    }
    const validation = validarPropuestaTravel(parsed);
    if (!validation.ok) return diagnostico("invalid", "model_response_invalid");
    return propuestaPendiente(validation.propuesta);
  } catch {
    return diagnostico("failed", "transport_error");
  }
}
