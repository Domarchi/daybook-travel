import assert from "node:assert/strict";
import test from "node:test";

const { aplicarPropuestaTravelRemota } = await import("./travel-agent-apply.ts");

const input = () => ({
  tripId: "4c83993e-2cda-45d5-a2db-0a719c84d34c",
  expectedVersion: 7,
  proposal: { requested_time: "09:30", notes: "Cambio confirmado" },
  proposalIdentity: "[[\"requested_time\",\"09:30\"],[\"notes\",\"Cambio confirmado\"]]",
  idempotencyKey: "proposal_abc12345",
  confirmed: true as const,
});

test("B2 adapta sólo el contrato canónico al RPC y devuelve sólo su salida canónica", async () => {
  let call: unknown;
  const result = await aplicarPropuestaTravelRemota({
    async rpc(name: string, args: unknown) {
      call = { name, args };
      return {
        data: {
          ok: true, replayed: false,
          trip: { id: input().tripId, version: 8, date: "2026-11-12", requested_time: "09:30", baggage: "Mochila", notes: "Cambio confirmado", pnr: "never-crosses" },
          receipt: { idempotency_key: "proposal_abc12345", proposal_identity: { requested_time: "09:30", notes: "Cambio confirmado" }, applied_version: 8, private: "never-crosses" },
        }, error: null,
      };
    },
  }, { ...input(), ignored: "never-crosses" });

  assert.deepEqual(call, {
    name: "apply_trip_proposal",
    args: {
      p_trip_id: input().tripId,
      p_expected_version: 7,
      p_proposal: input().proposal,
      p_proposal_identity: input().proposal,
      p_idempotency_key: "proposal_abc12345",
      p_confirmed: true,
    },
  });
  assert.deepEqual(result, {
    ok: true, replayed: false,
    trip: { id: input().tripId, version: 8, date: "2026-11-12", requested_time: "09:30", baggage: "Mochila", notes: "Cambio confirmado" },
    receipt: { idempotencyKey: "proposal_abc12345", proposalIdentity: { requested_time: "09:30", notes: "Cambio confirmado" }, tripVersion: 8 },
  });
  assert.doesNotMatch(JSON.stringify(result), /never-crosses/);
});

test("B2 no llama al RPC con una propuesta que contiene campos fuera de B1", async () => {
  let called = false;
  const result = await aplicarPropuestaTravelRemota({ async rpc() { called = true; return { data: null, error: null }; } }, {
    ...input(), proposal: { date: "2026-11-13", pnr: "forbidden" }, proposalIdentity: "bad",
  });
  assert.deepEqual(result, { ok: false, reason: "campo_no_permitido" });
  assert.equal(called, false);
});

test("B2 conserva el snapshot local ante un conflicto de versión: no hay mutación optimista", async () => {
  const snapshot = { id: input().tripId, version: 7, date: "2026-11-12", requested_time: "08:00", baggage: "Mochila", notes: "Antes" };
  const result = await aplicarPropuestaTravelRemota({ async rpc() { return { data: null, error: { message: "version_obsoleta" } }; } }, input());
  assert.deepEqual(result, { ok: false, reason: "version_obsoleta" });
  assert.deepEqual(snapshot, { id: input().tripId, version: 7, date: "2026-11-12", requested_time: "08:00", baggage: "Mochila", notes: "Antes" });
});

test("B2 no invoca el RPC si falta una versión positiva o la llave idempotente es inválida", async () => {
  let calls = 0;
  const client = { async rpc() { calls += 1; return { data: null, error: null }; } };

  assert.deepEqual(await aplicarPropuestaTravelRemota(client, { ...input(), expectedVersion: -1 }), {
    ok: false, reason: "entrada_invalida",
  });
  assert.deepEqual(await aplicarPropuestaTravelRemota(client, { ...input(), idempotencyKey: "bad key" }), {
    ok: false, reason: "entrada_invalida",
  });
  assert.equal(calls, 0);
});
