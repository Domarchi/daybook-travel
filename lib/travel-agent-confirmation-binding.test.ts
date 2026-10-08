import assert from "node:assert/strict";
import test from "node:test";

const { crearVinculoConfirmacionTravel } = await import("./travel-agent-confirmation.ts");

const model = (requested_time: string) => ({
  kind: "ready" as const, status: "pending_confirmation" as const, requiresHumanConfirmation: true as const, canApply: false as const,
  fields: [], canonicalProposal: [{ key: "requested_time" as const, value: requested_time }],
});

test("B3 vincula confirmación a viaje, versión y propuesta, y renueva la llave cuando se reemplaza", () => {
  const keys = ["proposal_first", "proposal_second"];
  const makeKey = () => keys.shift()!;
  const first = crearVinculoConfirmacionTravel(model("09:30"), { id: "trip-1", version: 7 }, makeKey);
  const replacement = crearVinculoConfirmacionTravel(model("10:45"), { id: "trip-1", version: 7 }, makeKey, first);

  assert.deepEqual(first, {
    tripId: "trip-1", expectedVersion: 7,
    proposalIdentity: "[[\"requested_time\",\"09:30\"]]", idempotencyKey: "proposal_first",
  });
  assert.deepEqual(replacement, {
    tripId: "trip-1", expectedVersion: 7,
    proposalIdentity: "[[\"requested_time\",\"10:45\"]]", idempotencyKey: "proposal_second",
  });
});

test("B3 conserva la llave sólo para el reintento exacto y la renueva al cambiar versión", () => {
  let generated = 0;
  const makeKey = () => `proposal_${++generated}`;
  const first = crearVinculoConfirmacionTravel(model("09:30"), { id: "trip-1", version: 7 }, makeKey);
  const replay = crearVinculoConfirmacionTravel(model("09:30"), { id: "trip-1", version: 7 }, makeKey, first);
  const stale = crearVinculoConfirmacionTravel(model("09:30"), { id: "trip-1", version: 8 }, makeKey, first);

  assert.equal(replay.idempotencyKey, first.idempotencyKey);
  assert.equal(stale.idempotencyKey, "proposal_2");
  assert.equal(generated, 2);
});
