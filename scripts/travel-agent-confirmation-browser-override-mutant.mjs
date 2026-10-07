import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const sourcePath = resolve(root, "scripts/travel-agent-confirmation-browser.mjs");
const testPath = resolve(root, "lib/travel-agent-confirmation.test.ts");
const source = readFileSync(sourcePath, "utf8");
const from = 'if (!canonicalCandidates.has(canonicalOverride)) {\n      throw new BrowserLaunchError("TRAVEL_B3_CHROME_PATH sólo acepta rutas allowlisted de Chrome/Chromium.");\n    }';
const to = 'if (false) {\n      throw new BrowserLaunchError("TRAVEL_B3_CHROME_PATH sólo acepta rutas allowlisted de Chrome/Chromium.");\n    }';

assert.equal(source.split(from).length - 1, 1, "No encontré la validación canónica del override B3.");
let status;
let output = "";
try {
  writeFileSync(sourcePath, source.replace(from, to), "utf8");
  execFileSync(process.execPath, [
    "--experimental-strip-types",
    "--test",
    "--test-name-pattern=B3 rechaza un override arbitrario",
    testPath,
  ], { cwd: root, stdio: "pipe" });
} catch (error) {
  status = error && typeof error === "object" && "status" in error ? error.status : undefined;
  output = error && typeof error === "object" && "stdout" in error && Buffer.isBuffer(error.stdout)
    ? error.stdout.toString("utf8")
    : "";
} finally {
  writeFileSync(sourcePath, source, "utf8");
}

assert.ok(typeof status === "number" && status !== 0, "El mutante sin validación canónica sobrevivió.");
assert.match(output, /Missing expected rejection/, "El mutante no ejecutó el camino del marcador arbitrario.");
process.stdout.write(`MUTANTE override-sin-validacion-canonica: eliminado (exit ${status})\n`);
