import { BAGGAGE_OPTIONS } from "./types.ts";
import { PERSON_EXCEL_FIELDS, TRIP_EXCEL_FIELDS, type ExcelRow, type ExcelSyncEntity } from "./excel-sync.ts";

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

export type TravelImportMapRequest = Readonly<{
  schema: "travel-import-map-v1";
  entity: ExcelSyncEntity;
  headers: readonly string[];
  samples: readonly (readonly string[])[];
}>;
export type TravelImportMapping = Readonly<Record<string, string | null>>;

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

const MAP_EXCLUDED = new Set(["accion", "errorSincronizacion", "actualizadoEn"]);
function fieldsFor(entity: ExcelSyncEntity): readonly string[] {
  return (entity === "people" ? PERSON_EXCEL_FIELDS : TRIP_EXCEL_FIELDS).filter((field) => !MAP_EXCLUDED.has(field));
}

function validImportRequest(value: unknown): value is TravelImportMapRequest {
  const request = record(value);
  if (!request || !exactKeys(request, ["schema", "entity", "headers", "samples"]) || request.schema !== "travel-import-map-v1" ||
    (request.entity !== "people" && request.entity !== "trips") || !Array.isArray(request.headers) ||
    request.headers.length < 1 || request.headers.length > 40 || !Array.isArray(request.samples) || request.samples.length > 3) return false;
  const headers = request.headers;
  if (!headers.every((header) => typeof header === "string" && header.length >= 1 && header.length <= 80) || new Set(headers).size !== headers.length) return false;
  return request.samples.every((sample) => Array.isArray(sample) && sample.length === headers.length && sample.every((cell) => typeof cell === "string" && cell.length <= 24));
}

/** Converts a sample cell to its shape before it can leave the browser. */
export function enmascararMuestra(value: unknown): string {
  const text = value instanceof Date && !Number.isNaN(value.getTime())
    ? `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`
    : String(value ?? "");
  return Array.from(text).map((char) => {
    if (/\p{L}/u.test(char)) return char === char.toLocaleUpperCase("es-CL") && char !== char.toLocaleLowerCase("es-CL") ? "X" : "x";
    return /\p{N}/u.test(char) ? "9" : char;
  }).join("").slice(0, 24);
}

/** Builds the only import payload allowed into the queue: headers and masked shapes. */
export function construirSolicitudMapeo(input: { entity: ExcelSyncEntity; headers: string[]; rows: ExcelRow[] }): TravelImportMapRequest | null {
  const request = {
    schema: "travel-import-map-v1" as const,
    entity: input.entity,
    headers: [...input.headers],
    samples: input.rows.slice(0, 3).map((row) => input.headers.map((header) => enmascararMuestra(row[header]))),
  };
  return validImportRequest(request) ? request : null;
}

/** Validates exact source keys, destination allowlist and one-to-one mapping. */
export function validarMapeo(context: Pick<TravelImportMapRequest, "entity" | "headers">, value: unknown): value is { mapping: TravelImportMapping } {
  const proposal = record(value);
  if (!proposal || !exactKeys(proposal, ["mapping"])) return false;
  const mapping = record(proposal.mapping);
  if (!mapping || !exactKeys(mapping, context.headers)) return false;
  const allowed = new Set(fieldsFor(context.entity));
  const used = new Set<string>();
  for (const header of context.headers) {
    const field = mapping[header];
    if (field === null) continue;
    if (typeof field !== "string" || !allowed.has(field) || used.has(field)) return false;
    used.add(field);
  }
  return true;
}

/** Renames selected columns without changing source rows or carrying ignored data. */
export function aplicarMapeo(rows: ExcelRow[], mapping: TravelImportMapping): ExcelRow[] {
  return rows.map((row) => {
    const mapped: ExcelRow = {};
    if (Object.hasOwn(row, "row_number")) mapped.row_number = row.row_number;
    for (const [header, field] of Object.entries(mapping)) {
      if (field !== null && Object.hasOwn(row, header)) mapped[field] = row[header];
    }
    return mapped;
  });
}

export async function solicitarMapeoImportacion(client: TravelAiQueueRpcClient, request: unknown): Promise<TravelAiQueueResult<{ id: string }>> {
  if (!validImportRequest(request)) return { ok: false, reason: "entrada_invalida" };
  const { data, error } = await client.rpc("request_trip_import_mapping", { p_request: request });
  if (error) return { ok: false, reason: mapError(error) };
  return typeof data === "string" && UUID.test(data) ? { ok: true, id: data } : { ok: false, reason: "respuesta_invalida" };
}

export async function consultarMapeoImportacion(client: TravelAiQueueRpcClient, id: unknown, context: Pick<TravelImportMapRequest, "entity" | "headers">): Promise<TravelAiQueueResult<{ request: TravelAiQueueRequest & { proposal: { mapping: TravelImportMapping } | null } }>> {
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, reason: "entrada_invalida" };
  const { data, error } = await client.rpc("get_trip_ai_request", { p_id: id });
  if (error) return { ok: false, reason: mapError(error) };
  const response = record(data);
  if (!response || response.id !== id || !STATUSES.has(response.status as TravelAiQueueStatus) ||
    !(response.diagnostic === null || DIAGNOSTICS.has(response.diagnostic as Exclude<TravelAiQueueDiagnostic, null>)) ||
    !(response.proposal === null || validarMapeo(context, response.proposal)) ||
    (response.status === "done" && !validarMapeo(context, response.proposal)) || (response.status !== "done" && response.proposal !== null)) return { ok: false, reason: "respuesta_invalida" };
  return { ok: true, request: { id, status: response.status as TravelAiQueueStatus, proposal: response.proposal as { mapping: TravelImportMapping } | null, diagnostic: response.diagnostic as TravelAiQueueDiagnostic } };
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

/** Same bounded polling policy, with import-specific response validation. */
export async function esperarMapeoImportacion(
  client: TravelAiQueueRpcClient,
  id: string,
  context: Pick<TravelImportMapRequest, "entity" | "headers">,
  options: Readonly<{ clock?: TravelAiQueueClock; intervalMs?: number; timeoutMs?: number }> = {},
): Promise<TravelAiQueueResult<{ request: TravelAiQueueRequest & { proposal: { mapping: TravelImportMapping } | null } }>> {
  const clock = options.clock ?? browserClock;
  const intervalMs = options.intervalMs ?? 1_500;
  const timeoutMs = options.timeoutMs ?? 90_000;
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0 || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) return { ok: false, reason: "entrada_invalida" };
  const startedAt = clock.now();
  for (;;) {
    const result = await consultarMapeoImportacion(client, id, context);
    if (!result.ok || result.request.status === "done") return result;
    if (result.request.status === "failed" || result.request.status === "expired") return { ok: false, reason: "ia_no_disponible" };
    if (clock.now() - startedAt >= timeoutMs) return { ok: false, reason: "timeout" };
    await clock.sleep(Math.min(intervalMs, timeoutMs - (clock.now() - startedAt)));
  }
}
