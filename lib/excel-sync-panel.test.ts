import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../app/excel-sync-panel.tsx", import.meta.url), "utf8");

test("el mapeo manual o con IA limita las filas antes de mostrar la vista previa", () => {
  const fallbackPaths = [...panel.matchAll(/const fallback = rowsForMapping\([\s\S]*?setPhase\("mapping"\);/g)].map((match) => match[0]);
  assert.equal(fallbackPaths.length, 2);
  for (const path of fallbackPaths) {
    assert.match(path, /fallback\.rows\.length > MAX_ROWS_PER_SHEET[\s\S]*?throw new Error[\s\S]*?setMappingHeaders/i);
  }
});
