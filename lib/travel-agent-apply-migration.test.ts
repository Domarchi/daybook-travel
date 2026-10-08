import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../supabase/008_trip_proposal_apply.sql", import.meta.url), "utf8");

test("B2 migration defines an authenticated, locked, append-only apply boundary", () => {
  assert.match(sql, /create table if not exists public\.trip_proposal_receipts/i);
  assert.match(sql, /unique \(idempotency_key\)/i);
  assert.match(sql, /before update or delete on public\.trip_proposal_receipts/i);
  assert.match(sql, /security definer[\s\S]*?if v_actor is null or not public\.is_member\(\) then[\s\S]*?no_autorizado/i);
  assert.match(sql, /pg_advisory_xact_lock[\s\S]*?select \* into v_receipt[\s\S]*?where idempotency_key = p_idempotency_key/i);
  assert.match(sql, /if v_trip\.version <> p_expected_version then raise exception 'version_obsoleta'/i);
  assert.match(sql, /if p_confirmed is distinct from true then[\s\S]*?confirmacion_requerida/i);
  assert.match(sql, /insert into public\.trip_proposal_receipts[\s\S]*?returning \* into v_receipt/i);
});

test("B2 migration fails closed for receipts and binds every replay to the authenticated actor", () => {
  assert.match(sql, /alter table public\.trip_proposal_receipts enable row level security/i);
  assert.match(sql, /revoke all on public\.trip_proposal_receipts from public, anon, authenticated/i);
  assert.match(sql, /v_actor uuid := auth\.uid\(\)/i);
  assert.doesNotMatch(sql, /p_actor\b/i);
  assert.match(sql, /v_receipt\.actor <> v_actor[\s\S]*?v_receipt\.trip_id <> p_trip_id[\s\S]*?v_receipt\.expected_version <> p_expected_version[\s\S]*?v_receipt\.proposal_identity <> p_proposal_identity[\s\S]*?idempotency_key_reused/i);
  assert.match(sql, /revoke all on function public\.apply_trip_proposal\([^)]*\) from public/i);
  assert.match(sql, /grant execute on function public\.apply_trip_proposal\([^)]*\) to authenticated/i);
});

test("B2 migration serializes the receipt before the only trip UPDATE and returns the stored receipt on replay", () => {
  const lock = sql.indexOf("pg_advisory_xact_lock");
  const receiptLookup = sql.indexOf("where idempotency_key = p_idempotency_key", lock);
  const update = sql.indexOf("update public.trips", receiptLookup);
  const receiptInsert = sql.indexOf("insert into public.trip_proposal_receipts", update);
  assert.ok(lock >= 0 && receiptLookup > lock && update > receiptLookup && receiptInsert > update);
  assert.match(sql, /if found then[\s\S]*?'replayed', true[\s\S]*?'proposal_identity', v_receipt\.proposal_identity[\s\S]*?'applied_version', v_receipt\.applied_version/i);
});

test("B2 migration rejects unallowlisted proposal keys and its UPDATE contains only B1 columns", () => {
  assert.match(sql, /where k\.key not in \('date', 'requested_time', 'baggage', 'notes'\)[\s\S]*?campo_no_permitido/i);
  const update = sql.match(/update public\.trips\s+set([\s\S]*?)\s+where id = v_trip\.id/i)?.[1] ?? "";
  assert.match(update, /date =/);
  assert.match(update, /requested_time =/);
  assert.match(update, /baggage =/);
  assert.match(update, /notes =/);
  assert.doesNotMatch(update, /\b(?:pnr|flight|amount|status|origin|destination|person_id)\s*=/i);
});


test("B2 migration accepts canonical ISO date/time literals without escaped regex artifacts", () => {
  assert.match(sql, /\^\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}\$/);
  assert.match(sql, /\[01\]\[0-9\]\|2\[0-3\]/);
  assert.doesNotMatch(sql, /\\\\d\{4\}/);
});
