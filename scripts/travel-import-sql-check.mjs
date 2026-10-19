// Pure validators by default; --queue-acl adds synthetic roles and migration 009.
// --emit-only opens no database/socket. The optional supervisor run creates an
// owned PostgreSQL18 container without network/ports, never an existing database.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { runCommand, runWithinDeadline } from "../lib/travel-agent-postgres-runner.ts";
const root = process.cwd();
const artifacts = process.env.TRAVEL_IMPORT_ARTIFACTS;
assert.ok(artifacts && isAbsolute(artifacts),"TRAVEL_IMPORT_ARTIFACTS must be an absolute receipts directory");
assert.ok(process.argv.includes("--emit-only") || process.argv.includes("--docker-pg18"),"Choose --emit-only or --docker-pg18 explicitly");
const fixture = JSON.parse(await readFile(join(root,"fixtures/travel-import-contract.json"),"utf8"));
const migration = await readFile(join(root,"supabase/009_trip_ai_queue.sql"),"utf8");
const validator = migration.match(/create or replace function public\.trip_ai_request_is_valid\([\s\S]*?\n\$\$;/)?.[0];
assert.ok(validator);
const request = (headers=["ñ"],samples=[]) => ({schema:"travel-import-map-v1",entity:"people",headers,samples});
const vectors = [
  ...fixture.valid_samples.map(sample=>({name:`valid sample ${JSON.stringify(sample)}`,value:request(["ñ"],[[sample]]),expected:true})),
  // The exact U+0000 sample is rejected by JSONB decoding (22P05) before
  // the validator can run. Keep its original payload and Boolean expectation
  // for traceability, but assert the distinct decode-layer expectation instead.
  ...fixture.invalid_samples.map(sample=>({name:`invalid sample ${JSON.stringify(sample)}`,value:request(["ñ"],[[sample]]),expected:false,...(sample === "\u0000" ? {jsonbDecodeSqlstate:"22P05"} : {})})),
  ...[["😀".repeat(20),true],["😀".repeat(21),false],["😀".repeat(41),false],["é".repeat(40),true],["é".repeat(41),false],["e\u0301".repeat(26),true],["e\u0301".repeat(27),false],["",false],["ñ²١\t\n\u00a0",true]].map(([header,expected])=>({name:`header bytes ${JSON.stringify(header)}`,value:request([header]),expected})),
  {name:"40 headers",value:request(Array.from({length:40},(_,i)=>`H${i}`)),expected:true},
  {name:"41 headers",value:request(Array.from({length:41},(_,i)=>`H${i}`)),expected:false},
  {name:"24 sample bytes",value:request(["ñ"],[["x".repeat(24)]]),expected:true},
  {name:"25 sample bytes",value:request(["ñ"],[["x".repeat(25)]]),expected:false},
  {name:"3 samples",value:request(["ñ"],[["x"],["X"],["9"]]),expected:true},
  {name:"4 samples",value:request(["ñ"],[["x"],["X"],["9"],["?"]]),expected:false},
  {name:"duplicate labels",value:request(["A","A"]),expected:false},
  {name:"wrong width",value:request(["A","B"],[["x"]]),expected:false},
  {name:"extra field",value:{...request(),filename:"forbidden"},expected:false},
];
const decodeCases = vectors.filter(vector=>vector.jsonbDecodeSqlstate).length;
const validatorCases = vectors.length - decodeCases;
let summary = `${validatorCases} validator cases + ${decodeCases} JSONB decode rejection = ${vectors.length} cases`;
let sql = `\\set ON_ERROR_STOP on\nbegin;\nDO $$ BEGIN IF current_setting('server_encoding') <> 'UTF8' THEN RAISE EXCEPTION 'UTF8 required'; END IF; END $$;\n${validator}\n` + vectors.map((vector,index)=> {
  if (vector.jsonbDecodeSqlstate) return `DO $case_${index}$
DECLARE decode_rejected boolean := false;
BEGIN
  BEGIN
    PERFORM $json_${index}$${JSON.stringify(vector.value)}$json_${index}$::jsonb;
  EXCEPTION WHEN SQLSTATE '${vector.jsonbDecodeSqlstate}' THEN
    decode_rejected := true;
  END;
  IF NOT decode_rejected THEN
    RAISE EXCEPTION 'fixture ${index} JSONB decode unexpectedly accepted U+0000';
  END IF;
END $case_${index}$;`;
  return `DO $case_${index}$ BEGIN IF public.trip_ai_request_is_valid('import_mapping', $json_${index}$${JSON.stringify(vector.value)}$json_${index}$::jsonb) IS DISTINCT FROM ${vector.expected} THEN RAISE EXCEPTION 'fixture ${index} failed'; END IF; END $case_${index}$;`;
}).join("\n") + `\nrollback;\n\\echo '${summary} passed'\n`;
if (process.argv.includes("--queue-acl")) {
  const fixtureSql = await readFile(join(root,"fixtures/travel-queue-acl.sql"),"utf8");
  assert.equal((fixtureSql.match(/-- MIGRATION_009/g) ?? []).length, 1);
  assert.match(migration, /^begin;[\s\S]*commit;\s*$/);
  sql = fixtureSql.replace("-- MIGRATION_009", () => migration.replace(/^begin;\s*/, "").replace(/\s*commit;\s*$/, ""));
  summary = "6 queue RPC ACL and nonmember/worker guards";
}
const path = join(artifacts,process.argv.includes("--queue-acl") ? "travel-queue-acl.sql" : "travel-import-validator.sql"); await writeFile(path,sql);
await writeFile(join(artifacts,"travel-import-sql-vectors.json"),JSON.stringify(vectors,null,2));
console.log(`EMITTED ${summary}: ${path}`);
if(process.argv.includes("--docker-pg18")) {
  const container = `travel-import-synthetic-${process.pid}-${Date.now()}`;
  let owned = false;
  const command = async(args,input,signal) => {
    const result = await runCommand("docker",args,{input,signal,timeoutMs:30000});
    assert.equal(result.status,0,`${args.join(" ")}\n${result.stdout}\n${result.stderr}`); return result.stdout;
  };
  try {
    await runWithinDeadline(60000,async signal=> {
      await command(["run","--pull=never","--rm","-d","--name",container,"--network","none","-e","POSTGRES_HOST_AUTH_METHOD=trust","postgres:18"],undefined,signal); owned=true;
      for(let attempt=0;attempt<60;attempt++) {
        const ready = await runCommand("docker",["exec",container,"pg_isready","-U","postgres"],{signal,timeoutMs:3000});
        if(ready.status===0) break;
        if(attempt===59) throw new Error("isolated PostgreSQL18 not ready");
        await new Promise(resolve=>setTimeout(resolve,250));
      }
      const version = await command(["exec",container,"psql","-XAt","-U","postgres","-c","show server_version"],undefined,signal);
      assert.match(version,/^18\./); console.log(`PostgreSQL ${version.trim()}`);
      console.log(await command(["exec","-i",container,"psql","-X","-U","postgres","-v","ON_ERROR_STOP=1"],sql,signal));
    });
  } finally { if(owned) await command(["rm","-f",container]); }
} else console.log("SQL EXECUTION NOT RUN");
