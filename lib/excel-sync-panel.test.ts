import assert from "node:assert/strict";
import test from "node:test";
import { panelDriver, workbook } from "./excel-panel-test-driver.ts";
import { PERSON_MATRIX, TRIP_MATRIX, createImportFake } from "../scripts/fixtures/travel-import-fake.ts";

for (const [name, headers, row] of [
  ["Personas", PERSON_MATRIX[0], PERSON_MATRIX[1]],
  ["Viajes", TRIP_MATRIX[0], TRIP_MATRIX[1]],
  ["Datos", ["Columna"], ["Sintético"]],
] as const) {
  test(`5001 rows rejected before manual or AI (${name})`, {timeout:30000}, async () => {
    const fake = createImportFake(); const driver = await panelDriver(fake.client);
    await driver.upload(await workbook([[[...headers], ...Array.from({length:5001},()=>[...row])]],[name]));
    assert.ok(driver.text().includes("5000 filas"),driver.text().slice(0,500));
    assert.deepEqual(fake.calls,[]);
  });
}

test("combined sheets cannot exceed 5000 rows in one entity", {timeout:30000}, async () => {
  const fake = createImportFake(); const driver = await panelDriver(fake.client);
  const matrix = [PERSON_MATRIX[0], ...Array.from({length:2501},(_,i)=>[...PERSON_MATRIX[1].map((value,col)=>col === 0 ? `SYN-${i}` : value)])];
  await driver.upload(await workbook([matrix,matrix],["Personas","Más personas"]));
  await driver.click("Revisar con este mapeo");
  assert.ok(driver.text().includes("Cada entidad admite hasta 5000"));
  assert.deepEqual(fake.calls,[]);
});

test("late AI response cannot restore mapping after header revision", async () => {
  const fake = createImportFake();
  let resolveResponse: () => void = () => {};
  const client = { async rpc(name:string,args:Record<string,unknown>) {
    const value = await fake.client.rpc(name,args);
    return name === "get_trip_ai_request" ? new Promise< typeof value >(resolve=>{resolveResponse=()=>resolve(value);}) : value;
  }};
  const driver = await panelDriver(client);
  await driver.upload(await workbook([PERSON_MATRIX,TRIP_MATRIX],["Personas","Viajes"]));
  driver.change("Fila de encabezados","1"); driver.change("Confirmar encabezados",true);
  driver.invoke("Interpretar columnas con IA");
  while(fake.calls.length < 2) await new Promise(resolve=>setTimeout(resolve,5));
  driver.change("Etiqueta 1","Código revisado");
  resolveResponse(); await driver.settle();
  assert.equal(driver.find("Confirmar encabezados").props.checked,false);
  assert.equal(driver.find("Mapeo Código revisado").props.value,"");
  assert.equal(driver.find("Interpretar columnas con IA").props.disabled,true);
});

test("exactly 5000 rows remain available for local mapping", {timeout:30000}, async () => {
  const fake = createImportFake(); const driver = await panelDriver(fake.client);
  await driver.upload(await workbook([[["Columna"],...Array.from({length:5000},()=>["Sintético"])]],["Datos"]));
  assert.ok(driver.find("Mapeo Columna"));
  assert.deepEqual(fake.calls,[]);
});
