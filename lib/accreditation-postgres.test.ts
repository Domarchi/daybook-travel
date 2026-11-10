// La migración 010 (acreditación) contra un PostgreSQL de verdad, con las nueve
// anteriores aplicadas en orden.
//
// Se comprueba lo que vive en la base: quién puede definir los tipos de
// documento, quién puede cargar las fechas, que nadie puede borrar y que todo
// queda en el historial.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runCommand, runWithinDeadline } from "./travel-agent-postgres-runner.ts";
import { docker, psql, requireDocker, waitForPostgres } from "./postgres-docker.ts";

const NOMBRES = [
  "initial", "integrity", "excel_sync", "completed_trip_status",
  "dias_de_viaje", "ventana_de_compra", "sin_turno", "trip_proposal_apply",
  "accesos", "acreditacion",
];
const migrations = NOMBRES.map((nombre, index) =>
  new URL(`../supabase/${String(index + 1).padStart(3, "0")}_${nombre}.sql`, import.meta.url),
);

const ADMIN = "admin@example.test";
const ANA = "ana@example.test";
const AFUERA = "afuera@example.test";
const ID: Record<string, string> = {
  [ADMIN]: "11111111-1111-1111-1111-111111111111",
  [ANA]: "22222222-2222-2222-2222-222222222222",
  [AFUERA]: "33333333-3333-3333-3333-333333333333",
};
const PERSONA = "44444444-4444-4444-4444-444444444444";

test("010 acreditación: quién define los documentos, quién carga las fechas y qué queda auditado", { timeout: 90_000 }, async (t) => {
  if (!await requireDocker(t)) return;

  const container = `travel-accreditation-${process.pid}-${Date.now()}`;
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

    // Hasta la 008 con la lista de miembros como estaba, luego 009 y 010.
    for (const migration of migrations.slice(0, 8)) await psql(container, await readFile(migration, "utf8"), signal);
    await psql(container, `insert into public.members (email) values ('${ADMIN}'), ('${ANA}');`, signal);
    await psql(container, await readFile(migrations[8], "utf8"), signal);
    await psql(container, `update public.members set role = 'admin' where email = '${ADMIN}';`, signal);
    await psql(container, await readFile(migrations[9], "utf8"), signal);
    await psql(container, `
      insert into public.people (id, name, origin, destination, shift, start_date)
      values ('${PERSONA}', 'Persona de prueba', 'Santiago', 'Copiapó', 'Sin turno', '2026-01-01');
    `, signal);

    const como = (email: string, sql: string, rol = "authenticated") => `
      set app.current_user_id = '${ID[email]}';
      set app.current_user_email = '${email}';
      set role ${rol};
      ${sql}
    `;
    const consulta = async (email: string, sql: string, rol?: string) =>
      (await psql(container, como(email, sql, rol), signal)).trim();
    const falla = async (email: string, sql: string, patron: RegExp, rol = "authenticated") => {
      const resultado = await runCommand(
        "docker",
        ["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
        { input: como(email, sql, rol), timeoutMs: 30_000, signal },
      );
      assert.notEqual(resultado.status, 0, `debía fallar: ${sql}`);
      assert.match(resultado.stderr, patron, sql);
    };
    const cuenta = async (sql: string) => Number(await psql(container, sql, signal));

    // Solo un administrador define qué documentos se exigen.
    await consulta(ADMIN, `insert into public.document_types (name) values ('Examen médico');`);
    await falla(ANA, `insert into public.document_types (name) values ('Inducción');`, /row-level security/);

    // Un miembro común lo lee, pero no puede cambiarlo: la actualización no toca ninguna fila.
    assert.equal(await consulta(ANA, `select count(*) from public.document_types;`), "1");
    await consulta(ANA, `update public.document_types set active = false;`);
    assert.equal(await consulta(ADMIN, `select active from public.document_types;`), "t");

    // El nombre no se repite aunque cambien mayúsculas o espacios de los bordes.
    await falla(ADMIN, `insert into public.document_types (name) values (' EXAMEN MÉDICO ');`, /duplicate key/);
    await falla(ADMIN, `insert into public.document_types (name) values ('x');`, /check constraint/);

    // Quien no es miembro no ve nada, y sin sesión tampoco.
    assert.equal(await consulta(AFUERA, `select count(*) from public.document_types;`), "0");
    await falla(ADMIN, `select * from public.document_types;`, /permission denied/, "anon");

    // Cualquier miembro carga las fechas de las personas; no hay dos por persona y tipo.
    const tipo = await consulta(ADMIN, `select id from public.document_types limit 1;`);
    await consulta(ANA, `
      insert into public.person_documents (person_id, type_id, expires_on)
      values ('${PERSONA}', '${tipo}', '2026-06-30');
    `);
    await falla(ANA, `
      insert into public.person_documents (person_id, type_id, expires_on)
      values ('${PERSONA}', '${tipo}', '2027-01-01');
    `, /duplicate key/);
    await consulta(ANA, `
      insert into public.person_documents (person_id, type_id, expires_on)
      values ('${PERSONA}', '${tipo}', '2027-01-01')
      on conflict (person_id, type_id) do update set expires_on = excluded.expires_on;
    `);
    assert.equal(await consulta(ANA, `select expires_on from public.person_documents;`), "2027-01-01");
    // Quitar una fecha es dejarla en null, no borrar la fila.
    await consulta(ANA, `update public.person_documents set expires_on = null;`);
    assert.equal(await cuenta(`select count(*) from public.person_documents where expires_on is null;`), 1);
    assert.equal(await consulta(AFUERA, `select count(*) from public.person_documents;`), "0");

    // Nadie borra nada, ni siquiera un administrador.
    await falla(ADMIN, `delete from public.document_types;`, /permission denied/);
    await falla(ADMIN, `delete from public.person_documents;`, /permission denied/);

    // Dejar de exigir es desactivar.
    await consulta(ADMIN, `update public.document_types set active = false;`);
    assert.equal(await cuenta(`select count(*) from public.document_types where not active;`), 1);

    // Quedó todo auditado, con quién lo hizo.
    const auditoria = JSON.parse((await psql(container, `
      select jsonb_build_object(
        'tipos', count(*) filter (where entity = 'document_types'),
        'documentos', count(*) filter (where entity = 'person_documents'),
        'sinActor', count(*) filter (where actor is null)
      ) from public.history where entity in ('document_types', 'person_documents');
    `, signal)).trim());
    // Tipos: el alta y la desactivación. Documentos: alta, cambio de fecha y fecha en null.
    assert.deepEqual(auditoria, { tipos: 2, documentos: 3, sinActor: 0 });
  });
});
