import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("el diálogo de viaje ya no contiene sugerencias guiadas", async () => {
  const view = await readFile(new URL("components/trip-dialog.tsx", root), "utf8");
  assert.doesNotMatch(view, /Sugerir con IA|sugerirConIA|SuggestionButton|TravelAgentConfirmation/);
});
