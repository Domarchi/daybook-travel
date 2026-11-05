import { movimientos, type CicloPersona, type Movimiento } from "./cycles.ts";
import type { Trip } from "./types.ts";

type PersonaPlanificable = CicloPersona & { id: string };
type ViajeExistente = Pick<
  Trip,
  "person_id" | "date" | "planned_date" | "direction"
>;

/**
 * Movimientos del turno que todavía no tienen viaje.
 *
 * Una reprogramación conserva la identidad de su fecha planificada y ocupa
 * también su fecha actual. Los anulados siguen reservando ambas fechas: volver
 * a planificar no debe deshacer una anulación ni crear otro viaje encima.
 *
 * Los registros antiguos o manuales sin planned_date reservan su fecha actual.
 * Si un registro antiguo ya se movió, su fecha original solo puede recuperarse
 * de su historial; no se infiere a partir del turno vigente.
 */
export function missingPlannedMovements(
  persona: PersonaPlanificable,
  hasta: string,
  trips: readonly ViajeExistente[],
): Movimiento[] {
  const ocupados = new Set<string>();
  for (const trip of trips) {
    if (trip.person_id !== persona.id) continue;
    ocupados.add(`${trip.planned_date ?? trip.date}|${trip.direction}`);
    ocupados.add(`${trip.date}|${trip.direction}`);
  }

  return movimientos(persona, hasta).filter(
    (paso) => !ocupados.has(`${paso.date}|${paso.direction}`),
  );
}
