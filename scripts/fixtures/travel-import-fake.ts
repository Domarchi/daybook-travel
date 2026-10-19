import type { ExcelSyncPayload } from "../../lib/excel-sync.ts";
import type { TravelAiQueueRpcClient, TravelImportMapRequest } from "../../lib/travel-ai-queue.ts";
export const FAKE_REQUEST_ID = "11111111-1111-4111-8111-111111111111";
export const PERSON_MATRIX = [
  ["codigoPersona", "nombreCompleto", "origen", "destino", "fechaInicio"],
  ["SYN-1", "Persona Sintética", "Santiago", "Calama", "2026-11-12"],
];
export const PREAMBLE_MATRIX = [
  ["Ana Pérez"], ["Código", "Trabajador", "Desde", "Hasta", "Inicio"], PERSON_MATRIX[1],
];
export const TRIP_MATRIX = [
  ["Código", "Fecha", "Dirección", "Desde", "Hasta"],
  ["SYN-1", "2026-11-12", "Subida", "Santiago", "Calama"],
];
export type FakeCall = { name: string; args: Record<string, unknown> };
/** Entirely in memory. Unknown RPCs fail closed; never instantiates Supabase. */
export function createImportFake(onCall: (call: FakeCall) => void = () => {}, malicious = false) {
  const calls: FakeCall[] = [];
  let request: TravelImportMapRequest | null = null;
  const client: TravelAiQueueRpcClient = { async rpc(name, args) {
    const call = structuredClone({ name, args });
    calls.push(call); onCall(call);
    if (name === "request_trip_import_mapping") {
      request = args.p_request as TravelImportMapRequest;
      return { data: FAKE_REQUEST_ID, error: null };
    }
    if (name === "get_trip_ai_request" && args.p_id === FAKE_REQUEST_ID && request) {
      const fields: Record<string, string> = { Código: "codigoPersona", "Código trabajador": "codigoPersona", Trabajador: "nombreCompleto", Colaborador: "nombreCompleto", Inicio: "fechaInicio", Fecha: "fechaViaje", Dirección: "sentido", Desde: "origen", Hasta: "destino" };
      return { data: { id: FAKE_REQUEST_ID, status: "done", diagnostic: null, proposal: { mapping: Object.fromEntries(request.headers.map(header => [header, malicious ? "campoSecreto" : fields[header] ?? null])) } }, error: null };
    }
    if (name === "sync_excel_batch") {
      const payload = args.p_payload as ExcelSyncPayload;
      if (!Array.isArray(payload.people) || !Array.isArray(payload.trips) || payload.people.length > 5000 || payload.trips.length > 5000) throw new Error("invalid synthetic batch");
      const result = (rows: { row_number: number }[]) => ({ inserted: rows.map(row => ({ row_number: row.row_number })), updated: [], unchanged: [], conflicts: [], errors: [] });
      return { data: { applied: true, sync_id: args.p_sync_id, idempotent: false, people: result(payload.people), trips: result(payload.trips) }, error: null };
    }
    throw new Error(`Unexpected fake RPC: ${name}`);
  }};
  return { client, calls };
}
