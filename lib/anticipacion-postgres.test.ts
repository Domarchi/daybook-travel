// La migración 015 contra un PostgreSQL de verdad: antes, cualquier miembro
// cambiaba la ventana de compra; después, solo un administrador. Leer sigue
// abierto a los miembros y cada cambio queda en el historial.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runCommand, runWithinDeadline } from "./travel-agent-postgres-runner.ts";
import { docker, psql, requireDocker, waitForPostgres } from "./postgres-docker.ts";

const NOMBRES = [
  "initial", "integrity", "excel_sync", "completed_trip_status",
  "dias_de_viaje", "ventana_de_compra", "sin_turno", "trip_proposal_apply", "accesos",
];
const previas = NOMBRES.map((nombre, index) =>
  new URL(`../supabase/${String(index + 1).padStart(3, "0")}_${nombre}.sql`, import.meta.url),
);
const migracion = new URL("../supabase/015_anticipacion_solo_admin.sql", import.meta.url);

const DUENO = "joaquindomarchi@gmail.com";
const ANA = "ana@example.test";
const ID: Record<string, string> = {
  [DUENO]: "11111111-1111-1111-1111-111111111111",
  [ANA]: "22222222-2222-2222-2222-222222222222",
};

test("015: la anticipación la cambia solo un administrador; leer y auditar siguen igual", { timeout: 90_000 }, async (t) => {
  if (!await requireDocker(t)) return;

  const container = `travel-anticipacion-${process.pid}-${Date.now()}`;
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
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('app.current_user_id', true), '')::uuid
      $$;
      create function auth.jwt() returns jsonb language sql stable as $$
        select jsonb_build_object('email', nullif(current_setting('app.current_user_email', true), ''))
      $$;
    `, signal);

    for (const archivo of previas.slice(0, 8)) await psql(container, await readFile(archivo, "utf8"), signal);
    await psql(container, `insert into public.members (email) values ('${DUENO}'), ('${ANA}');`, signal);
    await psql(container, await readFile(previas[8], "utf8"), signal);
    // Lo que Supabase concede por omisión al rol del navegador sobre public.
    await psql(container, `
      grant usage on schema public to authenticated;
      grant select, update on public.settings to authenticated;
    `, signal);

    const como = (email: string, sql: string) => `
      set app.current_user_id = '${ID[email]}';
      set app.current_user_email = '${email}';
      set role authenticated;
      ${sql}
    `;
    const consulta = async (email: string, sql: string) => (await psql(container, como(email, sql), signal)).trim();
    const ventana = async () => Number(await psql(container, `select purchase_window_days from public.settings;`, signal));
    const cambia = (email: string, dias: number) =>
      consulta(email, `with f as (update public.settings set purchase_window_days = ${dias} returning 1) select count(*) from f;`);
    const historial = async () =>
      Number(await psql(container, `select count(*) from public.history where entity = 'settings';`, signal));

    // Antes de la 015: un miembro común cambiaba la ventana de todo el equipo.
    assert.equal(await consulta(ANA, `select public.is_admin();`), "f");
    assert.equal(await cambia(ANA, 30), "1", "la 006 dejaba escribir a cualquier miembro");
    assert.equal(await ventana(), 30);

    await psql(container, await readFile(migracion, "utf8"), signal);

    // Después: el miembro común sigue leyendo, pero su cambio no toca nada.
    assert.equal(await consulta(ANA, `select purchase_window_days from public.settings;`), "30");
    const antes = await historial();
    assert.equal(await cambia(ANA, 45), "0", "un miembro común ya no cambia la ventana");
    assert.equal(await ventana(), 30);
    assert.equal(await historial(), antes, "sin cambio, sin historial");

    // El administrador sí, y queda auditado.
    assert.equal(await consulta(DUENO, `select public.is_admin();`), "t");
    assert.equal(await cambia(DUENO, 14), "1");
    assert.equal(await ventana(), 14);
    assert.equal(await historial(), antes + 1, "el cambio del administrador queda en el historial");

    // La política nueva es la única de escritura y la lectura no cambió.
    const politicas = await psql(container, `
      select policyname || ':' || cmd || ':' || qual
      from pg_policies where schemaname = 'public' and tablename = 'settings' order by policyname;
    `, signal);
    assert.match(politicas, /settings_read:SELECT:is_member\(\)/);
    assert.match(politicas, /settings_update:UPDATE:is_admin\(\)/);
  });
});
