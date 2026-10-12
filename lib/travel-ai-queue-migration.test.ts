import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../supabase/009_trip_ai_queue.sql", import.meta.url), "utf8");

test("B4 migra una cola cerrada, con forma guided-v1 y sin escritura directa", () => {
  assert.match(sql, /begin;[\s\S]*commit;/i);
  assert.match(sql, /create table if not exists public\.trip_ai_workers[\s\S]*?user_id uuid primary key/i);
  assert.match(sql, /create table if not exists public\.trip_ai_requests/i);
  assert.match(sql, /trip_ai_request_is_valid[\s\S]*?travel-guided-v1[\s\S]*?requested_time[\s\S]*?baggage/i);
  assert.match(sql, /trip_ai_proposal_is_valid[\s\S]*?jsonb_build_object\(\(p_request ->> 'action'\), p_request -> 'value'\)/i);
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

test("B4 soporta import_mapping sin viaje, con solicitud cerrada y expiración de 90 segundos", () => {
  assert.match(sql, /kind text not null default 'guided' check \(kind in \('guided', 'import_mapping'\)\)/i);
  assert.match(sql, /trip_id uuid null references public\.trips/i);
  assert.match(sql, /kind = 'guided' and trip_id is not null[\s\S]*?kind = 'import_mapping' and trip_id is null/i);
  assert.match(sql, /travel-import-map-v1[\s\S]*?headers[\s\S]*?samples/i);
  assert.match(sql, /jsonb_array_length\(\(?case when jsonb_typeof\(p_request -> 'headers'\) = 'array'/i);
  assert.match(sql, /created_at < now\(\) - \(?case when v_request\.kind = 'import_mapping' then interval '90 seconds'/i);
});

test("B4 expone una RPC de importación cerrada y el worker recibe kind", () => {
  const request = sql.match(/create or replace function public\.request_trip_import_mapping\([\s\S]*?\n\$\$;/i)?.[0] ?? "";
  assert.match(request, /security definer/i);
  assert.match(request, /set search_path = public, pg_temp/i);
  assert.match(request, /auth\.uid\(\)[\s\S]*?public\.is_member\(\)/i);
  assert.match(request, /pg_advisory_xact_lock/i);
  assert.match(sql, /revoke all on function public\.request_trip_import_mapping\(jsonb\) from public/i);
  assert.match(sql, /grant execute on function public\.request_trip_import_mapping\(jsonb\) to authenticated/i);
  const claim = sql.match(/create or replace function public\.claim_trip_ai_request\([\s\S]*?\n\$\$;/i)?.[0] ?? "";
  assert.match(claim, /'id', v_request\.id, 'kind', v_request\.kind, 'request', v_request\.request/i);
  const complete = sql.match(/create or replace function public\.complete_trip_ai_request\([\s\S]*?\n\$\$;/i)?.[0] ?? "";
  assert.match(complete, /public\.trip_ai_proposal_is_valid\(v_request\.kind, v_request\.request, p_proposal\)/i);
});

test("B4 exige encabezados JSON string, expira bajo el lock y no completa solicitudes vencidas", () => {
  const validator = sql.match(/create or replace function public\.trip_ai_request_is_valid\([\s\S]*?\n\$\$;/i)?.[0] ?? "";
  assert.match(validator, /jsonb_array_elements\(\(?case when jsonb_typeof\(p_request -> 'headers'\) = 'array'[\s\S]*?as h\(value\) where jsonb_typeof\(h\.value\) <> 'string'/i);
  assert.doesNotMatch(validator, /jsonb_array_elements_text\([^)]*\) h where length/i);

  for (const name of ["request_trip_ai_proposal", "request_trip_import_mapping"]) {
    const body = sql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, "i"))?.[0] ?? "";
    assert.match(body, /pg_advisory_xact_lock[\s\S]*?update public\.trip_ai_requests[\s\S]*?status = 'expired'[\s\S]*?actor = v_actor[\s\S]*?count\(\*\)/i, name);
  }

  const complete = sql.match(/create or replace function public\.complete_trip_ai_request\([\s\S]*?\n\$\$;/i)?.[0] ?? "";
  assert.match(complete, /created_at < now\(\) - \(?case when v_request\.kind = 'import_mapping' then interval '90 seconds'[\s\S]*?status = 'expired'[\s\S]*?return;/i);
});

test("B4 y el adaptador aceptan exactamente HH:MM, nunca segundos", async () => {
  assert.doesNotMatch(sql, /\(\?::\[0-5\]\[0-9\]\)\?\$/);
  const client = await import("./travel-ai-queue.ts");
  assert.equal(client.validarSolicitudIA({
    schema: "travel-guided-v1", action: "requested_time", value: "09:30:15",
    current: { date: "2026-11-12", requested_time: "08:00", baggage: "Mochila" },
  }), false);
});

test("B4 declara columnas para cada función JSON que devuelve conjuntos", () => {
  const columnAliases = sql.match(/\bAS\s+(?:h\(value\)|s\(value\)|c\(value\)|k\(key\)|m\(key, value\))/gi) ?? [];
  assert.equal(columnAliases.length, 9);
  assert.match(sql, /jsonb_object_keys\(\(?case when jsonb_typeof\(p_proposal -> 'mapping'\) = 'object'[\s\S]*?as k\(key\)/i);
});

test("B4 exige que cada muestra de importación tenga sólo su forma enmascarada", () => {
  const maskedCells = sql.match(/\(c\.value #>> '\{\}'\) !~ '\^\(\?:\[xX9\]\|\[\^\[:alnum:\]\]\)\*\$'/gi) ?? [];
  assert.equal(maskedCells.length, 1);
});

test("B4 delega la validación JSON a funciones puras antes de crear la tabla", () => {
  assert.doesNotMatch(sql, /->\s*'[^']+'\s*-/i);
  for (const name of ["trip_ai_request_is_valid", "trip_ai_proposal_is_valid"]) {
    const definition = sql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, "i"))?.[0] ?? "";
    assert.match(definition, /returns boolean[\s\S]*?language sql[\s\S]*?immutable[\s\S]*?set search_path = public, pg_temp/i, name);
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public`, "i"));
    assert.doesNotMatch(sql, new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to`, "i"));
  }

  const table = sql.match(/create table if not exists public\.trip_ai_requests \([\s\S]*?\n\);/i)?.[0] ?? "";
  assert.match(table, /request jsonb not null check \(public\.trip_ai_request_is_valid\(kind, request\)\)/i);
  assert.match(table, /proposal jsonb null check \(proposal is null or public\.trip_ai_proposal_is_valid\(kind, request, proposal\)\)/i);
  assert.doesNotMatch(table, /check\s*\([\s\S]*?select\s/i);

  for (const name of ["request_trip_ai_proposal", "request_trip_import_mapping"]) {
    const body = sql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, "i"))?.[0] ?? "";
    assert.match(body, /public\.trip_ai_request_is_valid\(/i, name);
  }
  const complete = sql.match(/create or replace function public\.complete_trip_ai_request\([\s\S]*?\n\$\$;/i)?.[0] ?? "";
  assert.match(complete, /public\.trip_ai_proposal_is_valid\(/i);
});
