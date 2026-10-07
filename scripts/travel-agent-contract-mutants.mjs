import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const sourcePath = resolve(root, "lib/travel-agent-contract.ts");
const testPath = resolve(root, "lib/travel-agent-contract.test.ts");
const node = process.execPath;

const mutants = [
  {
    name: "sin-allowlist",
    from: "if (!CAMPOS_PERMITIDOS.has(field)) {",
    to: "if (false) {",
  },
  {
    name: "sin-confirmacion",
    from: "if (input.confirmed !== true) {",
    to: "if (false) {",
  },
];

for (const mutant of mutants) {
  const mutantFile = resolve(root, `lib/.travel-agent-contract-mutant-${mutant.name}.ts`);
  const source = readFileSync(sourcePath, "utf8");
  assert.ok(source.includes(mutant.from), `No encontré el punto de mutación ${mutant.name}.`);
  writeFileSync(mutantFile, source.replace(mutant.from, mutant.to), "utf8");

  let status;
  try {
    execFileSync(node, ["--experimental-strip-types", "--test", testPath], {
      cwd: root,
      env: {
        ...process.env,
        TRAVEL_AGENT_CONTRACT_MODULE: `./.travel-agent-contract-mutant-${mutant.name}.ts`,
      },
      stdio: "pipe",
    });
  } catch (error) {
    status = error && typeof error === "object" && "status" in error ? error.status : undefined;
  } finally {
    rmSync(mutantFile, { force: true });
  }
  assert.ok(typeof status === "number" && status !== 0, `El mutante ${mutant.name} sobrevivió.`);
  process.stdout.write(`MUTANTE ${mutant.name}: eliminado (exit ${status})\n`);
}
