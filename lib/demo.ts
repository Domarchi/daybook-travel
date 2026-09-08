// Datos ficticios del botón "Abrir demostración": permiten recorrer la aplicación
// sin credenciales y sin tocar Supabase. Ojo: este camino usa `pulseDates` de
// TypeScript, mientras que la operación real genera el 4×3 con `generate_pulse` en SQL.
import { addDays, pulseDates } from "./calendar.ts";
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
  const fourByThree = pulseDates(firstMonday, addDays(firstMonday, 35)).map(
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
  const tenByTen: Trip[] = [
    {
      id: "t-10x10-up",
      person_id: "p2",
      date: firstMonday,
      direction: "SUBIDA",
      origin: "Concepción",
      destination: "Copiapó",
      requested_time: "09:00",
      baggage: "Maleta en bodega",
      status: "Planificado",
      pnr: "",
      flight: "",
      amount: null,
      notes: "",
    },
    {
      id: "t-10x10-down",
      person_id: "p2",
      date: addDays(firstMonday, 10),
      direction: "BAJADA",
      origin: "Copiapó",
      destination: "Concepción",
      requested_time: "17:00",
      baggage: "Maleta en bodega",
      status: "Planificado",
      pnr: "",
      flight: "",
      amount: null,
      notes: "",
    },
  ];
  return [...fourByThree, ...tenByTen].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}
