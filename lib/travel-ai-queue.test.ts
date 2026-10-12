import assert from "node:assert/strict";
import test from "node:test";

const {
  solicitarPropuestaIA,
  consultarPropuestaIA,
  esperarPropuestaIA,
} = await import("./travel-ai-queue.ts");

const tripId = "4c83993e-2cda-45d5-a2db-0a719c84d34c";
const request = () => ({
  schema: "travel-guided-v1",
  action: "requested_time",
  value: "09:30",
  current: { date: "2026-11-12", requested_time: "08:00", baggage: "Mochila" },
});

test("la cola sólo envía solicitudes guided-v1 exactas", async () => {
  let call: unknown;
  const result = await solicitarPropuestaIA({
    async rpc(name: string, args: unknown) {
      call = { name, args };
      return { data: "5c83993e-2cda-45d5-a2db-0a719c84d34c", error: null };
    },
  }, { tripId, request: request() });

  assert.deepEqual(call, {
    name: "request_trip_ai_proposal",
    args: { p_trip_id: tripId, p_request: request() },
  });
  assert.deepEqual(result, { ok: true, id: "5c83993e-2cda-45d5-a2db-0a719c84d34c" });
});

test("la cola falla cerrada antes del RPC para claves extra, acciones, valores y texto libre", async () => {
  let calls = 0;
  const client = { async rpc() { calls += 1; return { data: null, error: null }; } };
  const cases = [
    { ...request(), extra: true },
    { ...request(), action: "notes" },
    { ...request(), value: "25:99" },
    { ...request(), value: "texto libre no permitido" },
    { ...request(), current: { ...request().current, notes: "prohibido" } },
  ];
  for (const invalid of cases) {
    assert.deepEqual(await solicitarPropuestaIA(client, { tripId, request: invalid }), {
      ok: false, reason: "entrada_invalida",
    });
  }
  assert.equal(calls, 0);
});

test("la consulta sólo entrega una propuesta de una clave guiada y canónica", async () => {
  const result = await consultarPropuestaIA({
    async rpc(name: string, args: unknown) {
      assert.equal(name, "get_trip_ai_request");
      assert.deepEqual(args, { p_id: tripId });
      return {
        data: {
          id: tripId, status: "done", proposal: { requested_time: "09:30" }, diagnostic: null,
          private: "no-debe-salir",
        }, error: null,
      };
    },
  }, tripId);
  assert.deepEqual(result, {
    ok: true,
    request: { id: tripId, status: "done", proposal: { requested_time: "09:30" }, diagnostic: null },
  });
});

test("la consulta rechaza notes, claves extra y valores inválidos de la propuesta", async () => {
  for (const proposal of [
    { notes: "texto libre" },
    { requested_time: "09:30", baggage: "Mochila" },
    { date: "2026-02-30" },
  ]) {
    const result = await consultarPropuestaIA({
      async rpc() { return { data: { id: tripId, status: "done", proposal, diagnostic: null }, error: null }; },
    }, tripId);
    assert.deepEqual(result, { ok: false, reason: "respuesta_invalida" });
  }
});

test("los errores de RPC se reducen a códigos cerrados", async () => {
  for (const [message, reason] of [
    ["rate_limited", "rate_limited"],
    ["no_autorizado", "no_autorizado"],
    ["anything else", "ia_no_disponible"],
  ] as const) {
    const result = await solicitarPropuestaIA({
      async rpc() { return { data: null, error: { message } }; },
    }, { tripId, request: request() });
    assert.deepEqual(result, { ok: false, reason });
  }
});

test("el sondeo usa reloj inyectado, consulta cada 1,5 s y vence a los 60 s", async () => {
  let now = 0;
  const sleeps: number[] = [];
  const result = await esperarPropuestaIA({
    async rpc() { return { data: { id: tripId, status: "pending", proposal: null, diagnostic: null }, error: null }; },
  }, tripId, {
    clock: {
      now: () => now,
      sleep: async (milliseconds: number) => { sleeps.push(milliseconds); now += milliseconds; },
    },
  });
  assert.deepEqual(result, { ok: false, reason: "timeout" });
  assert.equal(sleeps.length, 40);
  assert.ok(sleeps.every((milliseconds) => milliseconds === 1_500));
});

test("el sondeo termina al recibir una propuesta o un fallo seguro", async () => {
  let calls = 0;
  const ready = await esperarPropuestaIA({
    async rpc() {
      calls += 1;
      return { data: { id: tripId, status: calls === 1 ? "claimed" : "done", proposal: calls === 1 ? null : { baggage: "Mochila" }, diagnostic: null }, error: null };
    },
  }, tripId, { clock: { now: () => 0, sleep: async () => {} } });
  assert.deepEqual(ready, { ok: true, request: { id: tripId, status: "done", proposal: { baggage: "Mochila" }, diagnostic: null } });
});
