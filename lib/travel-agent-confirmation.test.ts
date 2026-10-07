import assert from "node:assert/strict";
import test from "node:test";

const modulePath = process.env.TRAVEL_AGENT_CONFIRMATION_MODULE ?? "./travel-agent-confirmation.ts";
const { crearModeloConfirmacionTravel, ControlConfirmacionHumana } = await import(modulePath);

const viajeSintetico = () => ({
  date: "2026-11-12",
  requested_time: "08:00",
  baggage: "Mochila",
  notes: "Contexto local sintético",
  person_id: "no-debe-salir",
});

test("B3 deja pendiente la propuesta, muestra sólo los cuatro campos permitidos y bloquea aplicar", () => {
  const model = crearModeloConfirmacionTravel({
    result: {
      status: "pending_confirmation",
      requiresHumanConfirmation: true,
      proposal: {
        date: "2026-11-13",
        requested_time: "09:30",
        baggage: "Maleta en bodega",
        notes: "Ajuste local sintético",
        pnr: "no-debe-renderizarse",
      },
    },
    current: viajeSintetico(),
  });

  assert.equal(model.kind, "ready");
  if (model.kind !== "ready") throw new Error("Se esperaba una propuesta pendiente válida.");
  assert.equal(model.status, "pending_confirmation");
  assert.equal(model.requiresHumanConfirmation, true);
  assert.equal(model.canApply, false);
  assert.deepEqual(model.fields.map((field: { key: string }) => field.key), [
    "date", "requested_time", "baggage", "notes",
  ]);
  assert.doesNotMatch(JSON.stringify(model), /pnr|no-debe-renderizarse|person_id|no-debe-salir/);
});


test("B3 requiere confirmación humana y entrega una sola señal local sin propuesta", () => {
  const gate = new ControlConfirmacionHumana();
  assert.equal(gate.canApply, false);
  assert.equal(gate.confirm(), null);

  gate.setConfirmed(true);
  assert.equal(gate.canApply, true);
  const first = gate.confirm();
  assert.deepEqual(first, { confirmed: true });
  assert.deepEqual(Object.keys(first ?? {}), ["confirmed"]);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(gate.canApply, false);
  assert.equal(gate.confirm(), null);

  gate.setConfirmed(false);
  gate.setConfirmed(true);
  assert.equal(gate.confirm(), null);
});


import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("B3 ofrece un control accesible: confirmación por teclado antes de una única acción local", async () => {
  const view = await readFile(new URL("components/travel-agent-confirmation.tsx", root), "utf8");

  assert.match(view, /aria-live="polite"/);
  assert.match(view, />\s*pending_confirmation\s*</);
  assert.match(view, /type="checkbox"/);
  assert.match(view, /<label[^>]*htmlFor="travel-agent-human-confirmation"/);
  assert.match(view, /id="travel-agent-human-confirmation"/);
  assert.match(view, /requiere confirmación humana/i);
  assert.match(view, /disabled=\{!confirmed \|\| submitted\}/);
  assert.match(view, /onConfirm\(confirmation\)/);
  assert.doesNotMatch(view, /result\.proposal/);
  assert.doesNotMatch(view, /aplicarPropuestaTravel|fetch\(/);
});


test("B3 falla cerrado para resultados failed o invalid y no expone diagnósticos crudos", () => {
  for (const result of [
    { status: "failed", diagnostic: { code: "transport_error", private: "no-debe-salir" } },
    { status: "invalid", diagnostic: { code: "model_response_invalid", private: "no-debe-salir" } },
  ]) {
    const model = crearModeloConfirmacionTravel({ result, current: viajeSintetico() });
    assert.deepEqual(model, { kind: "unavailable", diagnostic: "proposal_unavailable" });
    assert.doesNotMatch(JSON.stringify(model), /transport_error|model_response_invalid|no-debe-salir/);
  }
});
