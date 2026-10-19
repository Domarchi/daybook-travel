import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/009_trip_ai_queue.sql", import.meta.url), "utf8");
const signatures = [
  "request_trip_ai_proposal(uuid, jsonb)",
  "request_trip_import_mapping(jsonb)",
  "get_trip_ai_request(uuid)",
  "claim_trip_ai_request()",
  "complete_trip_ai_request(uuid, jsonb)",
  "fail_trip_ai_request(uuid, text)",
];

// Regresión estructural; no sustituye has_function_privilege en PostgreSQL.
// El harness --queue-acl ejecuta la migración con grants directos sintéticos.
for (const signature of signatures) {
  test(`ACL estructural: ${signature} retira anon y PUBLIC conservando authenticated`, () => {
    const prefix = `revoke all on function public.${signature} from `;
    const revoke = migration.split("\n").find(line => line.startsWith(prefix));
    assert.ok(revoke, `falta REVOKE para ${signature}`);
    const grantees = revoke.slice(prefix.length).replace(/;$/, "").split(",").map(role => role.trim());
    assert.ok(grantees.includes("public"), "debe retirar el grant de PUBLIC");
    assert.ok(grantees.includes("anon"), "REVOKE PUBLIC no retira el grant directo de anon");
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature.replace(/[()]/g, "\\$&")} to authenticated;`));
  });
}
