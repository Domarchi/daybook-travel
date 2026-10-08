import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const sourcePath = resolve(root, "lib/travel-agent-confirmation.ts");
const testPath = resolve(root, "lib/travel-agent-confirmation.test.ts");
const node = process.execPath;

const mutants = [
  {
    name: "habilita-antes-de-confirmar",
    from: "return this.#confirmed && !this.#submitted;",
    to: "return !this.#submitted;",
  },
  {
    name: "reenvia-campo-extra",
    from: "for (const field of CAMPOS_PROPONIBLES) {",
    to: "for (const field of Object.keys(value) as CampoProponible[]) {",
  },
];

for (const mutant of mutants) {
  const source = readFileSync(sourcePath, "utf8");
  assert.ok(source.includes(mutant.from), `No encontré el punto de mutación ${mutant.name}.`);
  const mutantFile = resolve(root, `lib/.travel-agent-confirmation-mutant-${mutant.name}.ts`);
  writeFileSync(mutantFile, source.replace(mutant.from, mutant.to), "utf8");

  let status;
  try {
    execFileSync(node, ["--experimental-strip-types", "--test", testPath], {
      cwd: root,
      env: {
        ...process.env,
        TRAVEL_AGENT_CONFIRMATION_MODULE: `./.travel-agent-confirmation-mutant-${mutant.name}.ts`,
      },
      stdio: "pipe",
    });
  } catch (error) {
    status = error && typeof error === "object" && "status" in error
      ? error.status
      : undefined;
  } finally {
    rmSync(mutantFile, { force: true });
  }

  assert.ok(typeof status === "number" && status !== 0, `El mutante ${mutant.name} sobrevivió.`);
  process.stdout.write(`MUTANTE ${mutant.name}: eliminado (exit ${status})\n`);
}
