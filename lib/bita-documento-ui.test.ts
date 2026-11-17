// Las piezas de pantalla de los documentos de Bita: validar lo que llega, validar el
// archivo antes de subirlo y armar las filas que se insertan.
import assert from "node:assert/strict";
import test from "node:test";
import { MAX_ARCHIVO_BYTES } from "./bita-documento.ts";
import {
  MAX_ARCHIVO_PANTALLA,
  conteoDePropuesta,
  esRespuestaDocumento,
  fechaCorta,
  filasParaInsertar,
  problemaDeArchivo,
  textoDeHistorial,
  type FilaDeDocumento,
  type RespuestaDocumento,
} from "./bita-ui.ts";

const fila = (extra: Partial<FilaDeDocumento> = {}): FilaDeDocumento => ({
  clave: "p-ana|2026-11-24|SUBIDA", personaId: "p-ana", persona: "Ana Rojas Díaz", fecha: "2026-11-24", sentido: "SUBIDA",
  origen: "Santiago", destino: "Copiapó", hora: "08:30", fila: 3, estado: "nuevo", detalle: "", ...extra,
});
const respuesta = (extra: Partial<RespuestaDocumento> = {}): RespuestaDocumento => ({
  archivo: "manifiesto.xlsx", formato: "xlsx", truncado: false, resumen: "Un manifiesto.", filas: [fila()], sinIdentificar: [{ referencia: "Carlos Díaz Mena", motivo: "No tiene ficha" }],
  omitidos: 0, restantes: 4, limite: 5, ...extra,
});

test("el tope de la pantalla es el mismo que el del servidor", () => {
  assert.equal(MAX_ARCHIVO_PANTALLA, MAX_ARCHIVO_BYTES);
});

test("esRespuestaDocumento acepta lo que manda el servidor y rechaza lo manipulado", () => {
  assert.equal(esRespuestaDocumento(respuesta()), true);
  assert.equal(esRespuestaDocumento(respuesta({ filas: [fila({ estado: "existe", viajeId: "t1", detalle: "Ya está en la agenda." }), fila({ sentido: null, estado: "problema", detalle: "x", hora: null, fila: null })] })), true);
  for (const malo of [
    null, "x", {}, { ...respuesta(), formato: "exe" }, { ...respuesta(), filas: "no" }, { ...respuesta(), filas: [{ ...fila(), estado: "otro" }] },
    { ...respuesta(), filas: [{ ...fila(), hora: "8:30" }] }, { ...respuesta(), filas: [{ ...fila(), sentido: "SUBE" }] },
    { ...respuesta(), filas: Array.from({ length: 81 }, () => fila()) }, { ...respuesta(), restantes: -1 }, { ...respuesta(), sinIdentificar: [{ referencia: 1 }] },
  ])
    assert.equal(esRespuestaDocumento(malo), false);
});

test("un archivo que el servidor va a rechazar ni se sube", () => {
  assert.equal(problemaDeArchivo({ name: "a.xlsx", size: 1000 }), null);
  assert.equal(problemaDeArchivo({ name: "A.PDF", size: 1000 }), null);
  assert.equal(problemaDeArchivo({ name: "a.docx", size: MAX_ARCHIVO_PANTALLA }), null);
  assert.match(problemaDeArchivo({ name: "a.xls", size: 10 })!, /\.xlsx/);
  assert.match(problemaDeArchivo({ name: "a.doc", size: 10 })!, /\.docx/);
  assert.match(problemaDeArchivo({ name: "foto.png", size: 10 })!, /Excel/);
  assert.match(problemaDeArchivo({ name: "a.xlsx", size: 0 })!, /vacío/);
  assert.match(problemaDeArchivo({ name: "a.xlsx", size: MAX_ARCHIVO_PANTALLA + 1 })!, /4 MB/);
});

test("lo que queda en la conversación son cifras: ni el archivo ni lo que dijo el modelo", () => {
  const r = respuesta({
    resumen: "Viajes de Carlos Díaz Mena.",
    filas: [fila(), fila({ clave: "b", estado: "existe" }), fila({ clave: "c", estado: "problema" })],
  });
  assert.deepEqual(conteoDePropuesta(r.filas), { nuevos: 1, existen: 1, problemas: 1 });
  const t = textoDeHistorial(r);
  assert.equal(t, "Revisé el documento que adjuntaste: 1 viajes nuevos, 1 que ya estaban en la agenda y 1 con problemas.");
  assert.ok(!/Carlos|Díaz|manifiesto|Ana/.test(t));
  assert.match(textoDeHistorial(respuesta({ filas: [] })), /no encontré viajes/);
});

const ficha = (id: string, extra = {}) => ({ id, baggage: "Mochila", active: true, start_date: "2026-01-05", end_date: null, ...extra });
const elegido = (extra = {}) => ({ personaId: "p-ana", fecha: "2026-11-24", sentido: "SUBIDA" as const, origen: "Santiago", destino: "Copiapó", hora: "08:30", ...extra });

test("las filas que se insertan son «Planificado», sin reserva ni monto, con la maleta de la ficha y una nota de dónde salieron", () => {
  const { filas, omitidas } = filasParaInsertar([elegido(), elegido({ fecha: "2026-11-25", sentido: "BAJADA", hora: null })], [ficha("p-ana", { baggage: "Maleta en bodega" })], [], "manifiesto «raro».xlsx", "2026-11-17");
  assert.equal(omitidas, 0);
  assert.deepEqual(filas[0], {
    person_id: "p-ana", date: "2026-11-24", direction: "SUBIDA", origin: "Santiago", destination: "Copiapó", requested_time: "08:30", baggage: "Maleta en bodega",
    status: "Planificado", pnr: "", flight: "", amount: null, notes: "Planificado desde «manifiesto «raro».xlsx» con Bita.",
  });
  assert.equal(filas[1].requested_time, null);
});

test("lo que dejó de servir desde la propuesta se deja fuera para no tumbar el lote entero", () => {
  const existentes = [{ person_id: "p-ana", date: "2026-11-24", direction: "SUBIDA" }];
  const personas = [ficha("p-ana"), ficha("p-luis", { end_date: "2026-11-30" }), ficha("p-pedro", { active: false })];
  const { filas, omitidas } = filasParaInsertar(
    [
      elegido(), // otra persona ya lo creó
      elegido({ personaId: "p-luis", fecha: "2026-12-02" }), // fuera de la vigencia
      elegido({ personaId: "p-pedro" }), // la dieron de baja
      elegido({ personaId: "p-nadie" }), // la ficha ya no existe
      elegido({ fecha: "2026-11-16" }), // la fecha ya pasó
      elegido({ fecha: "2026-11-26" }),
      elegido({ fecha: "2026-11-26" }), // repetido
      elegido({ fecha: "2026-11-27", origen: " " }),
    ],
    personas,
    existentes,
    "a.xlsx",
    "2026-11-17",
  );
  assert.deepEqual(filas.map((f) => f.date), ["2026-11-26"]);
  assert.equal(omitidas, 7);
});

test("fechaCorta muestra una fecha que no existe tal cual, sin inventar otra", () => {
  assert.match(fechaCorta("2026-11-24"), /24/);
  assert.equal(fechaCorta("2026-02-30"), "2026-02-30");
  assert.equal(fechaCorta("mañana"), "mañana");
});
