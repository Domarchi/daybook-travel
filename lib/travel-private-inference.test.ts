import assert from "node:assert/strict";
import test from "node:test";

const privateModulePath = process.env.TRAVEL_PRIVATE_INFERENCE_MODULE ?? "./travel-private-inference.ts";
const { ejecutarInferenciaPrivada } = await import(privateModulePath);
import { aplicarPropuestaTravel } from "./travel-agent-contract.ts";

const solicitudSintetica = () => ({
  fixture: "travel-b2-synthetic-v1" as const,
  requestText: "SYNTHETIC: mover la hora solicitada a 09:30.",
  context: {
    date: "2026-11-12",
    requested_time: "08:00",
    baggage: "Mochila",
    notes: "Contexto sintético mínimo",
  },
});

test("B2 rechaza campos prohibidos o desconocidos antes de invocar transporte", async () => {
  let llamadas = 0;
  const fetchInyectado = async () => {
    llamadas += 1;
    throw new Error("No debe invocarse para una entrada inválida.");
  };

  for (const campo of [
    "person_id", "origin", "destination", "pnr", "status", "amount", "role", "purchase", "emission", "unknown",
  ]) {
    const result = await ejecutarInferenciaPrivada({
      endpoint: { baseUrl: "http://127.0.0.1:8703" },
      fetch: fetchInyectado,
      input: { ...solicitudSintetica(), [campo]: "prohibido" },
    });

    assert.deepEqual(result, {
      status: "invalid",
      diagnostic: { code: "input_field_not_allowed" },
    });
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.diagnostic), true);
  }

  assert.equal(llamadas, 0);
});


test("B2 convierte una respuesta JSON allowlisted en una propuesta pendiente de confirmación", async () => {
  const input = solicitudSintetica();
  const result = await ejecutarInferenciaPrivada({
    endpoint: {
      baseUrl: "http://127.0.0.1:8703",
      path: "/v1/private-inference",
      timeoutMs: 50,
    },
    fetch: async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
      assert.equal(url, "http://127.0.0.1:8703/v1/private-inference");
      assert.equal(init?.method, "POST");
      assert.deepEqual(init?.headers, { "content-type": "application/json" });
      assert.deepEqual(JSON.parse(init?.body ?? ""), input);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ requested_time: "09:30", notes: "Ajuste sintético" }),
      };
    },
    input,
  });

  assert.deepEqual(result, {
    status: "pending_confirmation",
    requiresHumanConfirmation: true,
    proposal: { requested_time: "09:30", notes: "Ajuste sintético" },
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.proposal), true);
  assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC:|Contexto sintético/);
});


test("B2 no crea propuesta ante JSON inválido, campo LLM extra, 5xx o timeout de lectura", async () => {
  const endpoint = {
    baseUrl: "http://127.0.0.1:8703",
    path: "/v1/private-inference",
    timeoutMs: 20,
  };
  const cases = [
    {
      name: "campo extra del modelo",
      fetch: async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ requested_time: "09:30", status: "Emitido" }),
      }),
      expected: { status: "invalid", diagnostic: { code: "model_response_invalid" } },
    },
    {
      name: "JSON malformado",
      fetch: async () => ({ ok: true, status: 200, text: async () => "{no-json" }),
      expected: { status: "invalid", diagnostic: { code: "model_response_invalid" } },
    },
    {
      name: "respuesta HTTP 5xx",
      fetch: async () => ({ ok: false, status: 503, text: async () => "ignorado" }),
      expected: { status: "failed", diagnostic: { code: "http_error" } },
    },
    {
      name: "error de transporte",
      fetch: async () => { throw new Error("transporte sintético caído"); },
      expected: { status: "failed", diagnostic: { code: "transport_error" } },
    },
  ];

  for (const scenario of cases) {
    const result = await ejecutarInferenciaPrivada({ endpoint, fetch: scenario.fetch, input: solicitudSintetica() });
    assert.deepEqual(result, scenario.expected, scenario.name);
    assert.equal("proposal" in result, false, scenario.name);
    assert.equal(Object.isFrozen(result), true, scenario.name);
  }

  const timeoutOrResult = await Promise.race([
    ejecutarInferenciaPrivada({
      endpoint,
      fetch: async () => ({ ok: true, status: 200, text: async () => new Promise<string>(() => {}) }),
      input: solicitudSintetica(),
    }),
    new Promise<"harness_timeout">((resolve) => setTimeout(() => resolve("harness_timeout"), 80)),
  ]);
  assert.notEqual(timeoutOrResult, "harness_timeout", "La lectura del cuerpo debe respetar el timeout B2.");
  assert.deepEqual(timeoutOrResult, { status: "failed", diagnostic: { code: "timeout" } });
  assert.equal("proposal" in timeoutOrResult, false);
});


test("B2 no puede encadenarse a B1 sin versión, confirmación y autorización", async () => {
  const b2 = await ejecutarInferenciaPrivada({
    endpoint: { baseUrl: "http://127.0.0.1:8703", path: "/v1/private-inference", timeoutMs: 50 },
    fetch: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ requested_time: "09:30" }),
    }),
    input: solicitudSintetica(),
  });
  assert.equal(b2.status, "pending_confirmation");
  if (b2.status !== "pending_confirmation") throw new Error("Se esperaba una propuesta B2 válida.");
  assert.equal("confirmed" in b2, false);
  assert.equal("authorize" in b2, false);
  assert.equal("tripVersion" in b2, false);

  const trip = {
    id: "trip-local-001",
    version: 7,
    date: "2026-11-12",
    requested_time: "08:00",
    baggage: "Mochila",
    notes: "Estado local intacto",
  };
  const attempt = (extra: Record<string, unknown>) => aplicarPropuestaTravel({
    trip,
    tripId: trip.id,
    propuesta: b2.proposal,
    idempotencyKey: "b2_private_001",
    receipts: [],
    ...extra,
  });

  for (const [name, extra, reason] of [
    ["sin versión", {}, "version_requerida"],
    ["sin confirmación", { tripVersion: 7 }, "confirmacion_requerida"],
    ["sin autorización", { tripVersion: 7, confirmed: true }, "no_autorizado"],
  ] as const) {
    const result = attempt(extra);
    assert.equal(result.ok, false, name);
    assert.equal(result.reason, reason, name);
    assert.deepEqual(result.trip, trip, name);
    assert.deepEqual(result.receipts, [], name);
  }
  assert.deepEqual(trip, {
    id: "trip-local-001",
    version: 7,
    date: "2026-11-12",
    requested_time: "08:00",
    baggage: "Mochila",
    notes: "Estado local intacto",
  });
});


test("B2 falla cerrado antes del transporte si el endpoint no es loopback explícito", async () => {
  let llamadas = 0;
  for (const baseUrl of ["https://example.com", "http://localhost:8703", "http://10.0.0.8:8703"]) {
    const result = await ejecutarInferenciaPrivada({
      endpoint: { baseUrl, path: "/v1/private-inference", timeoutMs: 50 },
      fetch: async () => {
        llamadas += 1;
        throw new Error("No debe invocarse con un host rechazado.");
      },
      input: solicitudSintetica(),
    });
    assert.deepEqual(result, { status: "failed", diagnostic: { code: "endpoint_not_allowed" } });
    assert.equal("proposal" in result, false);
  }
  assert.equal(llamadas, 0);
});
