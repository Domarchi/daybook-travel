import test from "node:test";
import assert from "node:assert/strict";
import { calendarioIcs, escaparIcs, plegarIcs } from "./mis-vuelos-ics.ts";
import type { MisVuelos } from "./mis-vuelos.ts";

const datos: MisVuelos = {
  hoy: "2026-11-23",
  calendario: null,
  persona: { nombre: "Persona de ejemplo", origen: "Santiago", destino: "Copiapó", tieneCorreo: false, tieneTelefono: false },
  viajes: [
    { id: "t1", fecha: "2026-11-24", sentido: "SUBIDA", origen: "Santiago", destino: "Copiapó", hora: "08:30", estado: "Emitido", reserva: "ABC123", vuelo: "LA 340", equipaje: "Maleta en bodega" },
    { id: "t2", fecha: "2026-11-27", sentido: "BAJADA", origen: "Copiapó", destino: "Santiago", hora: null, estado: "Planificado", reserva: "", vuelo: "", equipaje: "Por confirmar" },
  ],
};

test("un evento por viaje, con hora o de día completo, y el aviso del día antes", () => {
  const plegado = calendarioIcs(datos, new Date("2026-11-23T15:04:05.678Z"));
  assert.ok(!/[^\r]\n/.test(plegado), "todos los saltos son CRLF");
  // Las líneas largas vienen plegadas; se despliegan para leerlas.
  const ics = plegado.replaceAll("\r\n ", "");
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 2);
  assert.match(ics, /UID:t1@daybook-travel/);
  assert.match(ics, /DTSTAMP:20261123T150405Z/);
  // Con hora: flotante, una hora, aviso 24 h antes.
  assert.match(ics, /DTSTART:20261124T083000\r\nDURATION:PT1H/);
  assert.match(ics, /SUMMARY:Subida Santiago → Copiapó \(LA 340\)/);
  assert.match(ics, /DESCRIPTION:Código de reserva: ABC123\\nVuelo: LA 340\\nHora: 08:30\\nEquipaje: maleta en bodega/);
  assert.match(ics, /STATUS:CONFIRMED/);
  assert.match(ics, /TRIGGER:-P1D/);
  // Sin hora: día completo, aviso a las 18:00 de la víspera, tentativo.
  assert.match(ics, /DTSTART;VALUE=DATE:20261127\r\nDTEND;VALUE=DATE:20261128/);
  assert.match(ics, /DESCRIPTION:Pasaje por confirmar. La coordinación te avisa/);
  assert.match(ics, /STATUS:TENTATIVE/);
  assert.match(ics, /TRIGGER:-PT6H/);
});

test("escapa el texto y corta las líneas largas sin partir caracteres", () => {
  assert.equal(escaparIcs("a;b,c\\d\ne"), "a\\;b\\,c\\\\d\\ne");
  const larga = "DESCRIPTION:" + "ñ".repeat(60);
  const plegada = plegarIcs(larga);
  for (const parte of plegada.split("\r\n")) {
    assert.ok(new TextEncoder().encode(parte).length <= 75, parte);
  }
  assert.equal(plegada.replaceAll("\r\n ", ""), larga);
  assert.equal(plegarIcs("corta"), "corta");
});

test("sin viajes es un calendario vacío válido", () => {
  const ics = calendarioIcs({ ...datos, viajes: [] }, new Date("2026-11-23T00:00:00Z"));
  assert.ok(!ics.includes("BEGIN:VEVENT"));
  assert.match(ics, /X-WR-CALNAME:Mis vuelos/);
});
