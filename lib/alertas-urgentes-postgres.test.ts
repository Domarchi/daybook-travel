// La migración 012 contra un PostgreSQL de verdad: la función que lee el cron.
//
// Lo que importa: que solo la llave de servicio pueda llamarla (ni el navegador
// con sesión, ni sin sesión), que no devuelva lo que no corresponde, y que lo que
// devuelve alcance para armar el aviso sin tocar las tablas.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runCommand, runWithinDeadline } from "./travel-agent-postgres-runner.ts";
import { docker, psql, requireDocker, waitForPostgres } from "./postgres-docker.ts";

const NOMBRES = [
  "initial", "integrity", "excel_sync", "completed_trip_status",
  "dias_de_viaje", "ventana_de_compra", "sin_turno", "trip_proposal_apply",
  "accesos", "acreditacion", "retira_generate_pulse", "alertas_urgentes",
];
const migrations = NOMBRES.map((nombre, index) =>
  new URL(`../supabase/${String(index + 1).padStart(3, "0")}_${nombre}.sql`, import.meta.url),
);

test("012 alertas: solo la llave de servicio lee los viajes por comprar, y solo los que corresponden", { timeout: 90_000 }, async (t) => {
  if (!await requireDocker(t)) return;

  const container = `travel-alerts-${process.pid}-${Date.now()}`;
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
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', nullif(current_setting('app.current_user_email', true), '')) $$;
    `, signal);
    for (const migration of migrations) await psql(container, await readFile(migration, "utf8"), signal);

    // Una persona y viajes en distintos días respecto de hoy en Santiago.
    await psql(container, `
      insert into public.members (email) values ('ana@example.test');
      insert into public.people (id, name, origin, destination, shift, start_date)
      values ('44444444-4444-4444-4444-444444444444', 'Persona de prueba', 'Santiago', 'Copiapó', 'Sin turno', '2020-01-01');
      create temp table hoy as select (now() at time zone 'America/Santiago')::date as d;
      -- Se insertan con el rol dueño; el trigger de validación exige motivo solo al editar.
      insert into public.trips (person_id, date, direction, origin, destination, status, notes)
      select '44444444-4444-4444-4444-444444444444', d + n, dir, 'Santiago', 'Copiapó', st, nota
      from hoy, (values
        (-30, 'SUBIDA', 'Planificado', 'muy vencido'),
        (-5,  'BAJADA', 'Planificado', 'vencido'),
        (0,   'SUBIDA', 'Solicitado',  'hoy'),
        (10,  'BAJADA', 'Planificado', 'dentro de la ventana'),
        (21,  'SUBIDA', 'Planificado', 'justo en el límite'),
        (22,  'BAJADA', 'Planificado', 'fuera de la ventana'),
        (3,   'SUBIDA', 'Anulado',     'anulado')
      ) v(n, dir, st, nota);
      -- Uno con PNR no se avisa.
      insert into public.trips (person_id, date, direction, origin, destination, status, pnr, notes)
      select '44444444-4444-4444-4444-444444444444', d + 4, 'BAJADA', 'Santiago', 'Copiapó', 'Emitido', 'ABC123', 'con reserva' from hoy;
    `, signal);

    const como = (rol: string, sql: string, correo = "ana@example.test") => `
      set app.current_user_email = '${correo}';
      set role ${rol};
      ${sql}
    `;
    const llamar = async (rol: string) =>
      (await psql(container, como(rol, "select public.purchase_alert_data();"), signal)).trim();
    const falla = async (rol: string) => {
      const resultado = await runCommand(
        "docker",
        ["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
        { input: como(rol, "select public.purchase_alert_data();"), timeoutMs: 30_000, signal },
      );
      assert.notEqual(resultado.status, 0, `${rol} no debía poder ejecutarla`);
      assert.match(resultado.stderr, /permission denied for function/);
    };

    // Solo la llave de servicio. Ni el navegador con sesión, ni sin sesión.
    await falla("authenticated");
    await falla("anon");

    const datos = JSON.parse(await llamar("service_role")) as {
      hoy: string; ventana: number; viajes: { fecha: string; estado: string; persona: string; hora: string | null }[];
    };
    const hoy = (await psql(container, "select (now() at time zone 'America/Santiago')::date;", signal)).trim();
    assert.equal(datos.hoy, hoy, "la fecha de hoy es la de Santiago");
    assert.equal(datos.ventana, 21, "la ventana vigente de la obra");

    // Con la ventana de 21 días: de hace 14 días a hoy + 21, sin anulados ni con PNR.
    const dias = datos.viajes.map((viaje) =>
      Math.round((Date.parse(viaje.fecha + "T12:00:00Z") - Date.parse(hoy + "T12:00:00Z")) / 86_400_000));
    assert.deepEqual(dias, [-5, 0, 10, 21]);
    assert.ok(datos.viajes.every((viaje) => viaje.estado !== "Anulado"));
    assert.equal(datos.viajes[0].persona, "Persona de prueba");
    assert.equal(datos.viajes[0].hora, null, "sin hora solicitada");

    // Cambiar la ventana cambia la consulta.
    await psql(container, `update public.settings set purchase_window_days = 7;`, signal);
    const corta = JSON.parse(await llamar("service_role")) as { ventana: number; viajes: unknown[] };
    assert.equal(corta.ventana, 7);
    assert.equal(corta.viajes.length, 2, "solo el vencido y el de hoy entran con 7 días");
  });
});
