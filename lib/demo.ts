// Datos ficticios del botón "Abrir demostración": permiten recorrer la aplicación
// sin credenciales y sin tocar Supabase. Las fechas salen del mismo motor que
// usa la operación real, así que la demostración no puede mentir sobre ellas.
import { addDays } from "./calendar.ts";
import { movimientos } from "./cycles.ts";
import { localDate, nextWeekday } from "./format.ts";
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
  return [...fourByThree, ...tenByTen].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}
