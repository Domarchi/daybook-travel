import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repo = new URL("..", import.meta.url);
const migrations = Array.from({ length: 8 }, (_, index) =>
  new URL(`../supabase/${String(index + 1).padStart(3, "0")}_${[
    "initial", "integrity", "excel_sync", "completed_trip_status", "dias_de_viaje", "ventana_de_compra", "sin_turno", "trip_proposal_apply",
  ][index]}.sql`, import.meta.url),
);

function docker(args: string[], input?: string) {
  const result = spawnSync("docker", args, { encoding: "utf8", input, timeout: 120_000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

function psql(container: string, sql: string): string {
  return docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], sql);
}

test("B2 conserva el snapshot aplicado al reintentar después de una actualización posterior", { timeout: 60_000 }, async (t) => {
  const available = spawnSync("docker", ["info"], { encoding: "utf8", timeout: 15_000 });
  if (available.status !== 0) return t.skip("Docker no está disponible para la prueba PostgreSQL aislada");

  const container = `travel-apply-${process.pid}-${Date.now()}`;
  t.after(() => { spawnSync("docker", ["rm", "-f", container], { encoding: "utf8", timeout: 30_000 }); });
  docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=postgres", "postgres:16-alpine"]);

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const ready = spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], { encoding: "utf8", timeout: 5_000 });
    const query = ready.status === 0
      ? spawnSync("docker", ["exec", container, "psql", "-qAt", "-U", "postgres", "-d", "postgres", "-c", "select 1"], { encoding: "utf8", timeout: 5_000 })
      : null;
    if (query?.status === 0) break;
    if (attempt === 29) assert.fail(`PostgreSQL aislado no inició: ${ready.stderr} ${query?.stderr ?? ""}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  psql(container, `
    create extension if not exists pgcrypto;
    create schema auth;
    create role anon;
    create role authenticated;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('app.current_user_id', true), '')::uuid
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select jsonb_build_object('email', nullif(current_setting('app.current_user_email', true), ''))
    $$;
  `);
  for (const migration of migrations) psql(container, await readFile(migration, "utf8"));

  const actor = "11111111-1111-1111-1111-111111111111";
  const trip = "22222222-2222-2222-2222-222222222222";
  psql(container, `
    insert into public.members (email) values ('member@example.test');
    insert into public.people (id, name, origin, destination, shift, start_date)
    values ('33333333-3333-3333-3333-333333333333', 'Persona de prueba', 'Copiapó', 'Santiago', 'Sin turno', '2026-01-01');
    insert into public.trips (id, person_id, date, direction, origin, destination, baggage, notes)
    values ('${trip}', '33333333-3333-3333-3333-333333333333', '2026-11-12', 'SUBIDA', 'Copiapó', 'Santiago', 'Mochila', 'Antes');
  `);
  const proposal = `'{"requested_time":"09:30","notes":"Aplicado"}'::jsonb`;
  const key = "proposal_snapshot_12345";
  psql(container, `
    set app.current_user_id = '${actor}';
    set app.current_user_email = 'member@example.test';
    select public.apply_trip_proposal('${trip}', 1, ${proposal}, ${proposal}, '${key}', true);
  `);
  psql(container, `update public.trips set notes = 'Cambio posterior' where id = '${trip}';`);

  const replay = JSON.parse(psql(container, `
    set app.current_user_id = '${actor}';
    set app.current_user_email = 'member@example.test';
    select public.apply_trip_proposal('${trip}', 1, ${proposal}, ${proposal}, '${key}', true);
  `).trim());
  const stored = JSON.parse(psql(container, `
    select jsonb_build_object(
      'version', version,
      'notes', notes,
      'snapshot', (select applied_trip from public.trip_proposal_receipts where idempotency_key = '${key}')
    ) from public.trips where id = '${trip}';
  `).trim());

  assert.equal(replay.ok, true);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.trip, {
    id: trip,
    version: 2,
    date: "2026-11-12",
    requested_time: "09:30:00",
    baggage: "Mochila",
    notes: "Aplicado",
  });
  assert.equal(replay.receipt.applied_version, 2);
  assert.deepEqual(stored, {
    version: 3,
    notes: "Cambio posterior",
    snapshot: replay.trip,
  });
  assert.deepEqual(Object.keys(replay.trip).sort(), ["baggage", "date", "id", "notes", "requested_time", "version"]);
  assert.doesNotMatch(JSON.stringify(replay), /pnr|flight|amount|origin|destination|person_id/i);
});
