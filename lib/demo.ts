// Datos ficticios del botón "Abrir demostración": permiten recorrer la aplicación
// sin credenciales y sin tocar Supabase. Las fechas salen del mismo motor que
// usa la operación real, así que la demostración no puede mentir sobre ellas.
import { addDays } from "./calendar.ts";
import { movimientos } from "./cycles.ts";
import { localDate, nextWeekday } from "./format.ts";
import type { Person, Trip } from "./types.ts";

// UUID de ejemplo deterministas: el libro demo debe pasar las mismas
// validaciones de identificadores que un libro real, sin usar datos reales.
const idDeEjemplo = (grupo: number, indice: number) =>
  `${grupo.toString(16).padStart(8, "0")}-0000-4000-8000-${indice.toString(16).padStart(12, "0")}`;

export function makeDemoPeople(): Person[] {
  const firstMonday = nextWeekday(localDate(), 1);
  return [
    {
      id: idDeEjemplo(1, 1),
      version: 1,
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
      id: idDeEjemplo(1, 2),
      version: 1,
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
      id: idDeEjemplo(1, 3),
      version: 1,
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
      id: idDeEjemplo(2, index + 1),
      person_id: people[0].id,
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
      id: idDeEjemplo(3, index + 1),
      person_id: people[1].id,
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
      id: idDeEjemplo(4, 1),
      person_id: people[2].id,
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
      id: idDeEjemplo(4, 2),
      person_id: people[2].id,
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
  return [...fourByThree, ...tenByTen, ...manual].map((trip) => ({
    ...trip, planned_date: trip.date, version: 1,
  })).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}
