import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { PersonEditConflict, updatePersonWithVersion, type PersonChanges } from "./people-write.ts";

const changes: PersonChanges = {
  name: "Persona de prueba", origin: "Santiago", destination: "Copiapó",
  shift: "4×3", start_date: "2026-11-02", end_date: null,
  up_weekday: 1, down_weekday: 4, baggage: "Mochila", active: true,
};

function clientWithFetch(fetcher: typeof fetch) {
  return createClient("https://database.example.test", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetcher },
  });
}

test("dos fichas abiertas con la misma versión no pueden sobrescribirse", async () => {
  let stored = { ...changes, id: "persona-1", version: 7 };
  const requests: URL[] = [];
  const client = clientWithFetch(async (input, init) => {
    const url = new URL(String(input));
    requests.push(url);
    assert.equal(init?.method, "PATCH");
    assert.equal(url.pathname, "/rest/v1/people");
    assert.equal(url.searchParams.get("select"), "id");
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.version, undefined, "la versión la incrementa la base");
    const matches = url.searchParams.get("id") === `eq.${stored.id}`
      && url.searchParams.get("version") === `eq.${stored.version}`;
    if (matches) stored = { ...stored, ...payload, version: stored.version + 1 };
    return Response.json(matches ? [{ id: stored.id }] : []);
  });

  const snapshot = { id: stored.id, version: stored.version };
  await updatePersonWithVersion(client, snapshot, { ...changes, origin: "Concepción" });
  await assert.rejects(
    updatePersonWithVersion(client, snapshot, { ...changes, baggage: "Maleta en bodega" }),
    PersonEditConflict,
  );
  assert.equal(stored.origin, "Concepción");
  assert.equal(stored.baggage, "Mochila");
  assert.equal(stored.version, 8);
  assert.equal(requests.length, 2);

  await updatePersonWithVersion(client, { id: stored.id, version: stored.version }, {
    ...changes, origin: stored.origin, baggage: "Maleta en bodega",
  });
  assert.equal(stored.origin, "Concepción");
  assert.equal(stored.baggage, "Maleta en bodega");
});

test("una ficha sin versión comprobable no intenta una escritura sin protección", async () => {
  let calls = 0;
  const client = clientWithFetch(async () => { calls++; return Response.json([]); });
  for (const version of [undefined, null, 0, -1, NaN]) {
    await assert.rejects(updatePersonWithVersion(client, { id: "persona-1", version }, changes), PersonEditConflict);
  }
  assert.equal(calls, 0);
});

test("un error de red o permisos no se informa como guardado ni conflicto de versión", async () => {
  const client = clientWithFetch(async () => Response.json({
    message: "permission denied", code: "42501", details: null, hint: null,
  }, { status: 403 }));
  await assert.rejects(updatePersonWithVersion(client, { id: "persona-1", version: 1 }, changes),
    (error: { code?: string }) => error.code === "42501");
});
