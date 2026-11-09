// La migración 009 (accesos) contra un PostgreSQL de verdad, con las ocho
// migraciones anteriores aplicadas en orden y una lista de miembros que ya
// existía antes de ella, como en producción.
//
// Se comprueba lo que importa de una regla que vive en SQL: quién puede
// llamarla, qué le prohíbe el sistema aunque la pantalla lo permitiera, y que
// todo queda en el historial.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runCommand, runWithinDeadline } from "./travel-agent-postgres-runner.ts";
import { docker, psql, requireDocker, waitForPostgres } from "./postgres-docker.ts";

const NOMBRES = [
  "initial", "integrity", "excel_sync", "completed_trip_status",
  "dias_de_viaje", "ventana_de_compra", "sin_turno", "trip_proposal_apply", "accesos",
];
const migrations = NOMBRES.map((nombre, index) =>
  new URL(`../supabase/${String(index + 1).padStart(3, "0")}_${nombre}.sql`, import.meta.url),
);

const DUENO = "joaquindomarchi@gmail.com";
const ANA = "ana@example.test";
const ID: Record<string, string> = {
  [DUENO]: "11111111-1111-1111-1111-111111111111",
  [ANA]: "22222222-2222-2222-2222-222222222222",
  "nuevo@example.test": "33333333-3333-3333-3333-333333333333",
};

test("009 accesos: quién puede administrar la lista, qué se les prohíbe y qué queda auditado", { timeout: 90_000 }, async (t) => {
  if (!await requireDocker(t)) return;

  const container = `travel-members-${process.pid}-${Date.now()}`;
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

    // Hasta la 008, como estaba producción antes de esta migración.
    for (const migration of migrations.slice(0, 8)) await psql(container, await readFile(migration, "utf8"), signal);
    await psql(container, `
      insert into public.members (email) values ('${DUENO}'), ('${ANA}');
    `, signal);
    await psql(container, await readFile(migrations[8], "utf8"), signal);

    // Quién llama, con el rol de base de datos que tendría el navegador.
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
    const lista = async (email = DUENO) =>
      JSON.parse(await consulta(email, `select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.list_members() m;`)) as
        { email: string; role: string; active: boolean }[];
    const conteoHistorial = async () =>
      Number(await psql(container, `select count(*) from public.history where entity = 'members';`, signal));

    // La migración ascendió al dueño y dejó al resto como miembro, activos.
    const inicial = await lista();
    assert.deepEqual(
      inicial.map(({ email, role, active }) => ({ email, role, active })),
      [
        { email: DUENO, role: "admin", active: true },
        { email: ANA, role: "member", active: true },
      ],
    );
    assert.equal(
      Number(await psql(container, `select count(distinct id) from public.members where id is not null;`, signal)),
      2,
      "cada miembro existente recibe su propio id",
    );

    // Un miembro común no administra nada.
    assert.equal(await consulta(ANA, `select public.is_member();`), "t");
    assert.equal(await consulta(ANA, `select public.is_admin();`), "f");
    await falla(ANA, `select * from public.list_members();`, /Acceso no autorizado/);
    await falla(ANA, `select public.add_member('x@example.test');`, /Acceso no autorizado/);
    await falla(ANA, `select public.set_member_active('${DUENO}', false);`, /Acceso no autorizado/);
    await falla(ANA, `select public.set_member_role('${ANA}', 'admin');`, /Acceso no autorizado/);

    // El navegador nunca toca la tabla, ni sin sesión ejecuta las funciones.
    await falla(ANA, `select * from public.members;`, /permission denied/);
    await falla(ANA, `update public.members set role = 'admin' where email = '${ANA}';`, /permission denied/);
    await falla(ANA, `select public.list_members();`, /Acceso no autorizado/);
    await falla(DUENO, `select public.list_members();`, /permission denied for function/, "anon");
    await falla(DUENO, `select public.add_member('x@example.test');`, /permission denied for function/, "anon");

    // Agregar: normaliza, valida y no pisa a quien ya tiene acceso.
    await consulta(DUENO, `select public.add_member('  Nuevo@Example.test ');`);
    const nuevo = (await lista()).find((fila) => fila.email === "nuevo@example.test");
    assert.ok(nuevo, "el correo quedó en minúsculas y sin espacios");
    assert.deepEqual({ role: nuevo.role, active: nuevo.active }, { role: "member", active: true });
    await falla(DUENO, `select public.add_member('nuevo@example.test');`, /ya tiene acceso/);
    await falla(DUENO, `select public.add_member('no-es-un-correo');`, /correo válido/);
    await falla(DUENO, `select public.add_member('con espacio@example.test');`, /correo válido/);
    await falla(DUENO, `select public.add_member('');`, /correo válido/);
    await falla(DUENO, `select public.add_member('otro@example.test', 'superadmin');`, /rol debe ser/);

    // Quitar es desactivar: deja de ser miembro, pero la fila queda.
    await consulta(DUENO, `select public.set_member_active('nuevo@example.test', false);`);
    assert.equal(await consulta("nuevo@example.test", `select public.is_member();`), "f");
    assert.equal((await lista()).find((fila) => fila.email === "nuevo@example.test")?.active, false);
    assert.equal(await psql(container, `select count(*) from public.members where email = 'nuevo@example.test';`, signal), "1\n");

    // Volver a darle acceso lo reactiva, con el rol que se pida.
    await consulta(DUENO, `select public.add_member('nuevo@example.test', 'admin');`);
    assert.equal(await consulta("nuevo@example.test", `select public.is_admin();`), "t");
    await consulta(DUENO, `select public.set_member_role('nuevo@example.test', 'member');`);
    assert.equal(await consulta("nuevo@example.test", `select public.is_admin();`), "f");

    // Nadie se encierra a sí mismo fuera, ni deja el sistema sin administrador.
    await falla(DUENO, `select public.set_member_active('${DUENO}', false);`, /tu propio acceso/);
    await falla(DUENO, `select public.set_member_role('${DUENO}', 'member');`, /tu propio rol/);
    await falla(DUENO, `select public.set_member_active('fantasma@example.test', true);`, /no está en la lista/);
    await falla(DUENO, `select public.set_member_role('fantasma@example.test', 'admin');`, /no está en la lista/);

    // Un administrador promovido puede administrar; al bajarlo, deja de poder.
    await consulta(DUENO, `select public.set_member_role('${ANA}', 'admin');`);
    await consulta(ANA, `select public.add_member('tercero@example.test');`);
    await consulta(DUENO, `select public.set_member_role('${ANA}', 'member');`);
    await falla(ANA, `select public.add_member('cuarto@example.test');`, /Acceso no autorizado/);

    // Repetir lo mismo no ensucia el historial.
    const antes = await conteoHistorial();
    await consulta(DUENO, `select public.set_member_active('${ANA}', true);`);
    await consulta(DUENO, `select public.set_member_role('${ANA}', 'member');`);
    assert.equal(await conteoHistorial(), antes, "un cambio que no cambia nada no deja rastro");

    // Todo lo anterior quedó auditado, con quién lo hizo.
    const auditoria = JSON.parse((await psql(container, `
      select jsonb_build_object(
        'altas', count(*) filter (where action = 'INSERT'),
        'cambios', count(*) filter (where action = 'UPDATE'),
        'sinActor', count(*) filter (where actor is null),
        'actores', coalesce(jsonb_agg(distinct actor), '[]')
      ) from public.history where entity = 'members';
    `, signal)).trim());
    assert.equal(auditoria.altas, 2, "nuevo y tercero");
    // Desactivar, reactivar, bajar a miembro, subir a Ana y volver a bajarla. El ascenso del
    // dueño ocurre dentro de la migración, antes de que exista el disparador.
    assert.equal(auditoria.cambios, 5);
    assert.equal(auditoria.sinActor, 0);
    assert.ok(auditoria.actores.every((actor: string) => Object.values(ID).includes(actor)));

    // El historial de accesos lo lee un administrador; el resto del historial, todos.
    await psql(container, `
      insert into public.history (entity, record_id, actor, action, after_data)
      values ('trips', gen_random_uuid(), '${ID[DUENO]}', 'INSERT', '{}');
    `, signal);
    const visibles = async (email: string, entidad: string) =>
      Number(await consulta(email, `select count(*) from public.history where entity = '${entidad}';`));
    assert.ok(await visibles(DUENO, "members") > 0, "el administrador ve los accesos");
    assert.equal(await visibles(ANA, "members"), 0, "un miembro común no los ve");
    assert.equal(await visibles(ANA, "trips"), 1, "el resto del historial sigue abierto a todos");
  });
});
