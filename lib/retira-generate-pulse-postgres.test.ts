// La migración 011 retira generate_pulse() sin tocar nada más.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runCommand, runWithinDeadline } from "./travel-agent-postgres-runner.ts";
import { docker, psql, requireDocker, waitForPostgres } from "./postgres-docker.ts";

const NOMBRES = [
  "initial", "integrity", "excel_sync", "completed_trip_status",
  "dias_de_viaje", "ventana_de_compra", "sin_turno", "trip_proposal_apply",
  "accesos", "acreditacion", "retira_generate_pulse",
];
const migrations = NOMBRES.map((nombre, index) =>
  new URL(`../supabase/${String(index + 1).padStart(3, "0")}_${nombre}.sql`, import.meta.url),
);

test("011 retira generate_pulse() y deja intacto el resto del esquema", { timeout: 90_000 }, async (t) => {
  if (!await requireDocker(t)) return;

  const container = `travel-pulse-${process.pid}-${Date.now()}`;
  t.after(async () => {
    const cleanup = await runCommand("docker", ["rm", "-f", container], { timeoutMs: 30_000 });
    assert.equal(cleanup.status, 0, `rm -f ${container}\n${cleanup.stdout}\n${cleanup.stderr}`);
  });

  await runWithinDeadline(80_000, async (signal) => {
    await docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=postgres", "postgres:16-alpine"], undefined, 30_000, signal);
    await waitForPostgres(container, signal);
    await psql(container, `
      create extension if not exists pgcrypto;
      create schema auth;
      create role anon;
      create role authenticated;
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    `, signal);

    const existe = async () =>
      Number(await psql(container, `select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'generate_pulse';`, signal));
    const otras = async () =>
      (await psql(container, `select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';`, signal)).trim();

    for (const migration of migrations.slice(0, 10)) await psql(container, await readFile(migration, "utf8"), signal);
    assert.equal(await existe(), 1, "antes de la 011 la función existe");
    const antes = await otras();

    await psql(container, await readFile(migrations[10], "utf8"), signal);
    assert.equal(await existe(), 0, "la 011 la retira");
    assert.equal(
      (await otras()).split(",").sort().join(","),
      antes.split(",").filter((nombre) => nombre !== "generate_pulse").sort().join(","),
      "ninguna otra función cambió",
    );

    // Aplicarla de nuevo no falla.
    await psql(container, await readFile(migrations[10], "utf8"), signal);
  });
});
