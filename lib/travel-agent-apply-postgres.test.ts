import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { runCommand, runWithinDeadline } from "./travel-agent-postgres-runner.ts";
import { docker, psql, requireDocker, waitForPostgres } from "./postgres-docker.ts";

const migrations = Array.from({ length: 8 }, (_, index) =>
  new URL(`../supabase/${String(index + 1).padStart(3, "0")}_${[
    "initial", "integrity", "excel_sync", "completed_trip_status", "dias_de_viaje", "ventana_de_compra", "sin_turno", "trip_proposal_apply",
  ][index]}.sql`, import.meta.url),
);

type DeadlineRunner = {
  runCommand(command: string, args: string[], options: { timeoutMs: number; signal?: AbortSignal }): Promise<unknown>;
  runWithinDeadline<T>(timeoutMs: number, work: (signal: AbortSignal) => Promise<T>): Promise<T>;
};

test("B2 runner cancela una fixture privada bloqueada antes de su deadline", async (t) => {
  const runner = await import("./travel-agent-postgres-runner.ts").catch(() => null) as DeadlineRunner | null;
  assert.ok(runner, "falta el runner cancelable para PostgreSQL");

  const directory = await mkdtemp(join(tmpdir(), "travel-agent-postgres-deadline-"));
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });
  const blocker = join(directory, "blocker");
  await writeFile(blocker, "#!/bin/sh\nsleep 5\n", "utf8");
  await chmod(blocker, 0o700);

  const startedAt = performance.now();
  await assert.rejects(
    runner.runCommand(blocker, [], { timeoutMs: 75 }),
    /deadline.*75ms/i,
  );
  assert.ok(performance.now() - startedAt < 1_000, "la fixture bloqueada excedió el límite real");
});

test("B2 runner cancela una fixture privada cuando vence el límite global", async (t) => {
  const runner = await import("./travel-agent-postgres-runner.ts").catch(() => null) as DeadlineRunner | null;
  assert.ok(runner, "falta el runner cancelable para PostgreSQL");
  assert.equal(typeof runner.runWithinDeadline, "function", "falta el límite global cancelable");

  const directory = await mkdtemp(join(tmpdir(), "travel-agent-postgres-global-deadline-"));
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });
  const blocker = join(directory, "blocker");
  await writeFile(blocker, "#!/bin/sh\nsleep 5\n", "utf8");
  await chmod(blocker, 0o700);

  const startedAt = performance.now();
  await assert.rejects(
    runner.runWithinDeadline(75, (signal) => runner.runCommand(blocker, [], { timeoutMs: 1_000, signal })),
    /global deadline 75ms/i,
  );
  assert.ok(performance.now() - startedAt < 1_000, "la fixture bloqueada excedió el límite global real");
});

test("B2 integración PostgreSQL usa el runner cancelable, no procesos síncronos", async () => {
  const source = await readFile(new URL(import.meta.url), "utf8");
  const integration = source.slice(source.lastIndexOf('test("B2 conserva el snapshot'));
  const forbidden = `spawn${"Sync"}`;

  assert.doesNotMatch(integration, new RegExp(forbidden), "el timeout de Node no puede cancelar spawnSync");
  assert.match(integration, /runWithinDeadline/, "la integración debe imponer su propio límite global");
});

test("B2 conserva el snapshot aplicado al reintentar después de una actualización posterior", { timeout: 75_000 }, async (t) => {
  if (!await requireDocker(t)) return;

  const container = `travel-apply-${process.pid}-${Date.now()}`;
  t.after(async () => {
    const cleanup = await runCommand("docker", ["rm", "-f", container], { timeoutMs: 30_000 });
    assert.equal(cleanup.status, 0, `rm -f ${container}\n${cleanup.stdout}\n${cleanup.stderr}`);
  });

  await runWithinDeadline(60_000, async (signal) => {
    await docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=postgres", "postgres:16-alpine"], undefined, 30_000, signal);
    await waitForPostgres(container, signal);

    await psql(container, `
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
    `, signal);
    for (const migration of migrations) await psql(container, await readFile(migration, "utf8"), signal);

    const actor = "11111111-1111-1111-1111-111111111111";
    const trip = "22222222-2222-2222-2222-222222222222";
    await psql(container, `
      insert into public.members (email) values ('member@example.test');
      insert into public.people (id, name, origin, destination, shift, start_date)
      values ('33333333-3333-3333-3333-333333333333', 'Persona de prueba', 'Copiapó', 'Santiago', 'Sin turno', '2026-01-01');
      insert into public.trips (id, person_id, date, direction, origin, destination, baggage, notes)
      values ('${trip}', '33333333-3333-3333-3333-333333333333', '2026-11-12', 'SUBIDA', 'Copiapó', 'Santiago', 'Mochila', 'Antes');
    `, signal);
    const proposal = `'{"requested_time":"09:30","notes":"Aplicado"}'::jsonb`;
    const key = "proposal_snapshot_12345";
    await psql(container, `
      set app.current_user_id = '${actor}';
      set app.current_user_email = 'member@example.test';
      select public.apply_trip_proposal('${trip}', 1, ${proposal}, ${proposal}, '${key}', true);
    `, signal);
    await psql(container, `update public.trips set notes = 'Cambio posterior' where id = '${trip}';`, signal);

    const replay = JSON.parse((await psql(container, `
      set app.current_user_id = '${actor}';
      set app.current_user_email = 'member@example.test';
      select public.apply_trip_proposal('${trip}', 1, ${proposal}, ${proposal}, '${key}', true);
    `, signal)).trim());
    const stored = JSON.parse((await psql(container, `
      select jsonb_build_object(
        'version', version,
        'notes', notes,
        'snapshot', (select applied_trip from public.trip_proposal_receipts where idempotency_key = '${key}')
      ) from public.trips where id = '${trip}';
    `, signal)).trim());

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
});
