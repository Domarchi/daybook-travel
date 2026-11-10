import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

test("el CI corre una sola vez por cambio: pull_request, y push solo en main", () => {
  assert.match(workflow, /^on:\n  push:\n    branches: \[main\]\n  pull_request:\n/m);
  assert.doesNotMatch(workflow, /^  push:\n  pull_request:/m, "un push sin filtro duplica cada corrida");
});
