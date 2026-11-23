import test from "node:test";
import assert from "node:assert/strict";
import { manejarCalendario } from "./mis-vuelos-calendario-handler.ts";

const LLAVE = "c".repeat(64);
const datos = {
  ok: true,
  hoy: "2026-11-23",
  persona: { nombre: "Persona de ejemplo", origen: "Santiago", destino: "Copiapó" },
  viajes: [{ id: "t1", fecha: "2026-11-24", sentido: "SUBIDA", origen: "Santiago", destino: "Copiapó", hora: "08:30", estado: "Emitido", reserva: "ABC123", vuelo: "LA 340", equipaje: "Mochila" }],
};

test("con una llave vigente devuelve el calendario, sin guardarse en intermediarios", async () => {
  let pedida = "";
  const respuesta = await manejarCalendario({
    llave: `${LLAVE}.ics`,
    consultar: async (llave) => { pedida = llave; return datos; },
    ahora: new Date("2026-11-23T12:00:00Z"),
  });
  assert.equal(respuesta.status, 200);
  assert.equal(pedida, LLAVE, "la extensión .ics no llega a la base");
  assert.match(respuesta.headers.get("content-type") ?? "", /^text\/calendar/);
  assert.equal(respuesta.headers.get("cache-control"), "private, no-store");
  assert.match(await respuesta.text(), /SUMMARY:Subida Santiago → Copiapó \(LA 340\)/);
});

test("una llave mal formada no llega a la base; una vencida responde 404 igual", async () => {
  let consultas = 0;
  const consultar = async () => { consultas += 1; return { ok: false, motivo: "sesion" }; };
  assert.equal((await manejarCalendario({ llave: "../../etc", consultar })).status, 404);
  assert.equal((await manejarCalendario({ llave: "C".repeat(64), consultar })).status, 404);
  assert.equal(consultas, 0);
  assert.equal((await manejarCalendario({ llave: LLAVE, consultar })).status, 404);
  assert.equal(consultas, 1);
});

test("si la base falla, responde 502 sin detalles", async () => {
  const respuesta = await manejarCalendario({ llave: LLAVE, consultar: async () => { throw new Error("secreto interno"); } });
  assert.equal(respuesta.status, 502);
  assert.doesNotMatch(await respuesta.text(), /secreto/);
});
