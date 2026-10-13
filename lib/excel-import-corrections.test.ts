import assert from "node:assert/strict";
import test from "node:test";
import { panelDriver, workbook } from "./excel-panel-test-driver.ts";
import { construirSolicitudMapeo, enmascararMuestra, solicitarMapeoImportacion } from "./travel-ai-queue.ts";
const id = "11111111-1111-4111-8111-111111111111";
const person = [["codigoPersona", "nombreCompleto", "origen", "destino", "fechaInicio"], ["SYN-1", "Persona Sintética", "Santiago", "Calama", "2026-11-12"]];
const trip = [["Código", "Fecha", "Dirección", "Desde", "Hasta"], ["SYN-1", "2026-11-12", "Subida", "Santiago", "Calama"]];

test("UTF8 header bytes reject 41 emojis and accept 20, never truncate", () => {
  assert.equal(construirSolicitudMapeo({entity:"people", headers:["😀".repeat(41)], rows:[]}), null);
  assert.ok(construirSolicitudMapeo({entity:"people", headers:["😀".repeat(20)], rows:[]}));
  assert.equal(construirSolicitudMapeo({entity:"people", headers:["é".repeat(41)], rows:[]}), null);
});
test("shared Unicode cells become printable closed ASCII after NFC", () => {
  const vectors = [["😀", "?"], ["e\u0301", "x"], ["Áñ", "Xx"], ["²١", "99"], ["\t\n\u00a0", "   "], ["\u0301", ""], ["€\u0000", "??"]];
  for (const [value, expected] of vectors) assert.equal(enmascararMuestra(value), expected, JSON.stringify(value));
  assert.equal(enmascararMuestra("😀".repeat(25)), "?".repeat(24));
});
test("RPC rejects every unmasked non ASCII cell", async () => {
  const calls: unknown[] = [];
  const client = { async rpc(name: string, args: Record<string,unknown>) { calls.push({name,args}); return {data:id,error:null}; } };
  for (const value of ["²", "١", "😀", "\t", "\n", "\u00a0", "\u0301", "0", "a", "\u007f"]) {
    assert.deepEqual(await solicitarMapeoImportacion(client,{schema:"travel-import-map-v1",entity:"people",headers:["Etiqueta"],samples:[[value]]}),{ok:false,reason:"entrada_invalida"},JSON.stringify(value));
  }
  assert.deepEqual(calls,[]);
});
test("Ana Pérez preamble causes zero RPC until row selection, review and confirmation", async () => {
  const calls: unknown[] = [];
  const client = { async rpc(name: string,args: Record<string,unknown>) { calls.push({name,args}); return {data:id,error:null}; } };
  const driver = await panelDriver(client);
  await driver.upload(await workbook([[["Ana Pérez"], ["Trabajador"], ["Persona Sintética"]]], ["Personas"]));
  driver.invoke("Interpretar columnas con IA"); await driver.settle();
  assert.deepEqual(calls, [], "automatic/fallback labels must not leave browser");
});
test("mixed book opens the failed Viajes matrix, not valid Personas", async () => {
  const driver = await panelDriver({async rpc(){throw new Error("unexpected RPC");}});
  await driver.upload(await workbook([person,trip],["Personas","Viajes"]));
  assert.ok(driver.find("Mapeo Código"));

});

test("changing entity selects its actual matrix", async () => {
  const driver = await panelDriver({async rpc(){throw new Error("unexpected RPC");}});
  await driver.upload(await workbook([person,trip],["Personas","Viajes"]));
  driver.change("Tipo de información", "people");
  assert.ok(driver.find("Mapeo nombreCompleto"));
  driver.change("Tipo de información", "trips");
  assert.ok(driver.find("Mapeo Código"));
});
test("manual mapping retains valid people in the combined preview", async () => {
  const driver = await panelDriver({async rpc(){throw new Error("unexpected RPC");}});
  await driver.upload(await workbook([person,trip],["Personas","Viajes"]));
  const selects = driver.all().filter(el => el.type === "select" && String(el.props["aria-label"]).startsWith("Mapeo "));
  const fields = ["codigoPersona", "fechaViaje", "sentido", "origen", "destino"];
  selects.forEach((el,i) => (el.props.onChange as (e:unknown)=>void)({currentTarget:{value:fields[i]}}));
  await driver.click("Revisar con este mapeo");
  assert.ok(driver.text().includes("Persona Sintética"), "valid people discarded");
});

test("manual mapping survives expired currentTarget and deferred updates through preview/apply; clearing preserves siblings", async () => {
  const { createImportFake } = await import("../scripts/fixtures/travel-import-fake.ts");
  const fake = createImportFake();
  const driver = await panelDriver(fake.client, { deferChangeUpdates: true });
  await driver.upload(await workbook([person, trip], ["Personas", "Viajes"]));
  driver.change("Fila de encabezados", "1");
  driver.flushChanges();

  // Both actual handlers return before either functional updater executes.
  driver.change("Mapeo Código", "codigoPersona");
  driver.change("Mapeo Fecha", "fechaViaje");
  assert.equal(driver.find("Mapeo Código").props.value, "", "updates must be deferred");
  assert.equal(driver.find("Mapeo Fecha").props.value, "", "updates must be deferred");
  driver.flushChanges();
  const fields = { Código: "codigoPersona", Fecha: "fechaViaje", Dirección: "sentido", Desde: "origen", Hasta: "destino" };
  for (const header of ["Dirección", "Desde", "Hasta"] as const) driver.change(`Mapeo ${header}`, fields[header]);
  driver.flushChanges();
  for (const [header, field] of Object.entries(fields)) assert.equal(driver.find(`Mapeo ${header}`).props.value, field);

  driver.change("Mapeo Desde", "");
  driver.flushChanges();
  for (const [header, field] of Object.entries(fields)) {
    assert.equal(driver.find(`Mapeo ${header}`).props.value, header === "Desde" ? "" : field, "clearing must preserve sibling mappings");
  }
  driver.change("Mapeo Desde", "origen");
  driver.flushChanges();
  assert.deepEqual(fake.calls, [], "manual mapping must not request AI");
  await driver.click("Revisar con este mapeo");
  assert.ok(driver.text().includes("Persona Sintética"));
  assert.ok(driver.text().includes("Viaje"));
  assert.equal(driver.find("Aplicar 2 cambios").props.disabled, false);
  assert.deepEqual(fake.calls, [], "preview must not apply changes");
  await driver.click("Aplicar 2 cambios");
  assert.equal(fake.calls.length, 1);
  const apply = fake.calls[0];
  assert.equal(apply.name, "sync_excel_batch");
  const payload = apply.args.p_payload as { people: Record<string, unknown>[]; trips: Record<string, unknown>[] };
  assert.equal(payload.people.length, 1);
  assert.equal(payload.people[0].employee_code, "SYN-1");
  assert.equal(payload.trips.length, 1);
  const mappedTrip = payload.trips[0];
  assert.deepEqual([mappedTrip.person_employee_code, mappedTrip.date, mappedTrip.direction, mappedTrip.origin, mappedTrip.destination], ["SYN-1", "2026-11-12", "SUBIDA", "Santiago", "Calama"]);
  assert.ok(driver.text().includes("SINCRONIZACIÓN COMPLETA"));
});

test("renaming alone cannot substitute explicit header row selection", async () => {
  const driver = await panelDriver({ async rpc() { throw new Error("unexpected RPC"); } });
  await driver.upload(await workbook([[["Ana Pérez"], ["Trabajador"], ["Persona Sintética"]]], ["Personas"]));
  driver.change("Etiqueta 1", "Columna");
  assert.equal(driver.find("Confirmar encabezados").props.disabled, true);
});
test("template review keeps actual header row when blank rows follow it", async () => {
  const driver = await panelDriver({ async rpc() { throw new Error("unexpected RPC"); } });
  await driver.upload(await workbook([[person[0], [], [], person[1]]], ["Personas"]));
  assert.equal(driver.find("Etiqueta 1").props.value, "codigoPersona");
});

test("reviewed and renamed labels produce the complete exact RPC payload", async () => {
  const { createImportFake, PREAMBLE_MATRIX } = await import("../scripts/fixtures/travel-import-fake.ts");
  const fake = createImportFake(); const driver = await panelDriver(fake.client);
  await driver.upload(await workbook([PREAMBLE_MATRIX],["Personas"]));
  assert.deepEqual(fake.calls, []);
  driver.change("Fila de encabezados", "2");
  driver.invoke("Interpretar columnas con IA"); await driver.settle();
  assert.deepEqual(fake.calls, []);
  driver.change("Etiqueta 2", "Colaborador");
  driver.change("Confirmar encabezados", true);
  await driver.click("Interpretar columnas con IA");
  assert.deepEqual(fake.calls, [
    { name: "request_trip_import_mapping", args: { p_request: { schema:"travel-import-map-v1",entity:"people",headers:["Código","Colaborador","Desde","Hasta","Inicio"],samples:[["XXX-9","Xxxxxxx Xxxxxxxxx","Xxxxxxxx","Xxxxxx","9999-99-99"]] } } },
    { name: "get_trip_ai_request", args: { p_id: id } },
  ]);
  assert.equal(driver.find("Mapeo Colaborador").props.value, "nombreCompleto");
  driver.change("Etiqueta 2", "Trabajador");
  assert.equal(driver.find("Confirmar encabezados").props.checked, false);
  assert.equal(driver.find("Interpretar columnas con IA").props.disabled, true);
  assert.equal(driver.find("Mapeo Trabajador").props.value, "");
  await driver.click("Interpretar columnas con IA");
  assert.equal(fake.calls.length, 2);
});

test("manual and AI mixed books preview both entities then apply only to fake", async () => {
  const { createImportFake } = await import("../scripts/fixtures/travel-import-fake.ts");
  for (const ai of [false,true]) {
    const fake = createImportFake(); const driver = await panelDriver(fake.client);
    await driver.upload(await workbook([person,trip],["Personas","Viajes"]));
    driver.change("Fila de encabezados", "1");
    if (ai) { driver.change("Confirmar encabezados", true); await driver.click("Interpretar columnas con IA"); }
    else {
      for (const [header,field] of Object.entries({Código:"codigoPersona",Fecha:"fechaViaje",Dirección:"sentido",Desde:"origen",Hasta:"destino"})) driver.change(`Mapeo ${header}`,field);
      assert.deepEqual(fake.calls,[]);
    }
    await driver.click("Revisar con este mapeo");
    assert.ok(driver.text().includes("Persona Sintética"));
    assert.ok(driver.text().includes("Viaje"));
    await driver.click("Aplicar 2 cambios");
    const apply = fake.calls.at(-1)!;
    assert.equal(apply.name,"sync_excel_batch");
    const payload = apply.args.p_payload as {people: unknown[]; trips: unknown[]};
    assert.equal(payload.people.length,1); assert.equal(payload.trips.length,1);
    assert.ok(driver.text().includes("SINCRONIZACIÓN COMPLETA"));
  }
});

test("evident email and RUT block AI locally, manual remains available", async () => {
  const { createImportFake, PREAMBLE_MATRIX } = await import("../scripts/fixtures/travel-import-fake.ts");
  for (const header of ["persona@example.test", "12.345.678-9", "12345678-K"]) {
    const fake = createImportFake(); const driver = await panelDriver(fake.client);
    await driver.upload(await workbook([PREAMBLE_MATRIX],["Personas"]));
    driver.change("Fila de encabezados", "2"); driver.change("Etiqueta 2",header);
    assert.equal(driver.find("Confirmar encabezados").props.disabled,true);
    await driver.click("Interpretar columnas con IA"); assert.deepEqual(fake.calls,[]);
    assert.equal(driver.find("Revisar con este mapeo").props.disabled,false);
    assert.equal(construirSolicitudMapeo({entity:"people",headers:[header],rows:[]}),null);
  }
});

test("row, sheet and entity changes revoke confirmation and AI mappings", async () => {
  const { createImportFake } = await import("../scripts/fixtures/travel-import-fake.ts");
  for (const change of ["row","sheet","entity"]) {
    const fake = createImportFake(); const driver = await panelDriver(fake.client);
    await driver.upload(await workbook([person,trip],["Personas","Viajes"]));
    driver.change("Fila de encabezados","1"); driver.change("Confirmar encabezados",true);
    await driver.click("Interpretar columnas con IA");
    if(change === "row") driver.change("Fila de encabezados","2");
    if(change === "sheet") driver.change("Hoja","0");
    if(change === "entity") driver.change("Tipo de información","people");
    assert.equal(driver.find("Confirmar encabezados").props.checked,false);
    assert.equal(driver.find("Interpretar columnas con IA").props.disabled,true);
    await driver.click("Interpretar columnas con IA"); assert.equal(fake.calls.length,2);
  }
});

test("malicious mapping fails closed in the actual panel", async () => {
  const { createImportFake } = await import("../scripts/fixtures/travel-import-fake.ts");
  const fake = createImportFake(()=>{}, true); const driver = await panelDriver(fake.client);
  await driver.upload(await workbook([person,trip],["Personas","Viajes"]));
  driver.change("Fila de encabezados","1"); driver.change("Confirmar encabezados",true);
  await driver.click("Interpretar columnas con IA");
  assert.equal(driver.find("Mapeo Código").props.value,"");
  assert.ok(driver.text().includes("La IA no está disponible"));
  assert.equal(fake.calls.filter(call=>call.name === "sync_excel_batch").length,0);
});

test("shared machine readable fixtures enforce UTF8 bytes and exact ASCII alphabet", async () => {
  const {readFile} = await import("node:fs/promises");
  const fixture = JSON.parse(await readFile(new URL("../fixtures/travel-import-contract.json",import.meta.url),"utf8"));
  for (const {input,masked} of fixture.mask_vectors) assert.equal(enmascararMuestra(input),masked);
  const calls: unknown[] = [];
  const client = {async rpc(name:string,args:Record<string,unknown>){calls.push({name,args});return {data:id,error:null};}};
  for(const sample of fixture.invalid_samples) assert.equal((await solicitarMapeoImportacion(client,{schema:"travel-import-map-v1",entity:"people",headers:["ñ"],samples:[[sample]]})).ok,false,sample);
  assert.deepEqual(calls,[]);
  for(const sample of fixture.valid_samples) assert.equal((await solicitarMapeoImportacion(client,{schema:"travel-import-map-v1",entity:"people",headers:["ñ"],samples:[[sample]]})).ok,true,sample);
});

test("RPC byte/count/width boundaries use the exact closed contract", async () => {
  const calls: unknown[] = []; const client = {async rpc(name:string,args:Record<string,unknown>){calls.push({name,args});return {data:id,error:null};}};
  const headers = Array.from({length:40},(_,i)=>`ñ-${i}`);
  const base = {schema:"travel-import-map-v1",entity:"trips",headers,samples:Array.from({length:3},()=>headers.map(()=>"x".repeat(24)))};
  assert.equal((await solicitarMapeoImportacion(client,base)).ok,true);
  assert.deepEqual(calls,[{name:"request_trip_import_mapping",args:{p_request:base}}]);
  calls.length=0;
  for(const invalid of [{...base,headers:[...headers,"Extra"]},{...base,samples:[...base.samples,base.samples[0]]},{...base,samples:[headers.map(()=>"x".repeat(25))]},{...base,samples:[["x"]]},{...base,headers:["A","A"],samples:[]},{...base,headers:[""],samples:[]}]) {
    assert.equal((await solicitarMapeoImportacion(client,invalid)).ok,false);
  }
  assert.deepEqual(calls,[]);
});
