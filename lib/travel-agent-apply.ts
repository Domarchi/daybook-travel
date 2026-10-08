import {
  CAMPOS_PROPONIBLES,
  validarPropuestaTravel,
  type CampoProponible,
  type PropuestaTravel,
  type ViajeLocal,
} from "./travel-agent-contract.ts";

type RpcError = { message?: string } | null;
type RpcResponse = { data: unknown; error: RpcError };

/** The minimal client surface used by the B2 adapter (and simple local fakes). */
export type TravelApplyRpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<RpcResponse>;
};

export type TravelApplyInput = {
  tripId: string;
  expectedVersion: number;
  proposal: unknown;
  proposalIdentity: unknown;
  idempotencyKey: string;
  confirmed: true;
};

export type TravelApplyResult =
  | { ok: true; replayed: boolean; trip: ViajeLocal; receipt: { idempotencyKey: string; proposalIdentity: PropuestaTravel; tripVersion: number } }
  | { ok: false; reason: string };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function canonicalProposal(value: unknown): PropuestaTravel | null {
  const checked = validarPropuestaTravel(value);
  return checked.ok ? checked.propuesta : null;
}

function canonicalProposalIdentity(proposal: PropuestaTravel): string {
  return JSON.stringify(CAMPOS_PROPONIBLES.flatMap((field) =>
    Object.hasOwn(proposal, field) ? [[field, proposal[field] ?? null]] : [],
  ));
}

function readTrip(value: unknown): ViajeLocal | null {
  const item = record(value);
  if (!item || typeof item.id !== "string" || !Number.isSafeInteger(item.version) ||
    typeof item.date !== "string" || (typeof item.requested_time !== "string" && item.requested_time !== null) ||
    typeof item.baggage !== "string" || typeof item.notes !== "string") return null;
  return {
    id: item.id, version: item.version as number, date: item.date,
    requested_time: item.requested_time as string | null, baggage: item.baggage, notes: item.notes,
  };
}

function reasonFrom(error: RpcError): string {
  const message = error?.message ?? "apply_failed";
  return /version_obsoleta/i.test(message) ? "version_obsoleta"
    : /no_autorizado|acceso no autorizado/i.test(message) ? "no_autorizado"
    : /confirmacion_requerida/i.test(message) ? "confirmacion_requerida"
    : "apply_failed";
}

/**
 * Thin B2 adapter. It deliberately has no cache write: callers replace their
 * local trip only after the authoritative RPC has returned a canonical trip.
 */
export async function aplicarPropuestaTravelRemota(client: TravelApplyRpcClient, input: unknown): Promise<TravelApplyResult> {
  const value = record(input);
  if (!value || typeof value.tripId !== "string" || typeof value.expectedVersion !== "number" || !Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 0 ||
    typeof value.idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(value.idempotencyKey) ||
    value.confirmed !== true) return { ok: false, reason: "entrada_invalida" };
  const proposal = canonicalProposal(value.proposal);
  if (!proposal) {
    const invalid = validarPropuestaTravel(value.proposal);
    return { ok: false, reason: "reason" in invalid ? invalid.reason : "propuesta_invalida" };
  }
  const proposalIdentity = canonicalProposal(value.proposalIdentity);
  const identityMatches = typeof value.proposalIdentity === "string"
    ? value.proposalIdentity === canonicalProposalIdentity(proposal)
    : !!proposalIdentity && JSON.stringify(proposal) === JSON.stringify(proposalIdentity);
  if (!identityMatches) {
    return { ok: false, reason: "identidad_propuesta_invalida" };
  }

  const { data, error } = await client.rpc("apply_trip_proposal", {
    p_trip_id: value.tripId,
    p_expected_version: value.expectedVersion,
    p_proposal: proposal,
    p_proposal_identity: proposal,
    p_idempotency_key: value.idempotencyKey,
    p_confirmed: true,
  });
  if (error) return { ok: false, reason: reasonFrom(error) };

  const response = record(data);
  const trip = readTrip(response?.trip);
  const receipt = record(response?.receipt);
  const receiptIdentity = canonicalProposal(receipt?.proposal_identity);
  if (!response || response.ok !== true || typeof response.replayed !== "boolean" || !trip || !receipt ||
    receipt.idempotency_key !== value.idempotencyKey || !Number.isSafeInteger(receipt.applied_version) ||
    receipt.applied_version !== trip.version || !receiptIdentity ||
    JSON.stringify(receiptIdentity) !== JSON.stringify(proposal)) {
    return { ok: false, reason: "respuesta_invalida" };
  }
  return {
    ok: true, replayed: response.replayed, trip,
    receipt: { idempotencyKey: receipt.idempotency_key, proposalIdentity: receiptIdentity, tripVersion: receipt.applied_version as number },
  };
}

export const CAMPOS_APLICABLES_TRAVEL: readonly CampoProponible[] = CAMPOS_PROPONIBLES;
