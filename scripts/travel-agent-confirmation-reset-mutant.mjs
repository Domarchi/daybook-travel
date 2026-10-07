import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const componentPath = resolve(root, "components/travel-agent-confirmation.tsx");
const browserVerifier = resolve(root, "scripts/travel-agent-confirmation-browser.mjs");
const source = readFileSync(componentPath, "utf8");
const from = "key={crearIdentidadPropuestaConfirmacion(model)}";
const to = 'key="propuesta-fija"';

assert.equal(source.split(from).length - 1, 1, "No encontré el punto de mutación de identidad.");
let status;
let output = "";
try {
  writeFileSync(componentPath, source.replace(from, to), "utf8");
  execFileSync(process.execPath, [browserVerifier], { cwd: root, stdio: "pipe" });
} catch (error) {
  status = error && typeof error === "object" && "status" in error ? error.status : undefined;
  if (error && typeof error === "object") {
    output = `${"stdout" in error ? String(error.stdout ?? "") : ""}
${"stderr" in error ? String(error.stderr ?? "") : ""}`;
  }
} finally {
  writeFileSync(componentPath, source, "utf8");
}

assert.ok(typeof status === "number" && status !== 0, "El mutante que omite reset entre propuestas sobrevivió.");
assert.match(output, /reset de confirmación B/, "El mutante no murió en el contrato de reset de la propuesta B.");
process.stdout.write(`MUTANTE reset-entre-propuestas: eliminado (exit ${status})\n`);
