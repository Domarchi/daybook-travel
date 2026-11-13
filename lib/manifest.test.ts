import test from "node:test";
import assert from "node:assert/strict";
import { agruparManifiesto, horaDelBloque, textoDeManifiesto } from "./manifest.ts";
import type { Trip } from "./types.ts";

const HOY = "2026-09-10";

const nombres: Record<string, string> = {
  p1: "Juan Pérez",
  p2: "María Soto",
  p3: "Andrés Rojas",
};
const nombreDe = (id: string) => nombres[id] ?? "Persona sin registro";

let contador = 0;
const viaje = (extra: Partial<Trip> & { person_id: string; date: string }): Trip => ({
  id: `v${++contador}`,
  direction: "SUBIDA",
  origin: "Santiago",
  destination: "Copiapó",
  requested_time: "08:00:00",
  baggage: "Maleta en bodega",
  status: "Planificado",
  pnr: "",
  flight: "",
  amount: null,
  notes: "",
  ...extra,
});

// ---------------------------------------------------------------------------
// Agrupar: un bloque por fecha y ruta.
// ---------------------------------------------------------------------------

test("dos personas el mismo día y ruta caen en un solo bloque", () => {
  const bloques = agruparManifiesto(
    [
      viaje({ person_id: "p1", date: "2026-09-14" }),
      viaje({ person_id: "p2", date: "2026-09-14" }),
    ],
    nombreDe,
  );
  assert.equal(bloques.length, 1);
  assert.equal(bloques[0].pasajeros.length, 2);
});

test("la misma fecha con rutas distintas son bloques distintos", () => {
  const bloques = agruparManifiesto(
    [
      viaje({ person_id: "p1", date: "2026-09-14" }),
      viaje({
        person_id: "p2",
        date: "2026-09-14",
        direction: "BAJADA",
        origin: "Copiapó",
        destination: "Santiago",
      }),
    ],
    nombreDe,
  );
  assert.equal(bloques.length, 2);
});

test("los bloques van por fecha y, dentro de la fecha, por ruta", () => {
  const bloques = agruparManifiesto(
    [
      viaje({ person_id: "p1", date: "2026-09-17" }),
      viaje({
        person_id: "p2",
        date: "2026-09-14",
        direction: "BAJADA",
        origin: "Copiapó",
        destination: "Santiago",
      }),
      viaje({ person_id: "p3", date: "2026-09-14" }),
    ],
    nombreDe,
  );
  assert.deepEqual(
    bloques.map((b) => [b.fecha, b.origen]),
    [
      ["2026-09-14", "Copiapó"],
      ["2026-09-14", "Santiago"],
      ["2026-09-17", "Santiago"],
    ],
  );
});

test("dentro de un bloque los pasajeros van por nombre, sin importar acentos", () => {
  const bloques = agruparManifiesto(
    [
      viaje({ person_id: "p2", date: "2026-09-14" }),
      viaje({ person_id: "p1", date: "2026-09-14" }),
      viaje({ person_id: "p3", date: "2026-09-14" }),
    ],
    nombreDe,
  );
  assert.deepEqual(
    bloques[0].pasajeros.map((p) => p.nombre),
    ["Andrés Rojas", "Juan Pérez", "María Soto"],
  );
});

test("la hora se recorta a HH:MM y sin hora queda en null", () => {
  const bloques = agruparManifiesto(
    [
      viaje({ person_id: "p1", date: "2026-09-14", requested_time: "18:30:00" }),
      viaje({ person_id: "p2", date: "2026-09-14", requested_time: null }),
    ],
    nombreDe,
  );
  assert.equal(bloques[0].pasajeros[0].hora, "18:30");
  assert.equal(bloques[0].pasajeros[1].hora, null);
});

// ---------------------------------------------------------------------------
// Texto: lo que se pega en el correo.
// ---------------------------------------------------------------------------

test("el texto lleva encabezado, un bloque por día y ruta, y un pie con el total", () => {
  const bloques = agruparManifiesto(
    [
      viaje({ person_id: "p1", date: "2026-09-14" }),
      viaje({ person_id: "p2", date: "2026-09-14", baggage: "Mochila" }),
      viaje({
        person_id: "p1",
        date: "2026-09-17",
        direction: "BAJADA",
        origin: "Copiapó",
        destination: "Santiago",
        requested_time: "18:00:00",
      }),
    ],
    nombreDe,
  );
  const texto = textoDeManifiesto(bloques, HOY);
  assert.equal(
    texto,
    [
      "SOLICITUD DE PASAJES — Daybook Travel",
      "Generada el 10 de septiembre de 2026",
      "",
      "LUNES 14 DE SEPTIEMBRE DE 2026",
      "Santiago → Copiapó (subida) · 2 pasajeros",
      "  1. Juan Pérez — 08:00 — maleta en bodega",
      "  2. María Soto — 08:00 — mochila",
      "",
      "JUEVES 17 DE SEPTIEMBRE DE 2026",
      "Copiapó → Santiago (bajada) · 1 pasajero",
      "  1. Juan Pérez — 18:00 — maleta en bodega",
      "",
      "Total: 3 pasajes en 2 vuelos.",
    ].join("\n"),
  );
});

test("la fecha se escribe una sola vez cuando tiene dos rutas", () => {
  const bloques = agruparManifiesto(
    [
      viaje({ person_id: "p1", date: "2026-09-14" }),
      viaje({
        person_id: "p2",
        date: "2026-09-14",
        direction: "BAJADA",
        origin: "Copiapó",
        destination: "Santiago",
      }),
    ],
    nombreDe,
  );
  const texto = textoDeManifiesto(bloques, HOY);
  assert.equal(texto.split("LUNES 14 DE SEPTIEMBRE DE 2026").length - 1, 1);
  assert.match(texto, /Copiapó → Santiago \(bajada\)/);
  assert.match(texto, /Santiago → Copiapó \(subida\)/);
});

test("sin hora ni equipaje el texto dice 'Por confirmar' en vez de dejar un hueco", () => {
  const bloques = agruparManifiesto(
    [viaje({ person_id: "p1", date: "2026-09-14", requested_time: null, baggage: "" })],
    nombreDe,
  );
  const texto = textoDeManifiesto(bloques, HOY);
  assert.match(texto, /1\. Juan Pérez — Por confirmar — Por confirmar/);
});

test("el total del pie suma los pasajeros de todos los bloques", () => {
  const bloques = agruparManifiesto(
    [
      viaje({ person_id: "p1", date: "2026-09-14" }),
      viaje({ person_id: "p2", date: "2026-09-14" }),
      viaje({ person_id: "p3", date: "2026-09-21" }),
    ],
    nombreDe,
  );
  assert.match(textoDeManifiesto(bloques, HOY), /Total: 3 pasajes en 2 vuelos\./);
});

test("sin viajes el texto igual tiene encabezado y un total en cero", () => {
  const texto = textoDeManifiesto([], HOY);
  assert.match(texto, /^SOLICITUD DE PASAJES/);
  assert.match(texto, /Total: 0 pasajes en 0 vuelos\./);
});

test("dentro de un día los bloques van por hora de vuelo, y los sin hora al final", () => {
  const bloques = agruparManifiesto(
    [
      // Sin hora: va al final del día aunque su origen vaya primero en el abecedario.
      viaje({ person_id: "p1", date: "2026-09-14", origin: "Antofagasta", requested_time: null }),
      viaje({ person_id: "p2", date: "2026-09-14", origin: "Santiago", requested_time: "19:30:00" }),
      viaje({ person_id: "p3", date: "2026-09-14", direction: "BAJADA", origin: "Copiapó", destination: "Santiago", requested_time: "07:05:00" }),
    ],
    nombreDe,
  );
  assert.deepEqual(bloques.map((b) => [b.origen, horaDelBloque(b)]), [
    ["Copiapó", "07:05"],
    ["Santiago", "19:30"],
    ["Antofagasta", null],
  ]);
});

test("la hora de un bloque es la más temprana, y sus pasajeros van por hora y nombre", () => {
  const [bloque] = agruparManifiesto(
    [
      viaje({ person_id: "p2", date: "2026-09-14", requested_time: "10:00:00" }),
      viaje({ person_id: "p1", date: "2026-09-14", requested_time: null }),
      viaje({ person_id: "p3", date: "2026-09-14", requested_time: "08:15:00" }),
    ],
    nombreDe,
  );
  assert.equal(horaDelBloque(bloque), "08:15");
  assert.deepEqual(bloque.pasajeros.map((p) => p.nombre), ["Andrés Rojas", "María Soto", "Juan Pérez"]);
});
