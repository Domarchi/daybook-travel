// Fechas y textos que se muestran en pantalla. Todo lo que decide "qué día es hoy"
// usa la zona de Santiago; las fechas guardadas son cadenas AAAA-MM-DD sin hora.
import { addDays } from "./calendar.ts";

export const localDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());

export const formatDate = (date: string) =>
  new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));

export const formatDateTime = (date: string) =>
  new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));

export const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CL")
    .trim();

// Genera los nombres de clase que colorean los estados en globals.css
// (status-planificado, status-no-presentado, …). Cambiar `normalize` los cambia.
export const statusClass = (status: string) =>
  "status-" + normalize(status).replaceAll(" ", "-");

export function nextWeekday(date: string, weekday: number) {
  const current = new Date(date + "T12:00:00Z").getUTCDay();
  return addDays(date, (weekday - current + 7) % 7);
}
