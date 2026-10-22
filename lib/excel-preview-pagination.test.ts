import assert from "node:assert/strict";
import test from "node:test";
import { elementText, panelDriver, workbook } from "./excel-panel-test-driver.ts";
import type { PanelRpcClient } from "./excel-panel-test-driver.ts";
import type { ExcelSyncPayload, ExcelSyncResult } from "./excel-sync.ts";

type Driver = Awaited<ReturnType<typeof panelDriver>>;
function matrix(count: number, invalid = false, prefix = "SYN-PAGE") {
  return [
    ["codigoPersona", "nombreCompleto", "origen", "destino", "turno", "fechaInicio", "equipaje"],
    ...Array.from({ length: count }, (_, index) => [
      `${prefix}-${String(index + 1).padStart(3, "0")}`,
      invalid ? "" : `Persona sintética ${prefix}-${String(index + 1).padStart(3, "0")}`,
      "Santiago", "Copiapó", "4×3", "2026-09-07", "Mochila",
    ]),
  ];
}

function createFake(serverIssues = 0) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client: PanelRpcClient = { async rpc(name, args) {
    assert.equal(name, "sync_excel_batch", "Solo se admite la RPC sintética de aplicación");
    calls.push(structuredClone({ name, args }));
    const payload = args.p_payload as ExcelSyncPayload;
    const entity = (rows: { row_number: number }[]) => ({
      inserted: serverIssues ? [] : rows.map(row => ({ row_number: row.row_number })),
      updated: [], unchanged: [], conflicts: [], errors: [],
    });
    const data: ExcelSyncResult = {
      sync_id: String(args.p_sync_id), idempotent: false, applied: !serverIssues,
      people: entity(payload.people), trips: entity(payload.trips),
    };
    data.people.errors = Array.from({ length: serverIssues }, (_, index) => ({
      entity: "people", row_number: index + 2, field: "nombreCompleto", message: `Error sintético ${index + 1}`,
    }));
    return { data, error: null };
  } };
  return { client, calls };
}

function byId(driver: Driver, id: string) {
  const element = driver.all().find(element => element.props.id === id);
  assert.ok(element, `Región ausente: ${id}`);
  return element;
}
function regionText(driver: Driver, id: string) { return elementText(byId(driver, id)); }
function count(driver: Driver, label: string) {
  const card = driver.all().find(element => elementText(element.props.children) === label && "numero" in element.props);
  assert.ok(card, `Conteo ausente: ${label}`);
  return card.props.numero;
}
async function review(driver: Driver, rows: string[][], trips?: string[][]) {
  await driver.upload(await workbook(trips ? [rows, trips] : [rows], trips ? ["Personas", "Viajes"] : ["Personas"]));
}
function assertAccessiblePager(driver: Driver, kind: "Filas" | "Observaciones", target: string, statusId: string) {
  assert.equal(byId(driver, target).props.tabIndex, -1);
  for (const direction of ["anteriores", "siguientes"]) {
    const pager = driver.find(`${kind} ${direction}`);
    assert.equal(pager.props.type, "button");
    assert.equal(pager.props["aria-controls"], target);
  }
  assert.equal(byId(driver, statusId).props.role, "status");
  assert.equal(byId(driver, statusId).props["aria-live"], "polite");
  assert.equal(byId(driver, statusId).props["aria-atomic"], true);
}

test("todas las 101 filas son accesibles y paginar conserva el payload completo sin aplicar", async () => {
  const fake = createFake();
  const driver = await panelDriver(fake.client);
  await review(driver, matrix(101));
  assertAccessiblePager(driver, "Filas", "excel-preview-rows", "excel-preview-page-status");
  assert.equal(count(driver, "Nuevos"), 101);
  assert.equal(driver.find("Filas anteriores").props.disabled, true);
  assert.match(regionText(driver, "excel-preview-rows"), /SYN-PAGE-001/);
  assert.doesNotMatch(regionText(driver, "excel-preview-rows"), /SYN-PAGE-051/);
  await driver.invoke("Filas anteriores");
  assert.match(regionText(driver, "excel-preview-page-status"), /Filas 1–50 de 101/);
  await driver.click("Filas siguientes");
  assert.match(regionText(driver, "excel-preview-rows"), /SYN-PAGE-051/);
  assert.match(regionText(driver, "excel-preview-page-status"), /Filas 51–100 de 101/);
  await driver.click("Filas siguientes");
  assert.match(regionText(driver, "excel-preview-rows"), /SYN-PAGE-101/);
  assert.equal(driver.find("Filas siguientes").props.disabled, true);
  await driver.invoke("Filas siguientes");
  assert.match(regionText(driver, "excel-preview-page-status"), /Filas 101–101 de 101/);
  await driver.click("Filas anteriores");
  assert.equal(count(driver, "Nuevos"), 101);
  assert.deepEqual(fake.calls, []);
  await driver.click("Aplicar 101 cambios");
  assert.equal(fake.calls.length, 1);
  const payload = fake.calls[0].args.p_payload as ExcelSyncPayload;
  assert.deepEqual(payload.people.map(row => row.employee_code), matrix(101).slice(1).map(row => row[0]));
  assert.deepEqual(payload.people.map(row => row.row_number), Array.from({ length: 101 }, (_, index) => index + 2));
  assert.deepEqual(payload.trips, []);
});

test("las 25 observaciones son accesibles y el handler bloquea aplicar desde cualquier página", async () => {
  const fake = createFake();
  const driver = await panelDriver(fake.client);
  await review(driver, [...matrix(1), ...matrix(25, true, "SYN-ERROR").slice(1)]);
  assertAccessiblePager(driver, "Observaciones", "excel-issues-list", "excel-issues-page-status");
  assert.equal(count(driver, "Errores"), 25);
  assert.equal(count(driver, "Nuevos"), 1);
  await driver.invoke("Observaciones anteriores");
  for (const [page, row] of [[1, 3], [2, 15], [3, 27]]) {
    assert.match(regionText(driver, "excel-issues-list"), new RegExp(`fila ${row}`));
    assert.match(regionText(driver, "excel-issues-page-status"), new RegExp(`Página ${page} de 3`));
    assert.equal(driver.find("Corrige el archivo para continuar").props.disabled, true);
    await driver.invoke("Corrige el archivo para continuar");
    await driver.click("Observaciones siguientes");
  }
  assert.equal(driver.find("Observaciones siguientes").props.disabled, true);
  await driver.invoke("Observaciones siguientes");
  await driver.click("Observaciones anteriores");
  assert.match(regionText(driver, "excel-issues-page-status"), /Página 2 de 3/);
  assert.deepEqual(fake.calls, []);
});

test("un error fuera de la página de filas bloquea todo el lote al navegar", async () => {
  const fake = createFake();
  const driver = await panelDriver(fake.client);
  await review(driver, [...matrix(51), ...matrix(1, true, "SYN-ERROR").slice(1)]);
  assert.equal(count(driver, "Nuevos"), 51);
  assert.equal(count(driver, "Errores"), 1);
  for (const direction of ["Filas siguientes", "Filas anteriores"]) {
    await driver.click(direction);
    await driver.invoke("Corrige el archivo para continuar");
  }
  assert.deepEqual(fake.calls, []);
});

test("un duplicado en la segunda página bloquea todo el lote, también desde la primera", async () => {
  const fake = createFake();
  const driver = await panelDriver(fake.client);
  const rows = matrix(51);
  rows[51][0] = rows[1][0];
  await review(driver, rows);
  assert.equal(count(driver, "Conflictos"), 1);
  assert.equal(count(driver, "Nuevos"), 50);
  await driver.invoke("Corrige el archivo para continuar");
  await driver.click("Filas siguientes");
  assert.match(regionText(driver, "excel-preview-rows"), /Código trabajador ya está en uso/);
  await driver.invoke("Corrige el archivo para continuar");
  await driver.click("Filas anteriores");
  assert.equal(count(driver, "Conflictos"), 1);
  assert.deepEqual(fake.calls, []);
});

test("las páginas son independientes y cambiar el archivo reinicia ambas y sus conteos", async () => {
  const fake = createFake();
  const driver = await panelDriver(fake.client);
  await review(driver, [...matrix(51), ...matrix(13, true, "SYN-ERROR").slice(1)]);
  await driver.click("Filas siguientes");
  assert.equal(driver.find("Observaciones anteriores").props.disabled, true);
  await driver.click("Observaciones siguientes");
  assert.match(regionText(driver, "excel-preview-rows"), /SYN-PAGE-051/);
  assert.match(regionText(driver, "excel-issues-list"), /fila 65/);
  await driver.click("Cambiar archivo");
  await review(driver, [...matrix(51, false, "SYN-NEW"), ...matrix(13, true, "SYN-NEW-ERROR").slice(1)]);
  assert.equal(driver.find("Filas anteriores").props.disabled, true);
  assert.equal(driver.find("Observaciones anteriores").props.disabled, true);
  assert.match(regionText(driver, "excel-preview-rows"), /SYN-NEW-001/);
  assert.doesNotMatch(regionText(driver, "excel-preview-rows"), /SYN-NEW-051/);
  assert.match(regionText(driver, "excel-issues-list"), /fila 53/);
  await driver.click("Cambiar archivo");
  await review(driver, matrix(1, false, "SYN-SMALL"));
  assert.equal(count(driver, "Nuevos"), 1);
  assert.equal(count(driver, "Errores"), 0);
  assert.ok(!driver.all().some(element => element.props["aria-label"] === "Filas siguientes"));
  assert.equal(driver.find("Aplicar 1 cambio").props.disabled, false);
  assert.deepEqual(fake.calls, []);
});

test("las observaciones del servidor se reinician y pueden revisarse sin reintentar la aplicación", async () => {
  const fake = createFake(13);
  const driver = await panelDriver(fake.client);
  await review(driver, matrix(51));
  await driver.click("Filas siguientes");
  await driver.click("Aplicar 51 cambios");
  assert.equal(count(driver, "Errores"), 13);
  assert.equal(driver.find("Observaciones anteriores").props.disabled, true);
  await driver.click("Observaciones siguientes");
  assert.match(regionText(driver, "excel-issues-list"), /Error sintético 13/);
  await driver.invoke("Corrige el archivo para continuar");
  await driver.click("Filas anteriores");
  assert.equal(fake.calls.length, 1);
  assert.equal((fake.calls[0].args.p_payload as ExcelSyncPayload).people.length, 51);
});

test("la paginación reúne Personas y Viajes sin recortar ni transformar sus filas", async () => {
  const fake = createFake();
  const driver = await panelDriver(fake.client);
  const trips = [
    ["codigoPersona", "fechaViaje", "sentido", "origen", "destino", "equipaje"],
    ["SYN-PAGE-001", "2026-09-08", "Subida", "Santiago", "Copiapó", "Mochila"],
  ];
  await review(driver, matrix(50), trips);
  assert.equal(count(driver, "Nuevos"), 51);
  await driver.click("Filas siguientes");
  assert.match(regionText(driver, "excel-preview-rows"), /Viaje/);
  assert.match(regionText(driver, "excel-preview-rows"), /2026-09-08/);
  assert.deepEqual(fake.calls, []);
  await driver.click("Aplicar 51 cambios");
  const payload = fake.calls[0].args.p_payload as ExcelSyncPayload;
  assert.equal(payload.people.length, 50);
  assert.equal(payload.trips.length, 1);
  assert.equal(payload.trips[0].person_employee_code, payload.people[0].employee_code);
  assert.equal(payload.trips[0].date, "2026-09-08");
});
