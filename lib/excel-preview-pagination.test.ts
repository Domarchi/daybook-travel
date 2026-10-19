import assert from "node:assert/strict";
import test from "node:test";
import { panelDriver, workbook } from "./excel-panel-test-driver.ts";
import { PERSON_MATRIX, createImportFake } from "../scripts/fixtures/travel-import-fake.ts";

type Driver = Awaited<ReturnType<typeof panelDriver>>;
function matrix(count: number, invalid = false, prefix = "SYN-PAGE") {
  return [[...PERSON_MATRIX[0]], ...Array.from({ length: count }, (_, index) => {
    const row = [...PERSON_MATRIX[1]];
    row[0] = `${prefix}-${String(index + 1).padStart(3, "0")}`;
    row[1] = invalid ? "" : `Persona sintética ${row[0]}`;
    return row;
  })];
}
function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (node && typeof node === "object" && "props" in node) return text((node as { props: { children?: unknown } }).props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function byId(driver: Driver, id: string) {
  const element = driver.all().find(element => element.props.id === id);
  assert.ok(element, `Missing region: ${id}`);
  return element;
}
async function review(driver: Driver, data: string[][]) {
  await driver.upload(await workbook([data], ["Personas"]));
  await driver.click("Revisar con este mapeo");
}
function assertAccessiblePager(driver: Driver, kind: "Filas" | "Observaciones", target: string, statusId: string) {
  assert.equal(byId(driver, target).props.tabIndex, -1, "the page result must accept programmatic focus");
  for (const direction of ["anteriores", "siguientes"]) {
    assert.equal(driver.find(`${kind} ${direction}`).props.type, "button");
    assert.equal(driver.find(`${kind} ${direction}`).props["aria-controls"], target);
  }
  assert.equal(byId(driver, statusId).props.role, "status");
  assert.equal(byId(driver, statusId).props["aria-live"], "polite");
  assert.equal(byId(driver, statusId).props["aria-atomic"], true);
}

test("all 51 rows are reachable and navigating preserves the complete payload until explicit apply", async () => {
  const fake = createImportFake();
  const driver = await panelDriver(fake.client);
  await review(driver, matrix(51));
  assertAccessiblePager(driver, "Filas", "excel-preview-rows", "excel-preview-page-status");
  assert.equal(driver.find("Filas anteriores").props.disabled, true);
  assert.equal(driver.find("Filas siguientes").props.disabled, false);
  assert.ok(text(byId(driver, "excel-preview-rows")).includes("SYN-PAGE-001"));
  assert.ok(!text(byId(driver, "excel-preview-rows")).includes("SYN-PAGE-051"));
  await driver.click("Filas anteriores");
  await driver.click("Filas siguientes");
  assert.ok(text(byId(driver, "excel-preview-rows")).includes("SYN-PAGE-051"));
  assert.ok(!text(byId(driver, "excel-preview-rows")).includes("SYN-PAGE-001"));
  assert.equal(driver.find("Filas siguientes").props.disabled, true);
  await driver.click("Filas siguientes");
  assert.deepEqual(fake.calls, [], "paging must not enqueue AI or apply any rows");
  assert.equal(driver.find("Aplicar 51 cambios").props.disabled, false);
  await driver.click("Aplicar 51 cambios");
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].name, "sync_excel_batch");
  const payload = fake.calls[0].args.p_payload as { people: { employee_code: string; row_number: number }[]; trips: unknown[] };
  assert.equal(payload.people.length, 51);
  assert.deepEqual(payload.people.map(row => row.employee_code), matrix(51).slice(1).map(row => row[0]));
  assert.deepEqual(payload.people.map(row => row.row_number), Array.from({ length: 51 }, (_, index) => index + 2));
  assert.deepEqual(payload.trips, []);
});

test("all 13 local observations are reachable and errors still block apply", async () => {
  const fake = createImportFake();
  const driver = await panelDriver(fake.client);
  await review(driver, matrix(13, true));
  assertAccessiblePager(driver, "Observaciones", "excel-issues-list", "excel-issues-page-status");
  assert.ok(text(byId(driver, "excel-issues-list")).includes("fila 2"));
  assert.ok(!text(byId(driver, "excel-issues-list")).includes("fila 14"));
  assert.equal(driver.find("Observaciones anteriores").props.disabled, true);
  await driver.click("Observaciones siguientes");
  assert.ok(text(byId(driver, "excel-issues-list")).includes("fila 14"));
  assert.ok(!text(byId(driver, "excel-issues-list")).includes("fila 2"));
  assert.equal(driver.find("Observaciones siguientes").props.disabled, true);
  assert.equal(driver.find("Corrige el archivo para continuar").props.disabled, true);
  await driver.click("Corrige el archivo para continuar");
  await driver.click("Observaciones anteriores");
  assert.ok(text(byId(driver, "excel-issues-list")).includes("fila 2"));
  assert.deepEqual(fake.calls, []);
});

test("row and observation pages are independent and changing the batch resets both", async () => {
  const fake = createImportFake();
  const driver = await panelDriver(fake.client);
  const mixed = [...matrix(51), ...matrix(13, true, "SYN-ISSUE").slice(1)];
  await review(driver, mixed);
  await driver.click("Filas siguientes");
  assert.ok(text(byId(driver, "excel-preview-rows")).includes("SYN-PAGE-051"));
  assert.equal(driver.find("Observaciones anteriores").props.disabled, true);
  await driver.click("Observaciones siguientes");
  assert.ok(text(byId(driver, "excel-issues-list")).includes("fila 65"));
  assert.ok(text(byId(driver, "excel-preview-rows")).includes("SYN-PAGE-051"));
  await driver.click("Cambiar archivo");
  const replacement = [...matrix(51, false, "SYN-NEW"), ...matrix(13, true, "SYN-NEW-ISSUE").slice(1)];
  await review(driver, replacement);
  assert.equal(driver.find("Filas anteriores").props.disabled, true);
  assert.equal(driver.find("Observaciones anteriores").props.disabled, true);
  assert.ok(text(byId(driver, "excel-preview-rows")).includes("SYN-NEW-001"));
  assert.ok(!text(byId(driver, "excel-preview-rows")).includes("SYN-NEW-051"));
  assert.ok(text(byId(driver, "excel-issues-list")).includes("fila 53"));
  assert.ok(!text(byId(driver, "excel-issues-list")).includes("fila 65"));
  assert.deepEqual(fake.calls, []);
});

test("all 13 server observations remain reachable without automatically retrying apply", async () => {
  const fake = createImportFake();
  const client = { async rpc(name: string, args: Record<string, unknown>) {
    const result = await fake.client.rpc(name, args);
    if (name !== "sync_excel_batch") return result;
    return { data: { applied: false, people: { errors: Array.from({ length: 13 }, (_, index) => ({
      entity: "people", row_number: index + 2, field: "nombreCompleto", message: "Escribe un nombre de 2 a 180 caracteres.",
    })) } }, error: null };
  } };
  const driver = await panelDriver(client);
  await review(driver, matrix(51));
  await driver.click("Filas siguientes");
  await driver.click("Aplicar 51 cambios");
  assert.equal(driver.find("Observaciones anteriores").props.disabled, true);
  await driver.click("Observaciones siguientes");
  assert.ok(text(byId(driver, "excel-issues-list")).includes("fila 14"));
  assert.equal(driver.find("Corrige el archivo para continuar").props.disabled, true);
  assert.equal(fake.calls.filter(call => call.name === "sync_excel_batch").length, 1);
  assert.equal((fake.calls[0].args.p_payload as { people: unknown[] }).people.length, 51);
});
