// Datos ficticios del botón "Abrir demostración": permiten recorrer la aplicación
// sin credenciales y sin tocar Supabase. Las fechas salen del mismo motor que
// usa la operación real, así que la demostración no puede mentir sobre ellas.
import { addDays } from "./calendar.ts";
import { movimientos } from "./cycles.ts";
import { localDate, nextWeekday } from "./format.ts";
import type { DocumentoDePersona, TipoDeDocumento } from "./accreditation.ts";
import type { Person, Trip } from "./types.ts";

export function makeDemoPeople(): Person[] {
  const firstMonday = nextWeekday(localDate(), 1);
  return [
    {
      id: "p1",
      name: "Persona de ejemplo 1",
      origin: "Santiago",
      destination: "Copiapó",
      shift: "4×3",
      start_date: firstMonday,
      end_date: null,
      up_weekday: 1,
      down_weekday: 4,
      baggage: "Mochila",
      active: true,
    },
    {
      id: "p2",
      name: "Persona de ejemplo 2",
      origin: "Concepción",
      destination: "Copiapó",
      shift: "10×10",
      start_date: firstMonday,
      end_date: null,
      baggage: "Maleta en bodega",
      active: true,
    },
    {
      id: "p3",
      name: "Jefatura de ejemplo",
      origin: "Santiago",
      destination: "Copiapó",
      shift: "Sin turno",
      start_date: localDate(),
      end_date: null,
      baggage: "Maleta de cabina",
      active: true,
    },
  ];
}

export function makeDemoTrips(people: Person[]): Trip[] {
  const firstMonday = people[0].start_date;
  const fourByThree = movimientos(people[0], addDays(firstMonday, 35)).map(
    (row, index) => ({
      id: "t" + index,
      person_id: "p1",
      ...row,
      origin: row.direction === "SUBIDA" ? "Santiago" : "Copiapó",
      destination: row.direction === "SUBIDA" ? "Copiapó" : "Santiago",
      requested_time: index === 0 ? "08:30" : null,
      baggage: "Mochila",
      status:
        index === 0 ? "Solicitado" : index === 1 ? "Emitido" : "Planificado",
      pnr: index === 1 ? "DEMO01" : "",
      flight: index === 1 ? "LA 112" : "",
      amount: index === 1 ? 84990 : null,
      notes: "",
    }),
  );
  // El 10×10 tambien sale del motor: antes eran dos viajes escritos a mano.
  const tenByTen: Trip[] = movimientos(people[1], addDays(firstMonday, 35)).map(
    (row, index) => ({
      id: "t-10x10-" + index,
      person_id: "p2",
      ...row,
      origin: row.direction === "SUBIDA" ? "Concepción" : "Copiapó",
      destination: row.direction === "SUBIDA" ? "Copiapó" : "Concepción",
      requested_time: index === 0 ? "09:00" : index === 1 ? "17:00" : null,
      baggage: "Maleta en bodega",
      status: "Planificado",
      pnr: "",
      flight: "",
      amount: null,
      notes: "",
    }),
  );
  // La jefatura no tiene ciclo: sus dos movimientos se cargan manualmente.
  const manual: Trip[] = [
    {
      id: "t-manual-up",
      person_id: "p3",
      date: addDays(firstMonday, 2),
      direction: "SUBIDA",
      origin: "Santiago",
      destination: "Copiapó",
      requested_time: "10:15",
      baggage: "Maleta de cabina",
      status: "Planificado",
      pnr: "",
      flight: "",
      amount: null,
      notes: "Visita mensual de jefatura",
    },
    {
      id: "t-manual-down",
      person_id: "p3",
      date: addDays(firstMonday, 4),
      direction: "BAJADA",
      origin: "Copiapó",
      destination: "Santiago",
      requested_time: "18:30",
      baggage: "Maleta de cabina",
      status: "Planificado",
      pnr: "",
      flight: "",
      amount: null,
      notes: "Regreso de visita mensual",
    },
  ];
  return [...fourByThree, ...tenByTen, ...manual].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

// Documentos de la demostración: uno vigente, uno vencido y uno sin registrar,
// para que el manifiesto muestre de verdad cómo se ve cada caso.
export function makeDemoDocumentTypes(): TipoDeDocumento[] {
  return [
    { id: "d-cedula", name: "Cédula de identidad", active: true },
    { id: "d-medico", name: "Examen médico", active: true },
    { id: "d-induccion", name: "Inducción de seguridad", active: true },
  ];
}

export function makeDemoDocuments(
  people: Person[],
  tipos: TipoDeDocumento[],
): DocumentoDePersona[] {
  const hoy = localDate();
  const lejos = addDays(hoy, 400);
  const [cedula, medico, induccion] = tipos;
  return [
    // La persona 1 está al día.
    { person_id: people[0].id, type_id: cedula.id, expires_on: lejos },
    { person_id: people[0].id, type_id: medico.id, expires_on: lejos },
    { person_id: people[0].id, type_id: induccion.id, expires_on: lejos },
    // La persona 2 tiene el examen médico vencido.
    { person_id: people[1].id, type_id: cedula.id, expires_on: lejos },
    { person_id: people[1].id, type_id: medico.id, expires_on: addDays(hoy, -20) },
    { person_id: people[1].id, type_id: induccion.id, expires_on: lejos },
    // La jefatura no tiene registrada la inducción.
    { person_id: people[2].id, type_id: cedula.id, expires_on: lejos },
    { person_id: people[2].id, type_id: medico.id, expires_on: lejos },
  ];
}
