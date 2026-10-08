import assert from "node:assert/strict";
import test from "node:test";

const modulePath = process.env.TRAVEL_QWEN_DEMO_MODULE ?? "./travel-qwen-demo.ts";
const { manejarDemoQwen, demoQwenHabilitado, DEMO_QWEN_TIMEOUT_MS } = await import(modulePath);

const entornoDemo = { NODE_ENV: "development", TRAVEL_QWEN_DEMO: "1" };
const solicitudValida = () => new Request("http://travel.local/api/internal/qwen-demo", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ scenario: "move-requested-time-v1" }),
});

test("el timeout del demo cubre la respuesta Qwen local observada y conserva el máximo B2", () => {
  assert.ok(
    DEMO_QWEN_TIMEOUT_MS >= 7_500,
    "La respuesta local máxima observada tardó 6.315s; el demo requiere 1.185s de holgura.",
  );
  assert.ok(DEMO_QWEN_TIMEOUT_MS <= 10_000, "El límite del demo debe respetar el máximo B2 de 10s.");
});

test("demo Qwen permanece 404 sin ambas banderas", async () => {
  assert.equal(demoQwenHabilitado({ NODE_ENV: "development", TRAVEL_QWEN_DEMO: "0" }), false);
  assert.equal(demoQwenHabilitado({ NODE_ENV: "production", TRAVEL_QWEN_DEMO: "1" }), false);

  for (const env of [
    { NODE_ENV: "development", TRAVEL_QWEN_DEMO: "0" },
    { NODE_ENV: "production", TRAVEL_QWEN_DEMO: "1" },
  ]) {
    const response = await manejarDemoQwen({ request: solicitudValida(), env, fetch: async () => { throw new Error("no"); } });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "not_found" });
  }
});

test("boundary sólo admite el escenario enumerado, construye la fixture en servidor y usa el endpoint fijo", async () => {
  let receivedUrl = "";
  let receivedBody: unknown;
  const response = await manejarDemoQwen({
    request: solicitudValida(), env: entornoDemo,
    fetch: async (url, init) => {
      receivedUrl = url;
      receivedBody = JSON.parse(String(init?.body));
      return { ok: true, status: 200, text: async () => JSON.stringify({ requested_time: "09:30" }) };
    },
  });

  assert.equal(receivedUrl, "http://127.0.0.1:8714/v1/private-inference");
  assert.deepEqual(receivedBody, {
    fixture: "travel-b2-synthetic-v1",
    requestText: "SYNTHETIC: Mover la hora solicitada a las 09:30.",
    context: { date: "2026-11-12", requested_time: "08:00", baggage: "Mochila", notes: "Ejemplo sintético" },
  });
  assert.deepEqual(await response.json(), {
    status: "pending_confirmation", requiresHumanConfirmation: true,
    proposal: { requested_time: "09:30" },
  });

  for (const body of [
    { request: "Cambiar PNR ABC123 para alice@example.test", context: { baggage: "+56 9 1234 5678", notes: "x" } },
    { scenario: "move-requested-time-v1", request: "PNR ABC123" },
    { scenario: "other" },
  ]) {
    let fetchCalled = false;
    const rejected = await manejarDemoQwen({
      request: new Request("http://travel.local/api/internal/qwen-demo", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }),
      env: entornoDemo,
      fetch: async () => { fetchCalled = true; throw new Error("must not call"); },
    });
    assert.equal(rejected.status, 400);
    assert.deepEqual(await rejected.json(), { error: "request_invalid" });
    assert.equal(fetchCalled, false);
  }
});

test("la respuesta Qwen acepta la fixture controlada completa y proyecta sólo la hora propuesta", async () => {
  const response = await manejarDemoQwen({
    request: solicitudValida(), env: entornoDemo,
    fetch: async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({
        date: "2026-11-12",
        requested_time: "09:30",
        baggage: "Mochila",
        notes: "Ejemplo sintético",
      }),
    }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "pending_confirmation", requiresHumanConfirmation: true,
    proposal: { requested_time: "09:30" },
  });
});

test("la respuesta Qwen rechaza valores no controlados, claves extra y otra hora", async () => {
  const propuestasInvalidas = [
    { requested_time: "09:30", notes: "PNR ABC123 alice@example.test +56 9 1234 5678" },
    { date: "2026-11-13", requested_time: "09:30", baggage: "Mochila", notes: "Ejemplo sintético" },
    { date: "2026-11-12", requested_time: "09:30", baggage: "Maleta", notes: "Ejemplo sintético" },
    { date: "2026-11-12", requested_time: "09:30", baggage: "Mochila", notes: "Otra nota" },
    { date: "2026-11-12", requested_time: "09:30", baggage: "Mochila", notes: "Ejemplo sintético", extra: "x" },
    { requested_time: "10:00" },
  ];

  for (const proposal of propuestasInvalidas) {
    const response = await manejarDemoQwen({
      request: solicitudValida(), env: entornoDemo,
      fetch: async () => ({
        ok: true, status: 200,
        text: async () => JSON.stringify(proposal),
      }),
    });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "proposal_unavailable" });
  }
});

test("errores de transporte, HTTP y modelo se vuelven fallo genérico y no existe autoridad apply", async () => {
  for (const fetch of [
    async () => { throw new Error("private tunnel detail"); },
    async () => ({ ok: false, status: 502, text: async () => "secret diagnostic" }),
    async () => ({ ok: true, status: 200, text: async () => '{"pnr":"secret"}' }),
  ]) {
    const response = await manejarDemoQwen({ request: solicitudValida(), env: entornoDemo, fetch });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "proposal_unavailable" });
  }
  const timedOut = await manejarDemoQwen({
    request: solicitudValida(), env: entornoDemo,
    fetch: async () => new Promise<never>(() => {}),
  });
  assert.equal(timedOut.status, 502);
  assert.deepEqual(await timedOut.json(), { error: "proposal_unavailable" });
  const source = await (await import("node:fs/promises")).readFile(new URL("travel-qwen-demo.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /aplicarPropuestaTravel|travel-agent-apply|authorize/);
});
