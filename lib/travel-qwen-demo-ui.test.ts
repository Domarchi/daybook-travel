import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("UI demo sólo muestra campos B2 permitidos y la confirmación está deshabilitada sin aplicar", async () => {
  const view = await readFile(new URL("components/travel-qwen-demo.tsx", root), "utf8");
  assert.match(view, /const CAMPOS_MOSTRABLES = \["date", "requested_time", "baggage", "notes"\]/);
  assert.match(view, /requiresHumanConfirmation/);
  assert.match(view, /disabled/);
  assert.match(view, /nunca cambia datos de viaje/i);
  assert.doesNotMatch(view, /aplicarPropuestaTravel|travel-agent-apply|onConfirm|\/apply|mutation/i);
  assert.doesNotMatch(view, /result\.(?!proposal|requiresHumanConfirmation|status)/);
});

test("la página y API demo son límites de desarrollo cerrados", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("app/internal/qwen-demo/page.tsx", root), "utf8"),
    readFile(new URL("app/api/internal/qwen-demo/route.ts", root), "utf8"),
  ]);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /demoQwenHabilitado/);
  assert.match(route, /manejarDemoQwen/);
});
