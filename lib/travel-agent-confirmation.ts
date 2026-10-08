import { CAMPOS_PROPONIBLES, validarPropuestaTravel, type CampoProponible } from "./travel-agent-contract.ts";

export type CampoRevisionTravel = {
  key: CampoProponible;
  label: string;
  before: string;
  after: string;
};

export type PropuestaCanonicaTravel = Readonly<{
  key: CampoProponible;
  value: string | null;
}>;

export type ModeloConfirmacionTravel =
  | {
      kind: "ready";
      status: "pending_confirmation";
      requiresHumanConfirmation: true;
      canApply: false;
      fields: readonly CampoRevisionTravel[];
      canonicalProposal: readonly PropuestaCanonicaTravel[];
    }
  | {
      kind: "unavailable";
      diagnostic: "proposal_unavailable" | "proposal_invalid";
    };

export type ConfirmacionLocal = Readonly<{ confirmed: true }>;

const LABELS: Record<CampoProponible, string> = {
  date: "Fecha",
  requested_time: "Hora solicitada",
  baggage: "Equipaje",
  notes: "Observaciones",
};

const EMPTY_TIME = "Sin hora solicitada";

function esRegistro(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function leerActual(value: unknown): Record<CampoProponible, string | null> | null {
  if (!esRegistro(value)) return null;
  const current: Record<CampoProponible, string | null> = {
    date: value.date as string,
    requested_time: value.requested_time as string | null,
    baggage: value.baggage as string,
    notes: value.notes as string,
  };
  const valid = typeof current.date === "string" &&
    (typeof current.requested_time === "string" || current.requested_time === null) &&
    typeof current.baggage === "string" && typeof current.notes === "string";
  return valid ? current : null;
}

function leerPropuesta(value: unknown): Record<string, unknown> | null {
  if (!esRegistro(value)) return null;
  const proposal: Record<string, unknown> = {};
  for (const field of CAMPOS_PROPONIBLES) {
    if (Object.hasOwn(value, field)) proposal[field] = value[field];
  }
  return proposal;
}

function mostrar(value: string | null): string {
  return value ?? EMPTY_TIME;
}

/** Construye una vista local, sin autoridad ni datos fuera de la allowlist B1/B2. */
export function crearModeloConfirmacionTravel(value: unknown): ModeloConfirmacionTravel {
  if (!esRegistro(value) || value.result === undefined || value.current === undefined) {
    return { kind: "unavailable", diagnostic: "proposal_unavailable" };
  }
  const result = value.result;
  const current = leerActual(value.current);
  if (!esRegistro(result) || result.status !== "pending_confirmation" ||
    result.requiresHumanConfirmation !== true || !current) {
    return { kind: "unavailable", diagnostic: "proposal_unavailable" };
  }

  const proposal = leerPropuesta(result.proposal);
  if (!proposal) return { kind: "unavailable", diagnostic: "proposal_invalid" };
  const validation = validarPropuestaTravel(proposal);
  if (!validation.ok) return { kind: "unavailable", diagnostic: "proposal_invalid" };

  const canonicalProposal = CAMPOS_PROPONIBLES.flatMap((key) => {
    if (!Object.hasOwn(validation.propuesta, key)) return [];
    return [Object.freeze({ key, value: validation.propuesta[key] ?? null })];
  });
  if (canonicalProposal.length === 0) return { kind: "unavailable", diagnostic: "proposal_invalid" };
  const fields = canonicalProposal.map((field) => Object.freeze({
    key: field.key,
    label: LABELS[field.key],
    before: mostrar(current[field.key]),
    after: mostrar(field.value),
  }));

  return Object.freeze({
    kind: "ready" as const,
    status: "pending_confirmation" as const,
    requiresHumanConfirmation: true as const,
    canApply: false as const,
    fields: Object.freeze(fields),
    canonicalProposal: Object.freeze(canonicalProposal),
  });
}

/** Identidad determinista de la propuesta allowlisted; no incluye datos extra ni sensibles. */
export function crearIdentidadPropuestaConfirmacion(model: Extract<ModeloConfirmacionTravel, { kind: "ready" }>): string {
  return JSON.stringify(model.canonicalProposal.map((field) => [field.key, field.value]));
}

/** Guarda una sola confirmación humana local; no aplica viajes ni transporta propuestas. */
export class ControlConfirmacionHumana {
  #confirmed = false;
  #submitted = false;

  setConfirmed(confirmed: boolean): void {
    if (!this.#submitted) this.#confirmed = confirmed;
  }

  get canApply(): boolean {
    return this.#confirmed && !this.#submitted;
  }

  confirm(): ConfirmacionLocal | null {
    if (!this.canApply) return null;
    this.#submitted = true;
    return Object.freeze({ confirmed: true as const });
  }
}
