import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const sourcePath = resolve(root, "lib/travel-private-inference.ts");
const testPath = resolve(root, "lib/travel-private-inference.test.ts");
const node = process.execPath;

const mutants = [
  {
    name: "sin-allowlist",
    from: "return Object.keys(value).every((field) => allowlist.has(field));",
    to: "return true;",
  },
  {
    name: "error-de-transporte-se-vuelve-propuesta",
    from: '  } catch {\n    return diagnostico("failed", "transport_error");\n  }\n}',
    to: '  } catch {\n    return propuestaPendiente({ notes: "mutante" });\n  }\n}',
  },
];

for (const mutant of mutants) {
  const mutantFile = resolve(root, `lib/.travel-private-inference-mutant-${mutant.name}.ts`);
  const source = readFileSync(sourcePath, "utf8");
  assert.ok(source.includes(mutant.from), `No encontré el punto de mutación ${mutant.name}.`);
  writeFileSync(mutantFile, source.replace(mutant.from, mutant.to), "utf8");

  let status;
  try {
    execFileSync(node, ["--experimental-strip-types", "--test", testPath], {
      cwd: root,
      env: {
        ...process.env,
        TRAVEL_PRIVATE_INFERENCE_MODULE: `./.travel-private-inference-mutant-${mutant.name}.ts`,
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
