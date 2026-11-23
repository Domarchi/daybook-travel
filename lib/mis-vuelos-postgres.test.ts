// La migración 016 (Mis vuelos) contra un PostgreSQL de verdad, con los
// permisos que Supabase pone por omisión a lo nuevo en `public`.
//
// Lo que importa de una regla que vive en SQL: que el trabajador, sin sesión de
// Auth (rol anon), no lee ninguna tabla; que con su token ve sus viajes y no los
// de otro; que no ve el monto ni las notas; que cinco códigos equivocados lo
// bloquean; y que el historial nunca guarda el resumen del código.
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
const migracion = new URL("../supabase/016_mis_vuelos.sql", import.meta.url);

const COORDINADORA = "coordinadora@example.test";
const ID_COORDINADORA = "11111111-1111-1111-1111-111111111111";
const PERSONA_A = "aaaaaaaa-0000-0000-0000-000000000001";
const PERSONA_B = "bbbbbbbb-0000-0000-0000-000000000002";
const PERSONA_C = "cccccccc-0000-0000-0000-000000000003";
// RUT de prueba con dígito verificador válido.
const RUT_A = "11111111-1";
const RUT_B = "22222222-2";

test("016 mis vuelos: cada trabajador ve solo lo suyo, con bloqueo y sin resúmenes en el historial", { timeout: 120_000 }, async (t) => {
  if (!await requireDocker(t)) return;

  const container = `travel-mis-vuelos-${process.pid}-${Date.now()}`;
  t.after(async () => {
    const cleanup = await runCommand("docker", ["rm", "-f", container], { timeoutMs: 30_000 });
    assert.equal(cleanup.status, 0, `rm -f ${container}\n${cleanup.stdout}\n${cleanup.stderr}`);
  });

  await runWithinDeadline(110_000, async (signal) => {
    await docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=postgres", "postgres:16-alpine"], undefined, 30_000, signal);
    await waitForPostgres(container, signal);

    await psql(container, `
      create schema auth;
      create role anon;
      create role authenticated;
      create role service_role;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('app.current_user_id', true), '')::uuid
      $$;
      create function auth.jwt() returns jsonb language sql stable as $$
        select jsonb_build_object('email', nullif(current_setting('app.current_user_email', true), ''))
      $$;
    `, signal);

    for (const archivo of previas.slice(0, 8)) await psql(container, await readFile(archivo, "utf8"), signal);
    await psql(container, `insert into public.members (email) values ('${COORDINADORA}');`, signal);
    await psql(container, await readFile(previas[8], "utf8"), signal);
    // Lo que Supabase concede por omisión a los roles del navegador: uso del
    // esquema y todo sobre lo que se cree en él. La migración tiene que
    // revocarlo ella misma.
    await psql(container, `
      grant usage on schema public to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    `, signal);
    await psql(container, await readFile(migracion, "utf8"), signal);

    // Tres personas: A y B con RUT, C sin RUT. Viajes de A: uno de mañana con
    // reserva, monto y notas; uno anulado; uno de hace 100 días. Uno de B.
    await psql(container, `
      insert into public.people (id, name, origin, destination, shift, start_date, rut, phone, email) values
        ('${PERSONA_A}', 'Trabajador A', 'Santiago', 'Copiapó', 'Sin turno', current_date - 200, '${RUT_A}', '+56911111111', 'a@example.test'),
        ('${PERSONA_B}', 'Trabajador B', 'La Serena', 'Copiapó', 'Sin turno', current_date - 200, '${RUT_B}', null, null),
        ('${PERSONA_C}', 'Trabajador C', 'Santiago', 'Copiapó', 'Sin turno', current_date - 200, null, null, null);
      insert into public.trips (person_id, date, direction, origin, destination, requested_time, status, pnr, flight, amount, notes) values
        ('${PERSONA_A}', (now() at time zone 'America/Santiago')::date + 1, 'SUBIDA', 'Santiago', 'Copiapó', '08:30', 'Emitido', 'ABC123', 'LA 340', 99999, 'nota interna'),
        ('${PERSONA_A}', (now() at time zone 'America/Santiago')::date + 5, 'BAJADA', 'Copiapó', 'Santiago', null, 'Anulado', '', '', null, ''),
        ('${PERSONA_A}', (now() at time zone 'America/Santiago')::date - 100, 'BAJADA', 'Copiapó', 'Santiago', null, 'Planificado', '', '', null, ''),
        ('${PERSONA_A}', (now() at time zone 'America/Santiago')::date + 8, 'BAJADA', 'Copiapó', 'Santiago', null, 'Planificado', '', '', null, ''),
        ('${PERSONA_B}', (now() at time zone 'America/Santiago')::date + 1, 'SUBIDA', 'La Serena', 'Copiapó', null, 'Emitido', 'XYZ789', 'H2 100', 50000, '');
    `, signal);

    const como = (rol: string, sql: string) => `
      set app.current_user_id = '${rol === "authenticated" ? ID_COORDINADORA : ""}';
      set app.current_user_email = '${rol === "authenticated" ? COORDINADORA : ""}';
      set role ${rol};
      ${sql}
    `;
    const consulta = async (rol: string, sql: string) => (await psql(container, como(rol, sql), signal)).trim();
    const json = async (rol: string, sql: string) => JSON.parse(await consulta(rol, sql));
    const falla = async (rol: string, sql: string, patron: RegExp) => {
      const resultado = await runCommand(
        "docker",
        ["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
        { input: como(rol, sql), timeoutMs: 30_000, signal },
      );
      assert.notEqual(resultado.status, 0, `debía fallar: ${sql}`);
      assert.match(resultado.stderr, patron, sql);
    };
    const entrar = (rut: string, pin: string) => json("anon", `select public.worker_sign_in('${rut}', '${pin}');`);
    const viajes = (token: string) => json("anon", `select public.worker_trips('${token}');`);

    // 1. Sin sesión de Auth no se lee ninguna tabla, ni la del acceso.
    for (const tabla of ["people", "trips", "history", "worker_access", "worker_sessions"]) {
      await falla("anon", `select count(*) from public.${tabla};`, /permission denied/);
    }
    // La coordinación tampoco lee el código: solo lo que dice la ficha.
    await falla("authenticated", `select count(*) from public.worker_access;`, /permission denied/);
    await falla("authenticated", `select count(*) from public.worker_sessions;`, /permission denied/);
    // Ni las utilidades internas ni el recordatorio son para el navegador.
    await falla("anon", `select public.worker_trips_of('${PERSONA_A}');`, /permission denied/);
    await falla("anon", `select public.worker_person_of('x');`, /permission denied/);
    await falla("anon", `select public.worker_reminder_data();`, /permission denied/);
    await falla("authenticated", `select public.worker_reminder_data();`, /permission denied/);

    // 2. Solo un miembro entrega códigos, y solo a una ficha activa con RUT.
    await falla("anon", `select public.worker_access_give_code('${PERSONA_A}');`, /permission denied/);
    await falla("authenticated", `select public.worker_access_give_code('${PERSONA_C}');`, /Agrega el RUT/);
    const pinA = await consulta("authenticated", `select public.worker_access_give_code('${PERSONA_A}');`);
    const pinB = await consulta("authenticated", `select public.worker_access_give_code('${PERSONA_B}');`);
    assert.match(pinA, /^\d{4}$/);
    assert.match(pinB, /^\d{4}$/);
    assert.doesNotMatch(pinA, /^(.)\1{3}$/, "no entrega códigos de un solo dígito repetido");
    const equivocado = (pin: string) => String((Number(pin) + 1) % 10000).padStart(4, "0");

    // 3. RUT inexistente y código equivocado responden igual.
    assert.deepEqual(await entrar("12345678-5", pinA), { ok: false, motivo: "incorrecto" });
    assert.deepEqual(await entrar(RUT_A, equivocado(pinA)), { ok: false, motivo: "incorrecto" });

    // 4. Con el código bueno (escrito con puntos y k minúscula da igual) entra.
    const sesionA = await entrar("11.111.111-1", pinA);
    assert.equal(sesionA.ok, true);
    assert.equal(sesionA.nombre, "Trabajador A");
    assert.match(sesionA.token, /^[0-9a-f]{64}$/);
    // Entrar bien reinicia la cuenta de fallos.
    assert.equal(await psql(container, `select failed_attempts from public.worker_access where person_id = '${PERSONA_A}';`, signal).then((s) => s.trim()), "0");

    // 5. Ve sus viajes, solo los suyos, sin anulados, sin los de hace más de
    //    60 días, y sin monto ni notas.
    const deA = await viajes(sesionA.token);
    assert.equal(deA.ok, true);
    assert.equal(deA.persona.nombre, "Trabajador A");
    assert.equal(deA.viajes.length, 2);
    assert.deepEqual(deA.viajes.map((v: { reserva: string }) => v.reserva), ["ABC123", ""]);
    assert.equal(deA.viajes[0].hora, "08:30");
    assert.equal(deA.viajes[0].vuelo, "LA 340");
    const texto = JSON.stringify(deA);
    for (const ajeno of ["XYZ789", "Trabajador B", "99999", "nota interna", "Anulado", RUT_A, "+5691", "a@example.test"]) {
      assert.ok(!texto.includes(ajeno), `no debía aparecer ${ajeno}`);
    }
    assert.match(deA.calendario, /^[0-9a-f]{64}$/);

    // 6. El token de B no ve lo de A, y uno inventado no ve nada.
    const sesionB = await entrar(RUT_B, pinB);
    const deB = await viajes(sesionB.token);
    assert.deepEqual(deB.viajes.map((v: { reserva: string }) => v.reserva), ["XYZ789"]);
    assert.ok(!JSON.stringify(deB).includes("ABC123"));
    assert.deepEqual(await viajes("0".repeat(64)), { ok: false, motivo: "sesion" });
    assert.deepEqual(await viajes(""), { ok: false, motivo: "sesion" });
    // La sesión no sirve de calendario ni al revés.
    assert.deepEqual(await json("anon", `select public.worker_calendar('${sesionA.token}');`), { ok: false, motivo: "sesion" });
    const calendarioA = await json("anon", `select public.worker_calendar('${deA.calendario}');`);
    assert.equal(calendarioA.ok, true);
    assert.equal(calendarioA.viajes.length, 2);
    assert.equal(calendarioA.calendario, undefined, "el calendario no repite su propia llave");

    // 7. Cinco códigos equivocados seguidos bloquean, y el bueno ya no entra.
    for (let intento = 1; intento <= 4; intento += 1) {
      assert.deepEqual(await entrar(RUT_A, equivocado(pinA)), { ok: false, motivo: "incorrecto" });
    }
    assert.deepEqual(await entrar(RUT_A, equivocado(pinA)), { ok: false, motivo: "bloqueado" });
    assert.deepEqual(await entrar(RUT_A, pinA), { ok: false, motivo: "bloqueado" });
    // Bloqueado, su sesión abierta y su calendario también se cortan.
    assert.deepEqual(await viajes(sesionA.token), { ok: false, motivo: "sesion" });
    assert.equal((await json("anon", `select public.worker_calendar('${deA.calendario}');`)).ok, false);
    // A B no le pasa nada.
    assert.equal((await viajes(sesionB.token)).ok, true);

    // 8. Un código nuevo desbloquea, corta las sesiones viejas y cambia el
    //    enlace del calendario.
    const pinA2 = await consulta("authenticated", `select public.worker_access_give_code('${PERSONA_A}');`);
    assert.equal((await viajes(sesionA.token)).ok, false, "la sesión vieja sigue cortada");
    const sesionA2 = await entrar(RUT_A, pinA2);
    assert.equal(sesionA2.ok, true);
    const deA2 = await viajes(sesionA2.token);
    assert.notEqual(deA2.calendario, deA.calendario);

    // 9. Salir corta esa sesión.
    await consulta("anon", `select public.worker_sign_out('${sesionA2.token}');`);
    assert.equal((await viajes(sesionA2.token)).ok, false);

    // 10. Quitar el acceso bloquea y corta; desactivar la ficha también.
    const sesionA3 = await entrar(RUT_A, pinA2);
    await consulta("authenticated", `select public.worker_access_revoke('${PERSONA_A}');`);
    assert.equal((await viajes(sesionA3.token)).ok, false);
    assert.deepEqual(await entrar(RUT_A, pinA2), { ok: false, motivo: "bloqueado" });
    await consulta("authenticated", `update public.people set active = false where id = '${PERSONA_B}';`);
    assert.equal((await viajes(sesionB.token)).ok, false);
    assert.deepEqual(await entrar(RUT_B, pinB), { ok: false, motivo: "incorrecto" });

    // 11. La ficha dice si tiene código y si está bloqueado, nada más.
    const lista = await consulta("authenticated", `select person_id || ':' || locked from public.worker_access_list() order by person_id;`);
    assert.deepEqual(lista.split("\n"), [`${PERSONA_A}:true`, `${PERSONA_B}:false`]);
    await falla("anon", `select * from public.worker_access_list();`, /permission denied/);

    // 12. El historial guarda códigos entregados y bloqueos, nunca el resumen.
    const historial = await psql(container, `
      select string_agg(action || ' ' || coalesce(before_data::text, '-') || ' ' || after_data::text, E'\\n' order by id)
      from public.history where entity = 'worker_access';
    `, signal);
    assert.ok(historial.includes('"locked": true'), "el bloqueo queda en el historial");
    for (const secreto of ["pin_hash", "pin_salt", "calendar_token", "failed_attempts"]) {
      assert.ok(!historial.includes(secreto), `no debía aparecer ${secreto}`);
    }
    const resumenes = await psql(container, `select string_agg(pin_hash || ' ' || calendar_token, ' ') from public.worker_access;`, signal);
    for (const resumen of resumenes.trim().split(" ")) assert.ok(!historial.includes(resumen));
    const actores = await psql(container, `select count(*) from public.history where entity = 'worker_access' and actor = '${ID_COORDINADORA}';`, signal);
    assert.ok(Number(actores) >= 3, "cada código entregado lleva a quien lo entregó");
    // Los datos de contacto de la ficha pasan por el historial de siempre.
    assert.equal((await psql(container, `select count(*) from public.history where entity = 'people' and after_data ->> 'rut' = '${RUT_A}';`, signal)).trim(), "1");

    // 13. El recordatorio: solo la llave de servicio, solo mañana con reserva y
    //     con correo o teléfono, y de personas activas (B quedó inactiva).
    await consulta("authenticated", `update public.people set active = true where id = '${PERSONA_B}';`);
    const recordatorio = await json("service_role", `select public.worker_reminder_data();`);
    assert.deepEqual(recordatorio.viajes.map((v: { reserva: string }) => v.reserva), ["ABC123"], "B no tiene ni correo ni teléfono");
    assert.equal(recordatorio.viajes[0].telefono, "+56911111111");
    assert.equal(recordatorio.viajes[0].correo, "a@example.test");
    assert.ok(!JSON.stringify(recordatorio).includes("99999"), "el recordatorio no lleva el monto");

    // 14. La ficha valida lo que guarda: RUT con dígito verificador, teléfono
    //     internacional, correo en minúscula; y un RUT en una sola ficha activa.
    await falla("authenticated", `update public.people set rut = '11111111-2' where id = '${PERSONA_C}';`, /people_rut_check/);
    await falla("authenticated", `update public.people set phone = '912345678' where id = '${PERSONA_C}';`, /people_phone_check/);
    await falla("authenticated", `update public.people set email = 'Mayus@example.test' where id = '${PERSONA_C}';`, /people_email_check/);
    await falla("authenticated", `update public.people set rut = '${RUT_A}' where id = '${PERSONA_C}';`, /people_rut_activo_unique/);
    await consulta("authenticated", `update public.people set rut = '10000013-K' where id = '${PERSONA_C}';`);
  });
});
