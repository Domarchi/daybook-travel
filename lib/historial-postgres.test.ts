// La migración 013 (el correo del autor en el historial) contra un PostgreSQL
// de verdad, con las doce anteriores aplicadas en orden.
//
// Lo que importa es a quién le dice qué: un correo es un dato de otra persona,
// así que se comprueba que solo lo vea un miembro, solo de quien aparece en un
// historial que ese miembro ya puede leer, y nunca sin sesión.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runCommand, runWithinDeadline } from "./travel-agent-postgres-runner.ts";
import { docker, psql, requireDocker, waitForPostgres } from "./postgres-docker.ts";

const NOMBRES = [
  "initial", "integrity", "excel_sync", "completed_trip_status",
  "dias_de_viaje", "ventana_de_compra", "sin_turno", "trip_proposal_apply",
  "accesos", "acreditacion", "retira_generate_pulse", "alertas_urgentes",
  "historial_con_correo",
];
const migrations = NOMBRES.map((nombre, index) =>
  new URL(`../supabase/${String(index + 1).padStart(3, "0")}_${nombre}.sql`, import.meta.url),
);

// Cuentas de Auth. ADMIN y ANA editan viajes; OTRO es administrador y solo tocó
// accesos; QUIETO tiene cuenta y acceso pero nunca cambió nada; FUERA tiene
// cuenta de Daybook pero no acceso a Travel.
const CUENTAS = {
  admin: { id: "11111111-1111-1111-1111-111111111111", email: "admin@example.test" },
  ana: { id: "22222222-2222-2222-2222-222222222222", email: "Ana@Example.test" },
  otro: { id: "33333333-3333-3333-3333-333333333333", email: "otro@example.test" },
  quieto: { id: "44444444-4444-4444-4444-444444444444", email: "quieto@example.test" },
  fuera: { id: "55555555-5555-5555-5555-555555555555", email: "fuera@example.test" },
};
const TODOS = Object.values(CUENTAS).map((cuenta) => cuenta.id);

test("013 historial: el correo del autor, solo para miembros y solo de quien ya ven en el historial", { timeout: 90_000 }, async (t) => {
  if (!await requireDocker(t)) return;

  const container = `travel-historial-${process.pid}-${Date.now()}`;
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
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('app.current_user_id', true), '')::uuid
      $$;
      create function auth.jwt() returns jsonb language sql stable as $$
        select jsonb_build_object('email', nullif(current_setting('app.current_user_email', true), ''))
      $$;
    `, signal);
    for (const migration of migrations) await psql(container, await readFile(migration, "utf8"), signal);

    const { admin, ana, otro, quieto, fuera } = CUENTAS;
    await psql(container, `
      insert into auth.users (id, email) values
        ${Object.values(CUENTAS).map((c) => `('${c.id}', '${c.email}')`).join(", ")};
      insert into public.members (email, role) values
        ('${admin.email}', 'admin'), ('${ana.email.toLowerCase()}', 'member'),
        ('${otro.email}', 'admin'), ('${quieto.email}', 'member');
      -- El historial, escrito directo: lo que importa aquí es quién aparece.
      insert into public.history (entity, record_id, actor, action, after_data) values
        ('trips', gen_random_uuid(), '${admin.id}', 'INSERT', '{}'),
        ('trips', gen_random_uuid(), '${ana.id}', 'UPDATE', '{}'),
        ('trips', gen_random_uuid(), null, 'UPDATE', '{}'),
        ('members', gen_random_uuid(), '${otro.id}', 'UPDATE', '{}');
    `, signal);

    const como = (cuenta: { id: string; email: string }, sql: string, rol = "authenticated") => `
      set app.current_user_id = '${cuenta.id}';
      set app.current_user_email = '${cuenta.email.toLowerCase()}';
      set role ${rol};
      ${sql}
    `;
    const pedir = `select coalesce(jsonb_object_agg(id, email), '{}') from public.history_actors(array['${TODOS.join("','")}']::uuid[]);`;
    const filasDelHistorial = async () => (await psql(container, "select count(*) from public.history;", signal)).trim();
    const antes = await filasDelHistorial();
    const correos = async (cuenta: { id: string; email: string }) =>
      JSON.parse((await psql(container, como(cuenta, pedir), signal)).trim()) as Record<string, string>;

    // Un miembro común ve a quienes editaron viajes, con el correo en minúsculas.
    // No ve a quien solo tocó accesos (ese historial no lo puede leer), ni a
    // quien tiene cuenta y nunca cambió nada.
    assert.deepEqual(await correos(ana), {
      [admin.id]: admin.email,
      [ana.id]: ana.email.toLowerCase(),
    });

    // Un administrador lee también el historial de accesos, así que ve a OTRO.
    assert.deepEqual(await correos(admin), {
      [admin.id]: admin.email,
      [ana.id]: ana.email.toLowerCase(),
      [otro.id]: otro.email,
    });

    // Con cuenta de Daybook pero sin acceso a Travel: nada. Falla cerrado.
    assert.deepEqual(await correos(fuera), {});

    // Nadie con acceso pide un correo que no esté en el historial.
    assert.equal(Object.hasOwn(await correos(admin), quieto.id), false);

    // Sin sesión, ni siquiera se puede llamar.
    const anonimo = await runCommand(
      "docker",
      ["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
      { input: como(ana, pedir, "anon"), timeoutMs: 30_000, signal },
    );
    assert.notEqual(anonimo.status, 0, "anon no debía poder llamarla");
    assert.match(anonimo.stderr, /permission denied for function/);

    // El navegador sigue sin poder leer auth.users por su cuenta.
    const directo = await runCommand(
      "docker",
      ["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
      { input: como(ana, "select email from auth.users;"), timeoutMs: 30_000, signal },
    );
    assert.notEqual(directo.status, 0, "authenticated no debía leer auth.users");
    assert.match(directo.stderr, /permission denied/);

    // Y la función no escribe nada: el historial queda como estaba.
    assert.equal(await filasDelHistorial(), antes);
  });
});
