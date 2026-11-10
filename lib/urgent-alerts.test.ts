import test from "node:test";
import assert from "node:assert/strict";
import {
  destinatariosDe,
  leerDatosDeAlerta,
  mensajeDeAlerta,
  totalDeAvisos,
  viajesPorAvisar,
  type DatosDeAlerta,
  type ViajeDeAlerta,
} from "./urgent-alerts.ts";

const HOY = "2026-09-10";
const viaje = (extra: Partial<ViajeDeAlerta> = {}): ViajeDeAlerta => ({
  id: "t1", persona: "Ana Pérez", fecha: "2026-09-12", sentido: "SUBIDA", origen: "Santiago",
  destino: "Copiapó", estado: "Planificado", hora: "08:30", ...extra,
});
const datos = (viajes: ViajeDeAlerta[], ventana = 21): DatosDeAlerta => ({ hoy: HOY, ventana, viajes });

test("se avisa de lo urgente y de lo vencido, y de nada más", () => {
  const avisos = viajesPorAvisar(datos([
    viaje({ id: "vencido", fecha: "2026-09-08" }),
    viaje({ id: "hoy", fecha: HOY }),
    viaje({ id: "limite", fecha: "2026-10-01" }),
    viaje({ id: "lejano", fecha: "2026-10-02" }),
  ]));
  assert.deepEqual(avisos.vencidos.map((v) => v.id), ["vencido"]);
  assert.deepEqual(avisos.urgentes.map((v) => v.id), ["hoy", "limite"]);
  assert.equal(totalDeAvisos(avisos), 3, "el de 22 días todavía tiene tiempo");
});

test("la ventana de la obra decide qué es urgente", () => {
  const viajes = [viaje({ fecha: "2026-09-25" })];
  assert.equal(totalDeAvisos(viajesPorAvisar(datos(viajes, 21))), 1);
  assert.equal(totalDeAvisos(viajesPorAvisar(datos(viajes, 7))), 0);
});

test("un viaje anulado no se avisa aunque llegue de la base", () => {
  assert.equal(totalDeAvisos(viajesPorAvisar(datos([viaje({ estado: "Anulado" })]))), 0);
});

test("los avisos salen ordenados por fecha y luego por nombre", () => {
  const { urgentes } = viajesPorAvisar(datos([
    viaje({ id: "c", fecha: "2026-09-14", persona: "Zoe" }),
    viaje({ id: "b", fecha: "2026-09-12", persona: "Luis" }),
    viaje({ id: "a", fecha: "2026-09-12", persona: "Ana" }),
  ]));
  assert.deepEqual(urgentes.map((v) => v.id), ["a", "b", "c"]);
});

test("sin nada que avisar no hay correo", () => {
  assert.equal(mensajeDeAlerta({ vencidos: [], urgentes: [] }, HOY, "https://app.test"), null);
});

test("el correo dice cuántos son, quiénes y cuánto falta", () => {
  const avisos = viajesPorAvisar(datos([
    viaje({ id: "v", fecha: "2026-09-08", persona: "Luis Soto" }),
    viaje({ id: "m", fecha: "2026-09-11", persona: "Ana Pérez", sentido: "BAJADA", hora: null }),
    viaje({ id: "h", fecha: HOY, persona: "Zoe Rojas" }),
  ]));
  const mensaje = mensajeDeAlerta(avisos, HOY, "https://app.test");
  assert.ok(mensaje);
  assert.equal(mensaje.asunto, "Daybook Travel: 3 viajes por comprar (1 vencido)");
  assert.match(mensaje.texto, /VENCIDOS/);
  assert.match(mensaje.texto, /Luis Soto .*pasó hace 2 días/);
  assert.match(mensaje.texto, /Ana Pérez .*bajada\) · Planificado · vuela mañana/);
  assert.match(mensaje.texto, /Zoe Rojas .*vuela hoy/);
  assert.match(mensaje.texto, /https:\/\/app\.test/);
  assert.ok(mensaje.texto.indexOf("VENCIDOS") < mensaje.texto.indexOf("URGENTES"), "lo vencido va primero");
});

test("el asunto no menciona vencidos si no hay", () => {
  const mensaje = mensajeDeAlerta(viajesPorAvisar(datos([viaje()])), HOY, "https://app.test");
  assert.equal(mensaje?.asunto, "Daybook Travel: 1 viaje por comprar");
});

test("el HTML escapa los nombres: un nombre con etiquetas no inyecta nada", () => {
  const avisos = viajesPorAvisar(datos([viaje({ persona: '<img src=x onerror="alert(1)">' })]));
  const mensaje = mensajeDeAlerta(avisos, HOY, "https://app.test");
  assert.ok(mensaje);
  assert.doesNotMatch(mensaje.html, /<img/);
  assert.match(mensaje.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
});

test("leerDatosDeAlerta acepta lo que devuelve la base y rechaza lo demás", () => {
  const bueno = leerDatosDeAlerta({ hoy: HOY, ventana: 21, viajes: [{ ...viaje(), hora: "" }] });
  assert.equal(bueno.viajes[0].hora, null, "una hora vacía es sin hora");
  for (const malo of [null, {}, { hoy: "mañana", ventana: 21, viajes: [] }, { hoy: HOY, ventana: "21", viajes: [] }, { hoy: HOY, ventana: 21, viajes: "x" }, { hoy: HOY, ventana: 21, viajes: [{ fecha: "ayer" }] }]) {
    assert.throws(() => leerDatosDeAlerta(malo), /forma inesperada|fecha válida/, JSON.stringify(malo));
  }
});

test("los destinatarios se separan, se normalizan y no se repiten", () => {
  assert.deepEqual(
    destinatariosDe(" Katy@Obra.cl, tamara@obra.cl;katy@obra.cl  no-es-correo "),
    ["katy@obra.cl", "tamara@obra.cl"],
  );
  assert.deepEqual(destinatariosDe(undefined), []);
  assert.deepEqual(destinatariosDe(""), []);
});
