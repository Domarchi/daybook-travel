import assert from "node:assert/strict";
import test from "node:test";
import { panelDriver, workbook } from "./excel-panel-test-driver.ts";
import { PREAMBLE_MATRIX, TRIP_MATRIX, createImportFake } from "../scripts/fixtures/travel-import-fake.ts";

function gate() {
  let release = () => {};
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

async function pendingMapping(options: { failure?: "enqueue" | "response"; mixed?: boolean } = {}) {
  const fake = createImportFake();
  const enqueued = gate();
  const queue = gate();
  const reading = gate();
  const response = gate();
  const client = { async rpc(name: string, args: Record<string, unknown>) {
    const value = await fake.client.rpc(name, args);
    if (name === "request_trip_import_mapping") {
      enqueued.release();
      await queue.promise;
      if (options.failure === "enqueue") return { data: null, error: { message: "synthetic enqueue failure" } };
    }
    if (name === "get_trip_ai_request") {
      reading.release();
      await response.promise;
      if (options.failure === "response") return { data: null, error: { message: "synthetic response failure" } };
    }
    return value;
  } };
  const driver = await panelDriver(client);
  await driver.upload(await workbook(
    options.mixed ? [PREAMBLE_MATRIX, TRIP_MATRIX] : [PREAMBLE_MATRIX],
    options.mixed ? ["Personas", "Viajes"] : ["Personas"],
  ));
  driver.change("Fila de encabezados", "2");
  driver.change("Confirmar encabezados", true);
  driver.change("Mapeo Código", "version");
  driver.invoke("Interpretar columnas con IA");
  await enqueued.promise;
  return { driver, fake, queue, reading, response };
}

type Driver = Awaited<ReturnType<typeof panelDriver>>;
const mappings = (driver: Driver) => driver.all().filter(element =>
  element.type === "select" && String(element.props["aria-label"]).startsWith("Mapeo "));
const selection = (driver: Driver) => mappings(driver).map(element => [element.props["aria-label"], element.props.value]);
function assertMappingDisabled(driver: Driver, disabled: boolean) {
  assert.ok(mappings(driver).length > 0);
  for (const element of mappings(driver)) assert.equal(element.props.disabled, disabled, String(element.props["aria-label"]));
}

test("pending AI cannot accept a manual mapping that its response would overwrite", async () => {
  const { driver, fake, queue, reading, response } = await pendingMapping();
  const before = driver.find("Mapeo Código").props.value;
  driver.change("Mapeo Código", "daybookId");
  const during = driver.find("Mapeo Código").props.value;
  queue.release();
  await reading.promise;
  response.release();
  await driver.settle();
  const after = driver.find("Mapeo Código").props.value;
  assert.deepEqual({ before, during, after }, { before: "version", during: "version", after: "codigoPersona" },
    "a user edit must be blocked while pending, rather than accepted and silently overwritten by AI");
  assert.equal(fake.calls.some(call => call.name === "sync_excel_batch"), false);
});

test("mapping controls lock through enqueue and response, unlock on success, and still require preview/apply", async () => {
  const { driver, fake, queue, reading, response } = await pendingMapping();
  assertMappingDisabled(driver, true);
  assert.ok(driver.text().includes("Interpretando…"));
  queue.release();
  await reading.promise;
  assertMappingDisabled(driver, true);
  const before = selection(driver);
  driver.change("Mapeo Trabajador", "daybookId");
  assert.deepEqual(selection(driver), before, "blocked edits must preserve every current selection");
  response.release();
  await driver.settle();
  assertMappingDisabled(driver, false);
  driver.change("Mapeo Código", "version");
  assert.equal(driver.find("Mapeo Código").props.value, "version");
  assert.equal(driver.find("Mapeo Trabajador").props.value, "nombreCompleto");
  driver.change("Mapeo Código", "codigoPersona");
  assert.equal(fake.calls.some(call => call.name === "sync_excel_batch"), false);
  await driver.click("Revisar con este mapeo");
  assert.ok(driver.text().includes("Revisión local completada"));
  assert.equal(fake.calls.some(call => call.name === "sync_excel_batch"), false);
  await driver.click("Aplicar 1 cambio");
  assert.equal(fake.calls.filter(call => call.name === "sync_excel_batch").length, 1);
});

for (const failure of ["enqueue", "response"] as const) {
  test(`mapping controls unlock after ${failure} error and preserve the manual selection`, async () => {
    const { driver, fake, queue, reading, response } = await pendingMapping({ failure });
    assertMappingDisabled(driver, true);
    queue.release();
    if (failure === "response") {
      await reading.promise;
      assertMappingDisabled(driver, true);
      response.release();
    }
    await driver.settle();
    assertMappingDisabled(driver, false);
    assert.equal(driver.find("Mapeo Código").props.value, "version");
    assert.ok(driver.text().includes("La IA no está disponible"));
    driver.change("Mapeo Código", "codigoPersona");
    assert.equal(driver.find("Mapeo Código").props.value, "codigoPersona");
    assert.equal(fake.calls.some(call => call.name === "sync_excel_batch"), false);
  });
}

for (const cancellation of ["confirmation", "row", "sheet", "entity"] as const) {
  test(`${cancellation} cancellation unlocks mapping and the late AI response cannot overwrite a new edit`, async () => {
    const { driver, fake, queue, reading, response } = await pendingMapping({ mixed: true });
    queue.release();
    await reading.promise;
    assertMappingDisabled(driver, true);
    if (cancellation === "confirmation") driver.change("Confirmar encabezados", false);
    if (cancellation === "row") driver.change("Fila de encabezados", "1");
    if (cancellation === "sheet") driver.change("Hoja", "1");
    if (cancellation === "entity") driver.change("Tipo de información", "trips");
    assertMappingDisabled(driver, false);
    assert.equal(driver.find("Confirmar encabezados").props.checked, false);
    const label = String(mappings(driver)[0].props["aria-label"]);
    driver.change(label, "version");
    const edited = selection(driver);
    response.release();
    await driver.settle();
    assertMappingDisabled(driver, false);
    assert.deepEqual(selection(driver), edited);
    assert.equal(driver.find(label).props.value, "version");
    assert.equal(driver.find("Interpretar columnas con IA").props.disabled, true);
    assert.equal(fake.calls.some(call => call.name === "sync_excel_batch"), false);
  });
}
