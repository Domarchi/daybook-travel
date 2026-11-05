import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { buildExcelSyncPayload } from "./excel-sync.ts";
import { runWithinDeadline } from "./travel-agent-postgres-runner.ts";
import { createPostgresFixture } from "./postgres-test-fixture.ts";

const ACTOR = "11111111-1111-1111-1111-111111111111";
const LEGACY_PERSON = "33333333-3333-4333-8333-333333333331";
const EDIT_PERSON = "33333333-3333-4333-8333-333333333332";
const LEGACY_TRIP = "22222222-2222-4222-8222-222222222221";
const UNKNOWN_PERSON = "33333333-3333-4333-8333-333333333333";
const UNKNOWN_TRIP = "22222222-2222-4222-8222-222222222222";

function member(sql: string): string {
  return `set role authenticated;
    set app.current_user_id = '${ACTOR}';
    set app.current_user_email = 'workflow@example.test';
    ${sql}`;
}

test("flujos de Personas, planificación y Excel conservan datos en PostgreSQL", { timeout: 90_000 }, async (t) => {
  await runWithinDeadline(75_000, async (signal) => {
    const fixture = await createPostgresFixture(t, signal);
    if (!fixture) return;
    const { sql } = fixture;
    await sql(`
      create extension if not exists pgcrypto;
      create schema auth;
      grant usage on schema auth to authenticated;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('app.current_user_id', true), '')::uuid
      $$;
      create function auth.jwt() returns jsonb language sql stable as $$
        select jsonb_build_object('email', nullif(current_setting('app.current_user_email', true), ''))
      $$;
    `);

    const directory = new URL("../supabase/", import.meta.url);
    const migrations = (await readdir(directory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
    for (const name of migrations.filter((name) => Number(name.split("_")[0]) <= 8)) {
      await sql(await readFile(new URL(name, directory), "utf8"));
    }
    // A real legacy row has no planned_date and its earlier date survives only
    // in history. Create it before the new planning migrations, not by disabling
    // triggers or changing their definition after the migration under test.
    await sql(`
      insert into public.members (email) values ('workflow@example.test');
      insert into public.people (id, name, origin, destination, shift, start_date)
      values
        ('${LEGACY_PERSON}', 'Persona histórica', 'Santiago', 'Copiapó', '4×3', '2026-01-01'),
        ('${EDIT_PERSON}', 'Persona concurrente', 'Santiago', 'Copiapó', 'Sin turno', '2026-01-01');
      insert into public.trips (id, person_id, date, direction, origin, destination, baggage, notes)
      values ('${LEGACY_TRIP}', '${LEGACY_PERSON}', '2026-11-12', 'BAJADA', 'Copiapó', 'Santiago', 'Mochila', 'Original');
      update public.trips set date = '2026-11-13', notes = 'Reprogramación histórica'
      where id = '${LEGACY_TRIP}';
    `);
    for (const name of migrations.filter((name) => Number(name.split("_")[0]) > 8)) {
      await sql(await readFile(new URL(name, directory), "utf8"));
    }
    const generate = (rows: unknown[]) => sql(member(`
      select public.generate_trip_movements($rows$${JSON.stringify(rows)}$rows$::jsonb);
    `));

    await t.test("el legado reprogramado conserva su fila y resuelve la fecha original desde auditoría", async () => {
      const identity = JSON.parse((await sql(member(`
        select to_jsonb(d) from public.trip_planning_dates() d where trip_id = '${LEGACY_TRIP}';
      `))).trim());
      assert.deepEqual(identity, { trip_id: LEGACY_TRIP, planned_date: "2026-11-12" });
      const unchanged = JSON.parse((await sql(`
        select jsonb_build_object('date', date, 'planned_date', planned_date, 'version', version,
          'history', (select count(*) from public.history where record_id = '${LEGACY_TRIP}'))
        from public.trips where id = '${LEGACY_TRIP}';
      `)).trim());
      assert.deepEqual(unchanged, { date: "2026-11-13", planned_date: null, version: 2, history: 2 });
      assert.equal(Number((await generate([
        { person_id: LEGACY_PERSON, date: "2026-11-12", direction: "BAJADA" },
        { person_id: LEGACY_PERSON, date: "2026-11-13", direction: "BAJADA" },
      ])).trim()), 0);
      assert.equal(Number((await sql(`select count(*) from public.trips where person_id = '${LEGACY_PERSON}';`)).trim()), 1);
      assert.equal(Number((await sql(`select count(*) from public.history where record_id = '${LEGACY_TRIP}';`)).trim()), 2);
    });

    await t.test("dos generaciones concurrentes crean una sola identidad y reprogramarla no la recrea", async () => {
      const rows = [{ person_id: LEGACY_PERSON, date: "2026-11-19", direction: "BAJADA" }];
      const counts = await Promise.all([generate(rows), generate(rows)]);
      assert.deepEqual(counts.map((value) => Number(value.trim())).sort(), [0, 1]);
      const created = JSON.parse((await sql(`
        select to_jsonb(t) from public.trips t
        where person_id = '${LEGACY_PERSON}' and planned_date = '2026-11-19';
      `)).trim());
      assert.equal(created.date, "2026-11-19");
      assert.equal(created.origin, "Copiapó");
      assert.equal(created.destination, "Santiago");
      assert.equal(created.baggage, "Por confirmar");
      assert.equal(created.status, "Planificado");
      assert.equal(created.version, 1);
      const audit = JSON.parse((await sql(`
        select jsonb_build_object('count', count(*), 'actor', min(actor::text))
        from public.history where record_id = '${created.id}';
      `)).trim());
      assert.deepEqual(audit, { count: 1, actor: ACTOR });
      await sql(member(`
        update public.trips set date = '2026-11-20', notes = 'Reprogramación posterior',
          status = 'Emitido', pnr = 'TEST01', flight = 'LA 112', amount = 84990
        where id = '${created.id}';
      `));
      assert.equal(Number((await generate(rows)).trim()), 0);
      assert.equal(Number((await generate([{ ...rows[0], date: "2026-11-20" }])).trim()), 0);
      const preserved = JSON.parse((await sql(`
        select jsonb_build_object('date', date, 'planned_date', planned_date, 'version', version,
          'status', status, 'pnr', pnr, 'flight', flight, 'amount', amount,
          'history', (select count(*) from public.history where record_id = '${created.id}'))
        from public.trips where id = '${created.id}';
      `)).trim());
      assert.deepEqual(preserved, { date: "2026-11-20", planned_date: "2026-11-19", version: 2,
        status: "Emitido", pnr: "TEST01", flight: "LA 112", amount: 84990, history: 2 });
    });

    await t.test("una identidad histórica desconocida bloquea todo el lote sin inventar fechas", async () => {
      // This intentionally damaged history exists only inside this disposable
      // fixture; it models an import/restore whose creation evidence is absent.
      await sql(`
        insert into public.people (id, name, origin, destination, shift, start_date)
        values ('${UNKNOWN_PERSON}', 'Historial incompleto', 'Santiago', 'Copiapó', '4×3', '2026-01-01');
        insert into public.trips (id, person_id, date, direction, origin, destination)
        values ('${UNKNOWN_TRIP}', '${UNKNOWN_PERSON}', '2026-11-12', 'BAJADA', 'Copiapó', 'Santiago');
        delete from public.history where record_id = '${UNKNOWN_TRIP}';
      `);
      const identity = (await sql(member(`
        select planned_date is null from public.trip_planning_dates() where trip_id = '${UNKNOWN_TRIP}';
      `))).trim();
      assert.equal(identity, "t");
      const before = Number((await sql("select count(*) from public.trips;")).trim());
      await assert.rejects(generate([
        { person_id: LEGACY_PERSON, date: "2026-11-23", direction: "SUBIDA" },
        { person_id: UNKNOWN_PERSON, date: "2026-11-23", direction: "SUBIDA" },
      ]), /sin fecha original comprobable/);
      assert.equal(Number((await sql("select count(*) from public.trips;")).trim()), before);
    });

    await t.test("la RPC conserva membresía, campos permitidos y vigencia", async () => {
      await assert.rejects(sql(`
        set role authenticated;
        set app.current_user_id = '${ACTOR}';
        set app.current_user_email = 'outsider@example.test';
        select * from public.trip_planning_dates();
      `), /Acceso no autorizado/);
      await assert.rejects(sql(`
        set role authenticated;
        set app.current_user_id = '${ACTOR}';
        set app.current_user_email = 'outsider@example.test';
        select public.generate_trip_movements('[]'::jsonb);
      `), /Acceso no autorizado/);
      await assert.rejects(sql("set role anon; select * from public.trip_planning_dates();"), /permission denied/);
      await assert.rejects(generate([{ person_id: LEGACY_PERSON, date: "2026-11-23", direction: "SUBIDA", pnr: "FORBIDDEN" }]), /solo persona, fecha y sentido/);
      await assert.rejects(generate([{ person_id: LEGACY_PERSON, date: "2025-12-31", direction: "SUBIDA" }]), /dentro de la vigencia/);
      await assert.rejects(generate([{ person_id: EDIT_PERSON, date: "2026-11-23", direction: "SUBIDA" }]), /activas con turno/);
    });

    await t.test("dos ediciones con la misma versión conservan una sola y auditan al actor", async () => {
      const updates = await Promise.all(["Primera edición", "Segunda edición"].map((name) => sql(member(`
        with changed as (
          update public.people set name = '${name}'
          where id = '${EDIT_PERSON}' and version = 1 returning id
        ) select count(*) from changed;
      `))));
      assert.deepEqual(updates.map((result) => Number(result.trim())).sort(), [0, 1]);
      const stored = JSON.parse((await sql(`
        select jsonb_build_object(
          'version', version,
          'edits', (select count(*) from public.history where record_id = '${EDIT_PERSON}' and action = 'UPDATE'),
          'actor', (select actor from public.history where record_id = '${EDIT_PERSON}' and action = 'UPDATE')
        ) from public.people where id = '${EDIT_PERSON}';
      `)).trim());
      assert.deepEqual(stored, { version: 2, edits: 1, actor: ACTOR });
    });

    await t.test("un viaje exportado sin cambios vuelve por la RPC sin escribir ni alterar su identidad", async () => {
      const before = JSON.parse((await sql(`select to_jsonb(t) from public.trips t where id = '${LEGACY_TRIP}';`)).trim());
      const historyBefore = Number((await sql(`select count(*) from public.history where record_id = '${LEGACY_TRIP}';`)).trim());
      const parsed = buildExcelSyncPayload({ peopleRows: [], tripRows: [{
        row_number: 2,
        fccId: before.id,
        personaId: before.person_id,
        fechaPlanificada: before.planned_date ?? "",
        fechaViaje: before.date,
        sentido: before.direction,
        origen: before.origin,
        destino: before.destination,
        horaRequerida: before.requested_time?.slice(0, 5) ?? "",
        equipaje: before.baggage,
        estado: before.status,
        pnr: before.pnr,
        vuelo: before.flight,
        montoClp: before.amount ?? "",
        observaciones: before.notes,
        version: before.version,
        motivoCambio: "",
      }] });
      assert.deepEqual(parsed.errors, []);
      const result = JSON.parse((await sql(member(`
        select public.sync_excel_batch('44444444-4444-4444-4444-444444444441', $payload$${JSON.stringify(parsed.payload)}$payload$::jsonb);
      `))).trim());
      assert.equal(result.applied, true);
      assert.equal(result.trips.unchanged.length, 1);
      assert.deepEqual(result.trips.conflicts, []);
      assert.deepEqual(result.trips.errors, []);
      const after = JSON.parse((await sql(`select to_jsonb(t) from public.trips t where id = '${LEGACY_TRIP}';`)).trim());
      assert.deepEqual(after, before);
      assert.equal(Number((await sql(`select count(*) from public.history where record_id = '${LEGACY_TRIP}';`)).trim()), historyBefore);
    });
  });
});
