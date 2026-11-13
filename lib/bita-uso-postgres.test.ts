// La migración 014 contra un PostgreSQL de verdad: el cupo diario de Bita.
//
// Lo que importa: que solo la llave de servicio toque el contador (el navegador
// no puede reservarse ni devolverse mensajes), que el tope se respete aunque
// lleguen varias preguntas a la vez, y que devolver un mensaje no baje de cero.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runCommand, runWithinDeadline } from "./travel-agent-postgres-runner.ts";
import { docker, psql, requireDocker, waitForPostgres } from "./postgres-docker.ts";

const NOMBRES = [
  "initial", "integrity", "excel_sync", "completed_trip_status",
  "dias_de_viaje", "ventana_de_compra", "sin_turno", "trip_proposal_apply",
  "accesos", "acreditacion", "retira_generate_pulse", "alertas_urgentes",
  "historial_con_correo", "bita_uso",
];
const migrations = NOMBRES.map((nombre, index) =>
  new URL(`../supabase/${String(index + 1).padStart(3, "0")}_${nombre}.sql`, import.meta.url),
);
const ANA = "11111111-1111-4111-8111-111111111111";
const BEA = "22222222-2222-4222-8222-222222222222";

test("014 cupo de Bita: solo la llave de servicio, tope atómico y sin bajar de cero", { timeout: 90_000 }, async (t) => {
  if (!await requireDocker(t)) return;

  const container = `travel-bita-${process.pid}-${Date.now()}`;
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
      create role service_role;
      create table auth.users (id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', nullif(current_setting('app.current_user_email', true), '')) $$;
    `, signal);
    for (const migration of migrations) await psql(container, await readFile(migration, "utf8"), signal);

    const como = (rol: string, sql: string) => `set role ${rol}; ${sql}`;
    const falla = async (rol: string, sql: string) => {
      const resultado = await runCommand(
        "docker",
        ["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
        { input: como(rol, sql), timeoutMs: 30_000, signal },
      );
      assert.notEqual(resultado.status, 0, `${rol} no debía poder: ${sql}`);
      assert.match(resultado.stderr, /permission denied/);
    };
    const servicio = async (sql: string) => (await psql(container, como("service_role", sql), signal)).trim();

    // El navegador, con o sin sesión, no toca el contador ni la tabla.
    for (const rol of ["authenticated", "anon"]) {
      await falla(rol, `select * from public.bita_reserve_message('${ANA}', 20);`);
      await falla(rol, `select public.bita_refund_message('${ANA}');`);
      await falla(rol, `select public.bita_messages_today('${ANA}');`);
      await falla(rol, `select * from public.bita_usage;`);
    }

    // Con la llave de servicio: reserva hasta el tope y después dice que no.
    assert.equal(await servicio(`select public.bita_messages_today('${ANA}');`), "0");
    assert.equal(await servicio(`select allowed || ',' || used from public.bita_reserve_message('${ANA}', 2);`), "true,1");
    assert.equal(await servicio(`select allowed || ',' || used from public.bita_reserve_message('${ANA}', 2);`), "true,2");
    assert.equal(await servicio(`select allowed || ',' || used from public.bita_reserve_message('${ANA}', 2);`), "false,2");
    assert.equal(await servicio(`select public.bita_messages_today('${ANA}');`), "2");

    // Devolver uno libera un lugar; devolver de más nunca baja de cero.
    await servicio(`select public.bita_refund_message('${ANA}');`);
    assert.equal(await servicio(`select public.bita_messages_today('${ANA}');`), "1");
    for (let i = 0; i < 3; i++) await servicio(`select public.bita_refund_message('${ANA}');`);
    assert.equal(await servicio(`select public.bita_messages_today('${ANA}');`), "0");

    // Cada persona tiene su propio cupo.
    assert.equal(await servicio(`select allowed || ',' || used from public.bita_reserve_message('${BEA}', 2);`), "true,1");
    assert.equal(await servicio(`select public.bita_messages_today('${ANA}');`), "0");

    // Tope inválido: no se acepta.
    await assert.rejects(servicio(`select * from public.bita_reserve_message('${ANA}', 0);`));
    await assert.rejects(servicio(`select * from public.bita_reserve_message('${ANA}', 500);`));

    // Varias preguntas a la vez no pasan el tope.
    const paralelas = await Promise.all(
      Array.from({ length: 8 }, () => servicio(`select allowed from public.bita_reserve_message('${BEA}', 5);`)),
    );
    assert.equal(paralelas.filter((valor) => valor === "t" || valor === "true").length, 4, "quedaban 4 de 5");
    assert.equal(await servicio(`select public.bita_messages_today('${BEA}');`), "5");
  });
});
