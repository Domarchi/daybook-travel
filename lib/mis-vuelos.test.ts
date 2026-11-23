import test from "node:test";
import assert from "node:assert/strict";
import {
  enlaceDeWhatsapp,
  enlacesDeCalendario,
  estadoParaTrabajador,
  fechaParaTrabajador,
  leerMisVuelos,
  mensajeDeCodigo,
  separarViajes,
} from "./mis-vuelos.ts";

const crudo = {
  ok: true,
  hoy: "2026-11-23",
  calendario: "a".repeat(64),
  persona: { nombre: "Persona de ejemplo", origen: "Santiago", destino: "Copiapó", turno: "4×3", tiene_correo: true, tiene_telefono: false },
  viajes: [
    { id: "1", fecha: "2026-11-10", sentido: "BAJADA", origen: "Copiapó", destino: "Santiago", hora: null, estado: "Completado", reserva: "OLD111", vuelo: "LA 1", equipaje: "Mochila" },
    { id: "2", fecha: "2026-11-23", sentido: "SUBIDA", origen: "Santiago", destino: "Copiapó", hora: "08:30", estado: "Emitido", reserva: " ABC123 ", vuelo: "LA 340", equipaje: "Mochila" },
    { id: "3", fecha: "2026-11-27", sentido: "BAJADA", origen: "Copiapó", destino: "Santiago", hora: "", estado: "Planificado", reserva: "", vuelo: "", equipaje: "Mochila" },
  ],
};

test("lee los vuelos de la base y descarta lo que no tiene forma", () => {
  const datos = leerMisVuelos(crudo);
  assert.ok(datos);
  assert.equal(datos.persona.nombre, "Persona de ejemplo");
  assert.equal(datos.persona.tieneCorreo, true);
  assert.equal(datos.persona.tieneTelefono, false);
  assert.equal(datos.calendario, "a".repeat(64));
  assert.equal(datos.viajes[1].reserva, "ABC123", "sin espacios sobrantes");
  assert.equal(datos.viajes[2].hora, null, "hora vacía es sin hora");
  // Sesión vencida o revocada: hay que volver a entrar.
  assert.equal(leerMisVuelos({ ok: false, motivo: "sesion" }), null);
  assert.throws(() => leerMisVuelos({ ok: true }), /forma inesperada/);
  assert.throws(() => leerMisVuelos({ ...crudo, viajes: [{ fecha: "mañana" }] }), /fecha válida/);
});

test("el estado se dice como le importa a quien viaja", () => {
  assert.deepEqual(estadoParaTrabajador({ estado: "Emitido", reserva: "ABC123" }), { etiqueta: "Pasaje listo", tono: "listo" });
  assert.deepEqual(estadoParaTrabajador({ estado: "Solicitado", reserva: "ABC123" }), { etiqueta: "Pasaje listo", tono: "listo" });
  assert.deepEqual(estadoParaTrabajador({ estado: "Solicitado", reserva: "" }), { etiqueta: "Pasaje por confirmar", tono: "pendiente" });
  assert.deepEqual(estadoParaTrabajador({ estado: "Planificado", reserva: "" }), { etiqueta: "Pasaje por confirmar", tono: "pendiente" });
  assert.deepEqual(estadoParaTrabajador({ estado: "Completado", reserva: "X" }), { etiqueta: "Volado", tono: "pasado" });
  assert.deepEqual(estadoParaTrabajador({ estado: "No presentado", reserva: "X" }), { etiqueta: "No presentado", tono: "problema" });
});

test("hoy cuenta como próximo; los anteriores van del más reciente al más viejo", () => {
  const datos = leerMisVuelos(crudo)!;
  const { proximos, anteriores } = separarViajes(
    [...datos.viajes, { ...datos.viajes[0], id: "0", fecha: "2026-11-01" }].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    datos.hoy,
  );
  assert.deepEqual(proximos.map((v) => v.id), ["2", "3"]);
  assert.deepEqual(anteriores.map((v) => v.id), ["1", "0"]);
});

test("la fecha se lee larga, con hoy y mañana", () => {
  assert.equal(fechaParaTrabajador("2026-11-23", "2026-11-23"), "Hoy, lunes 23 de noviembre");
  assert.equal(fechaParaTrabajador("2026-11-24", "2026-11-23"), "Mañana, martes 24 de noviembre");
  assert.equal(fechaParaTrabajador("2026-11-27", "2026-11-23"), "Viernes 27 de noviembre");
});

test("enlaces del calendario y del mensaje de WhatsApp", () => {
  const llave = "b".repeat(64);
  assert.deepEqual(enlacesDeCalendario("https://relevo-chi.vercel.app/", llave), {
    https: `https://relevo-chi.vercel.app/api/mis-vuelos/calendario/${llave}`,
    webcal: `webcal://relevo-chi.vercel.app/api/mis-vuelos/calendario/${llave}`,
  });
  const mensaje = mensajeDeCodigo("Persona de ejemplo", "4821", "https://relevo-chi.vercel.app/mis-vuelos");
  assert.match(mensaje, /^Hola Persona,/);
  assert.match(mensaje, /código: 4821/);
  assert.match(mensaje, /relevo-chi\.vercel\.app\/mis-vuelos con tu RUT/);
  const enlace = enlaceDeWhatsapp("+56912345678", mensaje);
  assert.ok(enlace.startsWith("https://wa.me/56912345678?text="));
  assert.equal(decodeURIComponent(enlace.split("text=")[1]), mensaje);
  // Sin teléfono, WhatsApp abre para elegir a quién mandarlo.
  assert.ok(enlaceDeWhatsapp(null, "x").startsWith("https://wa.me/?text="));
});

test("la demostración arma lo mismo que la base: sin anulados ni viajes de hace más de 60 días", async () => {
  const { misVuelosDesdeFicha } = await import("./mis-vuelos.ts");
  const base = { origin: "Santiago", destination: "Copiapó", requested_time: null, pnr: "", flight: "", baggage: "Mochila", direction: "SUBIDA" };
  const datos = misVuelosDesdeFicha(
    { name: "Persona de ejemplo", origin: "Santiago", destination: "Copiapó", phone: "+56911111111" },
    [
      { ...base, id: "b", date: "2026-11-30", status: "Planificado" },
      { ...base, id: "a", date: "2026-11-24", status: "Emitido", pnr: " ABC123 ", requested_time: "08:30:00" },
      { ...base, id: "x", date: "2026-11-25", status: "Anulado" },
      { ...base, id: "viejo", date: "2026-09-01", status: "Completado", pnr: "OLD" },
    ],
    "2026-11-23",
  );
  assert.deepEqual(datos.viajes.map((v) => v.id), ["a", "b"]);
  assert.equal(datos.viajes[0].hora, "08:30");
  assert.equal(datos.viajes[0].reserva, "ABC123");
  assert.equal(datos.persona.tieneTelefono, true);
  assert.equal(datos.persona.tieneCorreo, false);
});

test("sin señal lo dice; cualquier otro error, el texto por omisión", async () => {
  const { mensajeDeFalla } = await import("./mis-vuelos.ts");
  assert.equal(mensajeDeFalla(new TypeError("Failed to fetch"), "x"), "Sin conexión. Revisa la señal e intenta de nuevo.");
  assert.equal(mensajeDeFalla({ message: "permission denied for function worker_trips", code: "42501" }, "No se pudo."), "No se pudo.");
  assert.equal(mensajeDeFalla(null, "No se pudo."), "No se pudo.");
});
