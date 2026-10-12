import { BAGGAGE_OPTIONS } from "./types.ts";

type RpcError = { message?: string } | null;
type RpcResponse = { data: unknown; error: RpcError };

/** Minimal Supabase surface, deliberately injectable for browser and unit use. */
export type TravelAiQueueRpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<RpcResponse>;
};

export const ACCIONES_IA_GUIADAS = ["requested_time", "date", "baggage"] as const;
export type AccionIaGuiada = (typeof ACCIONES_IA_GUIADAS)[number];

type CurrentTrip = Readonly<{ date: string; requested_time: string | null; baggage: string }>;
export type TravelGuidedRequest = Readonly<{
  schema: "travel-guided-v1";
  action: AccionIaGuiada;
  value: string;
  current: CurrentTrip;
}>;

export type TravelAiQueueStatus = "pending" | "claimed" | "done" | "failed" | "expired";
export type TravelAiQueueDiagnostic = "model_unavailable" | "timeout" | "model_response_invalid" | "expired" | "worker_error" | null;
export type TravelAiQueueProposal = Readonly<Partial<Record<AccionIaGuiada, string>>>;
export type TravelAiQueueRequest = Readonly<{
  id: string;
  status: TravelAiQueueStatus;
  proposal: TravelAiQueueProposal | null;
  diagnostic: TravelAiQueueDiagnostic;
}>;
export type TravelAiQueueReason = "entrada_invalida" | "no_autorizado" | "rate_limited" | "ia_no_disponible" | "respuesta_invalida" | "timeout";

export type TravelAiQueueResult<T> = ({ ok: true } & T) | { ok: false; reason: TravelAiQueueReason };

type RecordValue = Record<string, unknown>;
const BAGGAGE = new Set<string>(BAGGAGE_OPTIONS);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const STATUSES = new Set<TravelAiQueueStatus>(["pending", "claimed", "done", "failed", "expired"]);
const DIAGNOSTICS = new Set<Exclude<TravelAiQueueDiagnostic, null>>(["model_unavailable", "timeout", "model_response_invalid", "expired", "worker_error"]);

function record(value: unknown): RecordValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value as RecordValue : null;
}

function exactKeys(value: RecordValue, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

function validTime(value: unknown): value is string {
  return typeof value === "string" && TIME.test(value);
}

function validBaggage(value: unknown): value is string {
  return typeof value === "string" && BAGGAGE.has(value);
}

function validActionValue(action: unknown, value: unknown): action is AccionIaGuiada {
  return (action === "date" && validDate(value)) ||
    (action === "requested_time" && validTime(value)) ||
    (action === "baggage" && validBaggage(value));
}

/** Validates the exact, non-free-text shape accepted by the database queue. */
export function validarSolicitudIA(value: unknown): value is TravelGuidedRequest {
  const request = record(value);
  if (!request || !exactKeys(request, ["schema", "action", "value", "current"]) || request.schema !== "travel-guided-v1" ||
    !validActionValue(request.action, request.value)) return false;
  const current = record(request.current);
  return !!current && exactKeys(current, ["date", "requested_time", "baggage"]) &&
    validDate(current.date) && (current.requested_time === null || validTime(current.requested_time)) && validBaggage(current.baggage);
}

function validProposal(value: unknown): value is TravelAiQueueProposal {
  const proposal = record(value);
  if (!proposal) return false;
  const fields = Object.keys(proposal);
  return fields.length === 1 && validActionValue(fields[0], proposal[fields[0]]);
}

function mapError(error: RpcError): TravelAiQueueReason {
  const message = error?.message ?? "";
  if (/no_autorizado|acceso no autorizado/i.test(message)) return "no_autorizado";
  if (/rate_limited/i.test(message)) return "rate_limited";
  return "ia_no_disponible";
}

/** Enqueues a strictly guided request with the authenticated browser session. */
export async function solicitarPropuestaIA(
  client: TravelAiQueueRpcClient,
  input: unknown,
): Promise<TravelAiQueueResult<{ id: string }>> {
  const value = record(input);
  if (!value || typeof value.tripId !== "string" || !UUID.test(value.tripId) || !validarSolicitudIA(value.request)) {
    return { ok: false, reason: "entrada_invalida" };
  }
  const { data, error } = await client.rpc("request_trip_ai_proposal", {
    p_trip_id: value.tripId,
    p_request: value.request,
  });
  if (error) return { ok: false, reason: mapError(error) };
  return typeof data === "string" && UUID.test(data)
    ? { ok: true, id: data }
    : { ok: false, reason: "respuesta_invalida" };
}

/** Reads and sanitizes the only response fields the requester is allowed to see. */
export async function consultarPropuestaIA(
  client: TravelAiQueueRpcClient,
  id: unknown,
): Promise<TravelAiQueueResult<{ request: TravelAiQueueRequest }>> {
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, reason: "entrada_invalida" };
  const { data, error } = await client.rpc("get_trip_ai_request", { p_id: id });
  if (error) return { ok: false, reason: mapError(error) };
  const response = record(data);
  if (!response || typeof response.id !== "string" || response.id !== id || !STATUSES.has(response.status as TravelAiQueueStatus) ||
    !(response.diagnostic === null || DIAGNOSTICS.has(response.diagnostic as Exclude<TravelAiQueueDiagnostic, null>)) ||
    !(response.proposal === null || validProposal(response.proposal))) return { ok: false, reason: "respuesta_invalida" };
  if (response.status === "done" && !validProposal(response.proposal)) return { ok: false, reason: "respuesta_invalida" };
  if (response.status !== "done" && response.proposal !== null) return { ok: false, reason: "respuesta_invalida" };
  return {
    ok: true,
    request: {
      id: response.id,
      status: response.status as TravelAiQueueStatus,
      proposal: response.proposal as TravelAiQueueProposal | null,
      diagnostic: response.diagnostic as TravelAiQueueDiagnostic,
    },
  };
}

export type TravelAiQueueClock = Readonly<{ now(): number; sleep(milliseconds: number): Promise<void> }>;
const browserClock: TravelAiQueueClock = {
  now: () => Date.now(),
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

/** Polls the queue without a transport fallback; time is injectable for deterministic tests. */
export async function esperarPropuestaIA(
  client: TravelAiQueueRpcClient,
  id: string,
  options: Readonly<{ clock?: TravelAiQueueClock; intervalMs?: number; timeoutMs?: number }> = {},
): Promise<TravelAiQueueResult<{ request: TravelAiQueueRequest }>> {
  const clock = options.clock ?? browserClock;
  const intervalMs = options.intervalMs ?? 1_500;
  const timeoutMs = options.timeoutMs ?? 60_000;
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0 || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    return { ok: false, reason: "entrada_invalida" };
  }
  const startedAt = clock.now();
  for (;;) {
    const result = await consultarPropuestaIA(client, id);
    if (!result.ok || result.request.status === "done") return result;
    if (result.request.status === "failed" || result.request.status === "expired") return { ok: false, reason: "ia_no_disponible" };
    if (clock.now() - startedAt >= timeoutMs) return { ok: false, reason: "timeout" };
    await clock.sleep(Math.min(intervalMs, timeoutMs - (clock.now() - startedAt)));
  }
}
