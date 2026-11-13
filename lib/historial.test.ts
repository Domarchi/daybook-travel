import test from "node:test";
import assert from "node:assert/strict";
import { cambiosDe, notaDelCambio } from "./historial.ts";

const viaje = (extra: Record<string, unknown> = {}) => ({
  id: "v1",
  person_id: "p1",
  date: "2026-09-16",
  direction: "BAJADA",
  origin: "Copiapó",
  destination: "Santiago",
  requested_time: null,
  baggage: "Por confirmar",
  status: "Planificado",
  pnr: "",
  flight: "",
  amount: null,
  notes: "",
  updated_at: "2026-09-07T15:49:00Z",
  ...extra,
});

test("emitir un viaje: aparecen el estado, la reserva y la hora, en el orden del formulario", () => {
  const antes = viaje();
  const despues = viaje({ status: "Emitido", pnr: "YQJKYM", requested_time: "20:41:00", updated_at: "2026-10-01T10:00:00Z" });
  assert.deepEqual(cambiosDe("trips", antes, despues), [
    { campo: "Hora", antes: "—", despues: "20:41" },
    { campo: "Estado", antes: "Planificado", despues: "Emitido" },
    { campo: "Reserva", antes: "—", despues: "YQJKYM" },
  ]);
});

test("mover la fecha y poner el monto se leen como se escriben", () => {
  const cambios = cambiosDe("trips", viaje(), viaje({ date: "2026-09-18", amount: 85990 }));
  assert.equal(cambios.length, 2);
  assert.deepEqual(cambios[0], { campo: "Fecha", antes: "16 sept 2026", despues: "18 sept 2026" });
  assert.equal(cambios[1].campo, "Monto");
  assert.equal(cambios[1].antes, "—");
  assert.match(cambios[1].despues, /85\.990/);
});

test("lo que no se muestra no cuenta como cambio", () => {
  // Solo cambió la fecha de actualización y la versión: no hay nada que decir.
  assert.deepEqual(cambiosDe("trips", viaje(), viaje({ updated_at: "2026-11-01T00:00:00Z", version: 2 })), []);
  // La misma hora con y sin segundos es la misma hora.
  assert.deepEqual(cambiosDe("trips", viaje({ requested_time: "08:30:00" }), viaje({ requested_time: "08:30" })), []);
});

test("un viaje recién creado no tiene antes, así que no hay cambios que listar", () => {
  assert.deepEqual(cambiosDe("trips", null, viaje()), []);
});

test("en una persona se ven el turno, la vigencia, los días y si quedó inactiva", () => {
  const antes = { name: "MARÍA SOTO", origin: "Santiago", destination: "Copiapó", shift: "4×3", start_date: "2026-10-05", end_date: null, up_weekday: 1, down_weekday: 4, baggage: "Maleta de cabina", active: true };
  const despues = { ...antes, origin: "Concepción", down_weekday: 5, end_date: "2026-12-31", active: false };
  assert.deepEqual(cambiosDe("people", antes, despues), [
    { campo: "Origen habitual", antes: "Santiago", despues: "Concepción" },
    { campo: "Vigente hasta", antes: "—", despues: "31 dic 2026" },
    { campo: "Baja los", antes: "jueves", despues: "viernes" },
    { campo: "Estado", antes: "Activa", despues: "Inactiva" },
  ]);
});

test("la nota muestra solo lo que agregó este cambio", () => {
  const antes = viaje({ notes: "Importado desde la planilla." });
  const despues = viaje({ notes: "Importado desde la planilla.\nMotivo del cambio: Solicitud enviada." });
  assert.equal(notaDelCambio(antes, despues), "Motivo del cambio: Solicitud enviada.");
  // Si cambiaron las observaciones, se dicen.
  assert.equal(notaDelCambio(antes, viaje({ notes: "Otra cosa" })), "Observaciones: Otra cosa");
  // Si no cambió, no hay nota que mostrar.
  assert.equal(notaDelCambio(antes, antes), "");
  // Al crear, la nota es la que se escribió.
  assert.equal(notaDelCambio(null, despues), despues.notes);
});

test("en un documento se ve el vencimiento", () => {
  assert.deepEqual(
    cambiosDe("person_documents", { type_id: "t", expires_on: null }, { type_id: "t", expires_on: "2027-03-01" }),
    [{ campo: "Vencimiento", antes: "—", despues: "1 mar 2027" }],
  );
});

test("con las notas nuevas (observaciones y último motivo) se ve el motivo que cambió", () => {
  const antes = viaje({ notes: "Prefiere la tarde.\nMotivo del cambio: Solicitud enviada." });
  const despues = viaje({ notes: "Prefiere la tarde.\nMotivo del cambio: Pasaje emitido" });
  assert.equal(notaDelCambio(antes, despues), "Motivo del cambio: Pasaje emitido");
  // Las notas viejas que acumulaban motivos también se leen bien al pasar al formato nuevo.
  const acumuladas = viaje({ notes: "Prefiere la tarde.\nMotivo del cambio: Uno\nMotivo del cambio: Dos" });
  assert.equal(notaDelCambio(acumuladas, viaje({ notes: "Prefiere la tarde.\nMotivo del cambio: Tres" })), "Motivo del cambio: Tres");
});
