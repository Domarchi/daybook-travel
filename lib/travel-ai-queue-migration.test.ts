import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../supabase/009_trip_ai_queue.sql", import.meta.url), "utf8");

test("B4 migra una cola cerrada, con forma guided-v1 y sin escritura directa", () => {
  assert.match(sql, /begin;[\s\S]*commit;/i);
  assert.match(sql, /create table if not exists public\.trip_ai_workers[\s\S]*?user_id uuid primary key/i);
  assert.match(sql, /create table if not exists public\.trip_ai_requests/i);
  assert.match(sql, /request jsonb not null[\s\S]*?travel-guided-v1[\s\S]*?requested_time[\s\S]*?baggage/i);
  assert.match(sql, /proposal jsonb null[\s\S]*?jsonb_build_object\(request ->> 'action', request -> 'value'\)/i);
  assert.match(sql, /alter table public\.trip_ai_requests enable row level security/i);
  assert.match(sql, /revoke all on public\.trip_ai_requests from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /create policy[\s\S]*?trip_ai_requests[\s\S]*?(?:for\s+)?(?:insert|update|delete)/i);
});

test("B4 fija el límite de confianza de las cinco RPC", () => {
  for (const name of [
    "request_trip_ai_proposal", "get_trip_ai_request", "claim_trip_ai_request", "complete_trip_ai_request", "fail_trip_ai_request",
  ]) {
    const body = sql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, "i"))?.[0] ?? "";
    assert.match(body, /security definer/i, name);
    assert.match(body, /set search_path = public, pg_temp/i, name);
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to authenticated`, "i"));
  }
  assert.match(sql, /count\(\*\)[\s\S]*?status in \('pending', 'claimed'\)[\s\S]*?rate_limited/i);
});

test("B4 reclama con SKIP LOCKED y no filtra trip_id ni actor al worker", () => {
  const claim = sql.match(/create or replace function public\.claim_trip_ai_request\([\s\S]*?\n\$\$;/i)?.[0] ?? "";
  assert.match(claim, /public\.trip_ai_workers/i);
  assert.match(claim, /for update skip locked/i);
  assert.match(claim, /attempts = v_request\.attempts \+ 1/i);
  assert.match(claim, /'id', v_request\.id[\s\S]*?'request', v_request\.request/i);
  assert.doesNotMatch(claim, /['"]trip_id['"]|['"]actor['"]|v_request\.trip_id|v_request\.actor/i);
});
