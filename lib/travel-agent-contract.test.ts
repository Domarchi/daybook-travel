import assert from "node:assert/strict";
import test from "node:test";

const modulePath = process.env.TRAVEL_AGENT_CONTRACT_MODULE ?? "./travel-agent-contract.ts";
const { aplicarPropuestaTravel, validarPropuestaTravel } = await import(modulePath);

const viaje = () => ({
  id: "trip-local-001",
  version: 7,
  date: "2026-11-11",
  requested_time: "08:00",
  baggage: "Mochila",
  notes: "Cambio coordinado",
});

const propuestaPermitida = () => ({
  date: "2026-11-12",
  requested_time: "09:30",
  baggage: "Maleta en bodega",
  notes: "Reprogramación solicitada",
});

const validar = (propuesta: unknown) => {
  const resultado = validarPropuestaTravel(propuesta);
  assert.equal(resultado.ok, true, JSON.stringify(resultado));
  if (!resultado.ok) throw new Error("La propuesta permitida debe validarse.");
  return resultado.propuesta;
};

const solicitud = (extra: Record<string, unknown> = {}) => {
  const trip = viaje();
  return {
    trip,
    tripId: trip.id,
    tripVersion: trip.version,
    propuesta: validar(propuestaPermitida()),
    idempotencyKey: "proposal_abc12345",
    confirmed: true,
    authorize: ({ tripId, tripVersion }: { tripId: string; tripVersion: number }) =>
      tripId === trip.id && tripVersion === trip.version,
    receipts: [],
    ...extra,
  };
};

test("A: rechaza explícitamente campos prohibidos y toda clave desconocida", () => {
  for (const campo of [
    "person_id", "direction", "origin", "destination", "pnr", "status", "flight",
    "amount", "purchase", "emission", "send", "signature", "role", "arbitrary_key",
  ]) {
    const resultado = validarPropuestaTravel({ ...propuestaPermitida(), [campo]: "no autorizado" });
    assert.deepEqual(resultado, { ok: false, reason: "campo_no_permitido", field: campo });
  }
});

test("B: no aplica una propuesta permitida sin confirmación, versión o llave idempotente", () => {
  for (const [nombre, extra, reason] of [
    ["sin confirmación", { confirmed: false }, "confirmacion_requerida"],
    ["sin versión", { tripVersion: undefined }, "version_requerida"],
    ["sin llave", { idempotencyKey: undefined }, "idempotency_key_requerida"],
    ["sin autorización", { authorize: () => false }, "no_autorizado"],
  ] as const) {
    const entrada = solicitud(extra);
    const resultado = aplicarPropuestaTravel(entrada);
    assert.equal(resultado.ok, false, nombre);
    assert.equal(resultado.reason, reason, nombre);
    assert.deepEqual(resultado.trip, entrada.trip, nombre);
    assert.deepEqual(resultado.receipts, [], nombre);
  }
});

test("C: una confirmación autorizada aplica sólo la allowlist y emite un receipt local sin PII", () => {
  const entrada = solicitud();
  const resultado = aplicarPropuestaTravel(entrada);

  assert.equal(resultado.ok, true);
  assert.equal(resultado.replayed, false);
  assert.deepEqual(resultado.trip, {
    ...entrada.trip,
    version: 8,
    ...propuestaPermitida(),
  });
  assert.deepEqual(resultado.receipts, [{
    kind: "travel_proposal_applied",
    idempotencyKey: "proposal_abc12345",
    tripVersion: 8,
    changedFields: ["date", "requested_time", "baggage", "notes"],
  }]);
  assert.doesNotMatch(JSON.stringify(resultado.receipts[0]), /trip-local-001|Reprogramación|Maleta/);
});

test("D: replay y versión obsoleta no duplican ni mutan", () => {
  const primero = aplicarPropuestaTravel(solicitud());
  assert.equal(primero.ok, true);

  const replay = aplicarPropuestaTravel(solicitud({
    trip: primero.trip,
    tripVersion: 7,
    receipts: primero.receipts,
  }));
  assert.equal(replay.ok, true);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.trip, primero.trip);
  assert.deepEqual(replay.receipts, primero.receipts);

  const stale = aplicarPropuestaTravel(solicitud({
    trip: primero.trip,
    tripVersion: 7,
    idempotencyKey: "proposal_stale001",
    receipts: primero.receipts,
  }));
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, "version_obsoleta");
  assert.deepEqual(stale.trip, primero.trip);
  assert.deepEqual(stale.receipts, primero.receipts);
});


test("E: normaliza receipts previos en rechazo y replay sin filtrar claves o valores extras", () => {
  const receiptPreexistente = {
    kind: "travel_proposal_applied" as const,
    idempotencyKey: "proposal_prior001",
    tripVersion: 7,
    changedFields: ["notes"] as const,
    extraSensitive: "synthetic-private-value",
  };
  const receiptCanonico = {
    kind: "travel_proposal_applied",
    idempotencyKey: "proposal_prior001",
    tripVersion: 7,
    changedFields: ["notes"],
  };

  const entradaRechazada = solicitud({ confirmed: false, receipts: [receiptPreexistente] });
  const rechazo = aplicarPropuestaTravel(entradaRechazada);
  assert.equal(rechazo.ok, false);
  assert.equal(rechazo.reason, "confirmacion_requerida");
  assert.deepEqual(rechazo.receipts, [receiptCanonico]);
  assert.notStrictEqual(rechazo.receipts, entradaRechazada.receipts);
  assert.notStrictEqual(rechazo.receipts[0], receiptPreexistente);
  assert.equal("extraSensitive" in rechazo.receipts[0], false);
  assert.doesNotMatch(JSON.stringify(rechazo.receipts), /synthetic-private-value/);

  const entradaReplay = solicitud({
    idempotencyKey: receiptPreexistente.idempotencyKey,
    receipts: [receiptPreexistente],
  });
  const replay = aplicarPropuestaTravel(entradaReplay);
  assert.equal(replay.ok, true);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.receipts, [receiptCanonico]);
  assert.notStrictEqual(replay.receipts, entradaReplay.receipts);
  assert.notStrictEqual(replay.receipts[0], receiptPreexistente);
  assert.equal("extraSensitive" in replay.receipts[0], false);
  assert.doesNotMatch(JSON.stringify(replay.receipts), /synthetic-private-value/);

  assert.equal(receiptPreexistente.extraSensitive, "synthetic-private-value");
  assert.deepEqual(entradaRechazada.receipts, [receiptPreexistente]);
  assert.deepEqual(entradaReplay.receipts, [receiptPreexistente]);
});
