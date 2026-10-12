import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("el diálogo usa únicamente la cola autenticada, sondea y deriva a la confirmación humana", async () => {
  const view = await readFile(new URL("components/trip-dialog.tsx", root), "utf8");
  assert.match(view, /solicitarPropuestaIA/);
  assert.match(view, /esperarPropuestaIA/);
  assert.match(view, /TravelAgentConfirmation/);
  assert.match(view, /aplicarPropuestaTravelRemota/);
  assert.equal([...view.matchAll(/<SuggestionButton/g)].length, 3);
  assert.match(view, /Sugerir con IA/);
  assert.match(view, /IA pensando…/);
  assert.match(view, /Propuesta lista/);
  assert.match(view, /IA no disponible/);
  assert.match(view, /browserRpcClient\(\)/);
  assert.doesNotMatch(view, /fetch\(/);
  assert.doesNotMatch(view, /qwen-demo|travel-private-inference|appsfcc|tailscale/i);
});
