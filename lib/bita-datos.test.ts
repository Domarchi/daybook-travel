// Bita en Travel: seudónimos, herramientas, resumen sin IA y piezas de pantalla.
// Datos ficticios; sin red ni base.
import assert from "node:assert/strict";
import test from "node:test";
import { bitaHabilitada, bitaTieneLlave, cupoDiario, modeloDeBita } from "./bita-config.ts";
import { crearSeudonimos, enmascarar } from "./bita-seudonimos.ts";
import { ejecutarHerramienta, HERRAMIENTAS, type ContextoHerramientas, type DatosBita } from "./bita-herramientas.ts";
import { lineasDeResumen, movimientosEnTexto, resumenDeBita } from "./bita-resumen.ts";
import { esRespuestaChat, esRespuestaCupo, presentacion, saludoPara, trozosConViajes } from "./bita-ui.ts";
import type { HistoryItem, Person, Trip } from "./types.ts";

const HOY = "2026-11-12";
const persona = (id: string, name: string, extra: Partial<Person> = {}): Person => ({
  id, name, origin: "Santiago", destination: "Copiapó", shift: "4×3", start_date: "2026-01-05", end_date: null,
  baggage: "Mochila", active: true, ...extra,
});
const viaje = (id: string, person_id: string, date: string, extra: Partial<Trip> = {}): Trip => ({
  id, person_id, date, direction: "SUBIDA", origin: "Santiago", destination: "Copiapó", requested_time: "08:00:00",
  baggage: "Mochila", status: "Planificado", pnr: "", flight: "", amount: null, notes: "", ...extra,
});

const personas = [
  persona("p-juan", "Juan Pérez Soto"),
  persona("p-maria", "María José Rojas"),
  persona("p-juana", "Juan Carlos Díaz"),
  persona("p-ana", "Ana Paz Muñoz"),
];
const viajes = [
  viaje("t1", "p-juan", HOY, { pnr: "DJVHQQ", flight: "LA123", amount: 85000, status: "Emitido" }),
  viaje("t2", "p-maria", HOY, { direction: "BAJADA", requested_time: null }),
  viaje("t3", "p-ana", "2026-11-13"),
  viaje("t4", "p-juan", "2026-11-05", { direction: "BAJADA" }), // vencido: 7 días sin reserva
  viaje("t5", "p-maria", "2026-10-01"), // sin cerrar
  viaje("t6", "p-juana", "2026-11-14", { status: "Anulado" }),
  viaje("t7", "p-ana", "2026-10-20", { amount: 90000, pnr: "XYZ987", status: "Completado" }),
];
const datos: DatosBita = {
  hoy: HOY,
  ventana: 21,
  personas,
  viajes,
  tipos: [{ id: "d1", name: "Examen médico", active: true }],
  documentos: [{ person_id: "p-juan", type_id: "d1", expires_on: "2027-01-01" }],
};

test("configuración: apagada por omisión, cupo acotado, modelo Haiku", () => {
  assert.equal(bitaHabilitada({}), false);
  assert.equal(bitaHabilitada({ BITA_ENABLED: "Sí" }), true);
  assert.equal(bitaTieneLlave({ ANTHROPIC_API_KEY: "  " }), false);
  assert.equal(cupoDiario({}), 20);
  assert.equal(cupoDiario({ BITA_DAILY_LIMIT: "100000" }), 200);
  assert.equal(cupoDiario({ BITA_DAILY_LIMIT: "-3" }), 1);
  assert.equal(modeloDeBita({}), "claude-haiku-5-5");
});

test("seudónimos: estables, sin nombres hacia afuera, y los nombres vuelven en la respuesta", () => {
  const s = crearSeudonimos(personas, viajes);
  const juan = s.persona("p-juan");
  assert.match(juan, /^P-[0-9a-f]{4}$/);
  assert.equal(crearSeudonimos([...personas].reverse(), viajes).persona("p-juan"), juan, "no depende del orden");
  assert.equal(s.idDePersona(juan), "p-juan");
  assert.equal(s.idDeViaje(s.viaje("t1")), "t1");

  const oculto = s.ocultar("¿Cuándo sube juan perez soto? Y maria jose rojas, correo maria@obra.cl, fono +56 9 8765 4321");
  assert.ok(!/juan|perez|maria|rojas|maria@obra|8765/i.test(oculto), oculto);
  assert.ok(oculto.includes(juan));
  assert.ok(oculto.includes("[correo omitido]") && oculto.includes("[teléfono omitido]"));

  // Un nombre de pila que tienen dos personas no se adivina: se dice entre quiénes está la duda.
  const ambiguo = s.ocultar("¿Juan sube el lunes?");
  assert.ok(!/juan/i.test(ambiguo.replace("«J…»", "")), ambiguo);
  assert.match(ambiguo, /puede ser P-[0-9a-f]{4}, P-[0-9a-f]{4}/);
  // Partes de nombre que son palabras comunes no se tapan solas.
  assert.equal(s.ocultar("Hay paz en la obra"), "Hay paz en la obra");
  // Un apellido único sí.
  assert.ok(s.ocultar("¿Y Muñoz?").includes(s.persona("p-ana")));

  assert.equal(s.restaurar(`${juan} sube hoy.`), "Juan Pérez Soto sube hoy.");
  assert.equal(enmascarar("RUT 12.345.678-9"), "RUT [RUT omitido]");
});

const contexto = (historial: HistoryItem[] = []): ContextoHerramientas => ({
  datos,
  seud: crearSeudonimos(personas, viajes),
  leerHistorial: async () => historial,
});
const correr = async (nombre: string, entrada: unknown, ctx = contexto()) => {
  const r = await ejecutarHerramienta(nombre, entrada, ctx);
  return { ...r, datos: JSON.parse(r.contenido) };
};

test("las herramientas nunca sacan nombres, códigos de reserva, vuelos ni montos de un viaje", async () => {
  assert.deepEqual(HERRAMIENTAS.map((h) => h.name), ["agenda", "viajes_de_persona", "por_comprar", "costos", "acreditacion", "historial_de_viaje"]);
  const ctx = contexto();
  const todo = [
    await correr("agenda", { desde: "2026-10-01", hasta: "2026-10-31" }, ctx),
    await correr("agenda", {}, ctx),
    await correr("viajes_de_persona", { persona: ctx.seud.persona("p-juan") }, ctx),
    await correr("por_comprar", {}, ctx),
    await correr("acreditacion", {}, ctx),
  ];
  for (const r of todo) {
    assert.equal(r.esError, false, r.contenido);
    assert.ok(!/Juan|María|Ana|Pérez|DJVHQQ|XYZ987|LA123|85000|90000/.test(r.contenido), r.contenido);
  }
});

test("agenda, persona y cola de compra usan las reglas de la pantalla", async () => {
  const ctx = contexto();
  const agenda = await correr("agenda", {}, ctx);
  assert.equal(agenda.datos.total, 3, "hoy (2) y mañana (1) en los 7 días; el anulado no cuenta");
  assert.equal(agenda.datos.viajes[0].tiene_reserva, true);
  assert.equal(agenda.datos.viajes[0].compra, "con reserva");
  assert.equal(agenda.datos.viajes[1].hora, "por confirmar");

  const larga = await correr("agenda", { desde: "2026-01-01", hasta: "2026-12-31" }, ctx);
  assert.equal(larga.datos.hasta, "2026-01-31");
  assert.match(larga.datos.aviso, /31 días/);
  assert.equal((await correr("agenda", { desde: "2026-11-10", hasta: "2026-11-01" }, ctx)).esError, true);

  const compra = await correr("por_comprar", {}, ctx);
  assert.equal(compra.datos.sin_cerrar, 1);
  assert.equal(compra.datos.vencidos, 1);
  assert.ok(compra.datos.viajes.some((v: { compra: string }) => v.compra === "vencido sin reserva"));

  assert.equal((await correr("viajes_de_persona", { persona: "P-0000" }, ctx)).esError, true);
});

test("costos solo por mes o ruta, siempre con su cobertura", async () => {
  const ctx = contexto();
  const mes = await correr("costos", { agrupar: "mes" }, ctx);
  assert.ok(mes.datos.cobertura);
  assert.match(mes.datos.aviso, /cobertura|monto registrado/);
  const octubre = mes.datos.grupos.find((g: { mes: string }) => g.mes === "2026-10");
  assert.equal(octubre.total_clp, 90000, "un total por mes sí sale");
  assert.equal((await correr("costos", { agrupar: "persona" }, ctx)).esError, true, "por persona no");
  assert.equal((await correr("costos", { agrupar: "mes", mes: "octubre" }, ctx)).esError, true);
});

test("acreditación con las fechas de cada viaje, y sin exigencias no hay nada que revisar", async () => {
  const ctx = contexto();
  const r = await correr("acreditacion", {}, ctx);
  // Juan tiene el examen al día; María y Ana no lo registraron.
  assert.equal(r.datos.total, 2);
  assert.ok(r.datos.viajes.every((v: { documentos: string[] }) => v.documentos[0] === "Examen médico: sin registrar"));
  const sinTipos = await ejecutarHerramienta("acreditacion", {}, { ...ctx, datos: { ...datos, tipos: [] } });
  assert.match(sinTipos.contenido, /no exige documentos/);
});

test("el historial de un viaje no muestra el código de reserva, el vuelo ni el monto, y tapa nombres en las notas", async () => {
  const historial: HistoryItem[] = [
    {
      id: 1, action: "UPDATE", created_at: "2026-11-10T14:00:00Z", actor: "u1",
      before_data: { date: "2026-11-12", pnr: "", flight: "", amount: null, status: "Planificado", notes: "" },
      after_data: {
        date: "2026-11-12", pnr: "DJVHQQ", flight: "LA123", amount: 85000, status: "Emitido",
        notes: "Motivo del cambio: Emitido por la agencia, avisar a Juan Pérez Soto",
      },
    },
  ];
  const ctx = contexto(historial);
  const r = await correr("historial_de_viaje", { viaje: ctx.seud.viaje("t1") }, ctx);
  assert.equal(r.esError, false);
  assert.ok(!/DJVHQQ|LA123|85|Juan/.test(r.contenido), r.contenido);
  const campos = r.datos.cambios[0].campos;
  assert.deepEqual(campos.find((c: { campo: string }) => c.campo === "Reserva"), { campo: "Reserva", antes: "sin código", despues: "con código" });
  assert.ok(!campos.some((c: { campo: string }) => c.campo === "Vuelo" || c.campo === "Monto"));
});

test("el resumen al abrir sale de las mismas reglas y pone primero lo urgente", () => {
  const r = resumenDeBita({ hoy: HOY, personas, viajes, ventana: 21, tipos: datos.tipos, documentos: datos.documentos });
  assert.deepEqual(r.hoyViajes.map((v) => [v.persona, v.sentido]), [["Juan Pérez Soto", "sube"], ["María José Rojas", "baja"]]);
  assert.equal(r.compra.sinCerrar, 1);
  assert.equal(r.acreditacion.viajes, 2);
  const lineas = lineasDeResumen(r);
  assert.equal(lineas[0].accion, "por_comprar");
  assert.equal(lineas[0].tono, "alerta");
  assert.ok(lineas.some((l) => l.texto === "Hoy 1 sube y 1 baja; mañana 1 sube"));
  assert.equal(movimientosEnTexto([]), "nadie viaja");
});

test("pantalla: saludo, enlaces a viajes solo si el servidor los conoce, y respuestas validadas", () => {
  assert.equal(saludoPara(9), "Buenos días");
  assert.match(presentacion(9, true), /solo muestro este resumen/);
  const trozos = trozosConViajes("Mira V-1a2b y V-ffff.", { "V-1a2b": "t1" });
  assert.deepEqual(trozos, [
    { tipo: "texto", texto: "Mira " },
    { tipo: "viaje", texto: "V-1a2b", id: "t1" },
    { tipo: "texto", texto: " y V-ffff." },
  ]);
  assert.equal(esRespuestaChat({ respuesta: "hola", viajes: {}, restantes: 3, limite: 20 }), true);
  assert.equal(esRespuestaChat({ respuesta: "hola", viajes: { "../x": "t1" }, restantes: 3, limite: 20 }), false);
  assert.equal(esRespuestaCupo({ restantes: null, limite: 20 }), true);
});
