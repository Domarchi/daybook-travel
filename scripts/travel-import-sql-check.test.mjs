import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";

const script = new URL("./travel-import-sql-check.mjs", import.meta.url);
const source = await readFile(script, "utf8");
assert.ok(process.env.TRAVEL_IMPORT_ARTIFACTS && isAbsolute(process.env.TRAVEL_IMPORT_ARTIFACTS));
const artifacts = await mkdtemp(join(process.env.TRAVEL_IMPORT_ARTIFACTS, "writer-sql-unit-"));

// Exercise the real emit-only entrypoint with subprocess/socket entrypoints blocked.
// No Docker executable or database is used, including by the fail-closed tests below.
const guard = `
import childProcess from 'node:child_process';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
const forbidden = () => { throw new Error('emit-only attempted a subprocess/socket/network operation'); };
for (const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']) childProcess[key] = forbidden;
for (const key of ['createServer','createConnection','connect']) net[key] = forbidden;
net.Socket.prototype.connect = forbidden;
tls.connect = forbidden; tls.createServer = forbidden;
dgram.createSocket = forbidden;
dns.lookup = forbidden; dns.resolve = forbidden;
globalThis.fetch = forbidden; globalThis.WebSocket = forbidden;
syncBuiltinESMExports();
`;
const emitted = spawnSync(process.execPath, [
  "--import", `data:text/javascript,${encodeURIComponent(guard)}`, script.pathname, "--emit-only",
], {
  cwd: process.cwd(),
  env: { PATH: "", TRAVEL_IMPORT_ARTIFACTS: artifacts },
  encoding: "utf8",
  timeout: 10_000,
  maxBuffer: 1024 * 1024,
});
console.log(`emit-only child rc=${emitted.status}; signal=${emitted.signal}; artifacts=${artifacts}`);
process.stdout.write(emitted.stdout ?? "");
process.stderr.write(emitted.stderr ?? "");
assert.ifError(emitted.error);
assert.equal(emitted.status, 0);
const sql = await readFile(join(artifacts, "travel-import-validator.sql"), "utf8");
const vectors = JSON.parse(await readFile(join(artifacts, "travel-import-sql-vectors.json"), "utf8"));
const blocks = [...sql.matchAll(/DO \$case_(\d+)\$([\s\S]*?)\$case_\1\$;/g)];
const nulBlock = blocks.find(([, index]) => index === "18")?.[0];

// A deliberately narrow control-flow model of the emitted PL/pgSQL block.
// Its grammar requires only the JSONB cast inside the exception scope, followed
// by the acceptance assertion outside it. This is not a PostgreSQL engine test.
function executeDecodeCase(block, decode) {
  const parsed = block?.match(/^DO \$case_18\$\s*DECLARE\s+(\w+) boolean := false;\s*BEGIN\s*BEGIN\s*PERFORM \$json_18\$([\s\S]*?)\$json_18\$::jsonb;\s*EXCEPTION WHEN SQLSTATE '([A-Z0-9]{5})' THEN\s*\1 := true;\s*END;\s*IF NOT \1 THEN\s*RAISE EXCEPTION '([^']+)';\s*END IF;\s*END \$case_18\$;$/);
  assert.ok(parsed, "NUL must have a narrow decode-only exception scope and an outside acceptance assertion");
  const [, , payload, caughtState, acceptedMessage] = parsed;
  assert.equal(caughtState, "22P05");
  let rejected = false;
  try {
    decode(JSON.parse(payload));
  } catch (error) {
    if (error.sqlstate !== caughtState) throw error;
    rejected = true;
  }
  if (!rejected) throw Object.assign(new Error(acceptedMessage), { sqlstate: "P0001" });
  return "JSONB decode rejection";
}

const sqlError = (sqlstate) => Object.assign(new Error(`synthetic SQLSTATE ${sqlstate}`), { sqlstate });

test("emit-only preserves all 37 original payloads, names, Boolean expectations, and order", () => {
  assert.equal(vectors.length, 37);
  const original = vectors.map(({ name, value, expected }) => ({ name, value, expected }));
  assert.equal(createHash("sha256").update(JSON.stringify(original)).digest("hex"),
    "5508ebc448890c4ba0a7c9a66444fad17a5e7d8334877e7288fc20b407041a51");
  assert.deepEqual(blocks.map(([, index]) => Number(index)), Array.from({ length: 37 }, (_, i) => i));
});

test("only the exact original NUL vector declares JSONB decode SQLSTATE 22P05", () => {
  assert.equal(vectors[18].name, 'invalid sample "\\u0000"');
  assert.deepEqual(vectors[18].value, {
    schema: "travel-import-map-v1", entity: "people", headers: ["ñ"], samples: [["\u0000"]],
  });
  assert.equal(vectors[18].jsonbDecodeSqlstate, "22P05");
  assert.deepEqual(vectors.flatMap((v, i) => v.jsonbDecodeSqlstate ? [i] : []), [18]);
});

test("the other 36 cases still call the public validator and compare their original Boolean results", () => {
  for (const [index, vector] of vectors.entries()) {
    if (index === 18) continue;
    const expected = `DO $case_${index}$ BEGIN IF public.trip_ai_request_is_valid('import_mapping', $json_${index}$${JSON.stringify(vector.value)}$json_${index}$::jsonb) IS DISTINCT FROM ${vector.expected} THEN RAISE EXCEPTION 'fixture ${index} failed'; END IF; END $case_${index}$;`;
    assert.equal(blocks[index][0], expected);
  }
  assert.equal((sql.match(/IF public\.trip_ai_request_is_valid\(/g) ?? []).length, 36);
});

test("NUL is rejected at decode with 22P05 without calling the validator", () => {
  assert.doesNotMatch(nulBlock, /trip_ai_request_is_valid/);
  assert.equal(executeDecodeCase(nulBlock, (payload) => {
    assert.equal(payload.samples[0][0], "\u0000");
    throw sqlError("22P05");
  }), "JSONB decode rejection");
});

test("an unexpectedly accepted JSONB decode fails outside the exception handler", () => {
  assert.throws(() => executeDecodeCase(nulBlock, () => ({})), (error) =>
    error.sqlstate === "P0001" && /fixture 18 JSONB decode unexpectedly accepted U\+0000/.test(error.message));
});

test("every other decode error propagates instead of passing the NUL vector", () => {
  for (const state of ["22P02", "22021", "XX000", "P0001"]) {
    const failure = sqlError(state);
    assert.throws(() => executeDecodeCase(nulBlock, () => { throw failure; }), (error) => error === failure);
  }
});

test("emission and SQL receipts distinguish 36 validator cases plus one decode rejection, total 37", () => {
  assert.match(emitted.stdout, /EMITTED 36 validator cases \+ 1 JSONB decode rejection = 37 cases:/);
  assert.match(sql, /\\echo '36 validator cases \+ 1 JSONB decode rejection = 37 cases passed'/);
  assert.match(sql, /^\\set ON_ERROR_STOP on\nbegin;/);
  assert.match(sql, /rollback;\n\\echo/);
  assert.match(emitted.stdout, /SQL EXECUTION NOT RUN/);
});

async function simulateDocker({ version = "18.1\n", sqlStatus = 0, launchStatus = 0 } = {}) {
  const commands = [];
  const entry = source.replace(/^import .*;\n/gm, "");
  const completion = runInNewContext(`(async () => { ${entry} })()`, {
    assert, readFile, writeFile: async () => {}, join, isAbsolute,
    process: { cwd: () => process.cwd(), env: { TRAVEL_IMPORT_ARTIFACTS: artifacts }, argv: ["--docker-pg18"], pid: 123 },
    console: { log: (...args) => console.log("mock Docker receipt:", ...args) },
    runWithinDeadline: async (ms, work) => {
      assert.equal(ms, 60_000);
      return work(new AbortController().signal);
    },
    runCommand: async (command, args, options) => {
      assert.equal(command, "docker");
      commands.push({ args, input: options.input });
      const status = args[0] === "run" ? launchStatus : args.includes("-i") ? sqlStatus : 0;
      return { status, signal: null, stdout: args.includes("-c") ? version : "mock only\n", stderr: status ? "synthetic failure\n" : "" };
    },
  });
  return { completion, commands };
}

test("docker-pg18 stays fail-closed on SQL failure and cleans up the owned container (mock only)", async () => {
  const { completion, commands } = await simulateDocker({ sqlStatus: 1 });
  await assert.rejects(completion, /synthetic failure/);
  assert.equal(commands.find(c => c.args.includes("-i")).input, sql);
  assert.ok(commands.find(c => c.args.includes("-i")).args.includes("ON_ERROR_STOP=1"));
  assert.deepEqual(Array.from(commands.at(-1).args.slice(0, 2)), ["rm", "-f"]);
  const launch = commands[0].args;
  assert.ok(launch.includes("--pull=never"));
  assert.equal(launch[launch.indexOf("--network") + 1], "none");
  assert.equal(launch.at(-1), "postgres:18");
});

test("docker-pg18 rejects another engine version before SQL execution (mock only)", async () => {
  const { completion, commands } = await simulateDocker({ version: "17.6\n" });
  await assert.rejects(completion);
  assert.equal(commands.some(c => c.args.includes("-i")), false);
  assert.deepEqual(Array.from(commands.at(-1).args.slice(0, 2)), ["rm", "-f"]);
});

test("docker-pg18 rejects failed launch before readiness or SQL execution (mock only)", async () => {
  const { completion, commands } = await simulateDocker({ launchStatus: 125 });
  await assert.rejects(completion, /synthetic failure/);
  assert.equal(commands.length, 1);
});
