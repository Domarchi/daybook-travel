// La lista para el campamento: quién llega, quién sale y cuántos duermen cada
// noche, con los traslados entre el aeropuerto y el campamento.
//
// El hospedaje es fijo (el campamento de la obra), así que no se reserva cama
// por cama: sale de los viajes. Quien llegó y todavía no baja duerme ahí. Es la
// misma cuenta que «En obra» de la Agenda (lib/en-obra.ts), así que la lista y
// la pantalla no pueden discrepar.
//
//   - Solo cuentan los tramos que tocan la ciudad de la obra: una subida que
//     llega a Copiapó o una bajada que sale de Copiapó. Una conexión
//     Concepción → Santiago no es una llegada al campamento.
//   - El traslado se agrupa por vuelo: una camioneta va a buscar a todos los
//     del mismo vuelo. La hora es la que tiene el viaje registrado.
//   - Un viaje sin código de reserva igual se lista (el campamento necesita
//     saberlo con tiempo), pero dice «sin pasaje aún».
//   - Quien figura en obra hace más de DIAS_SIN_BAJADA días sin bajada
//     registrada se avisa aparte: los turnos son 4×3 o 10×10, así que casi
//     seguro falta cargar una bajada, y la cifra de camas sale inflada.
//
// Sin React ni Supabase.
import { addDays } from "./calendar.ts";
import { enObra } from "./en-obra.ts";
import { normalize } from "./format.ts";
import type { Person, Trip } from "./types.ts";

export const CIUDAD_DE_LA_OBRA = "Copiapó";
export const DIAS_SIN_BAJADA = 20;

export type PasajeroDeTraslado = { nombre: string; sinPasaje: boolean };

export type Traslado = {
  vuelo: string | null;
  hora: string | null;
  /** La otra punta del vuelo: de dónde llega o adónde va. */
  ciudad: string;
  pasajeros: PasajeroDeTraslado[];
};

export type DiaDeCampamento = {
  fecha: string;
  llegan: Traslado[];
  salen: Traslado[];
  /** Cuántas personas duermen en el campamento la noche de ese día. */
  pernoctan: number;
};

export type SinBajada = { nombre: string; subio: string | null };

export type Campamento = {
  desde: string;
  hasta: string;
  dias: DiaDeCampamento[];
  sinBajada: SinBajada[];
};

type Viaje = Pick<
  Trip,
  "person_id" | "date" | "direction" | "origin" | "destination" | "requested_time" | "status" | "pnr" | "flight"
>;
type Persona = Pick<Person, "id" | "active" | "end_date">;

const esDeLaObra = (ciudad: string) => normalize(ciudad) === normalize(CIUDAD_DE_LA_OBRA);
const cuenta = (v: Viaje) => v.status !== "Anulado" && v.status !== "No presentado";
const llegaALaObra = (v: Viaje) => v.direction === "SUBIDA" && esDeLaObra(v.destination);
const saleDeLaObra = (v: Viaje) => v.direction === "BAJADA" && esDeLaObra(v.origin);

const comparar = (a: string, b: string) => a.localeCompare(b, "es-CL", { sensitivity: "base" });
// Lo que no tiene hora va al final, no primero ("" < "08:00").
const porHora = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a.localeCompare(b);

function agruparTraslados(
  viajes: Viaje[],
  ciudadDe: (v: Viaje) => string,
  nombreDe: (id: string) => string,
): Traslado[] {
  const grupos = new Map<string, Traslado>();
  for (const v of viajes) {
    const vuelo = v.flight?.trim() || null;
    const hora = v.requested_time ? v.requested_time.slice(0, 5) : null;
    const ciudad = ciudadDe(v);
    const clave = [vuelo ?? "", hora ?? "", normalize(ciudad)].join("|");
    let grupo = grupos.get(clave);
    if (!grupo) {
      grupo = { vuelo, hora, ciudad, pasajeros: [] };
      grupos.set(clave, grupo);
    }
    grupo.pasajeros.push({ nombre: nombreDe(v.person_id), sinPasaje: !v.pnr?.trim() });
  }
  const lista = [...grupos.values()];
  for (const g of lista) g.pasajeros.sort((a, b) => comparar(a.nombre, b.nombre));
  return lista.sort(
    (a, b) => porHora(a.hora, b.hora) || comparar(a.vuelo ?? "", b.vuelo ?? "") || comparar(a.ciudad, b.ciudad),
  );
}

export function armarCampamento({
  viajes,
  personas,
  desde,
  dias,
  nombreDe,
}: {
  viajes: Viaje[];
  personas: Persona[];
  desde: string;
  dias: number;
  nombreDe: (id: string) => string;
}): Campamento {
  const deLaObra = viajes.filter((v) => cuenta(v) && (llegaALaObra(v) || saleDeLaObra(v)));
  const personaPorId = new Map(personas.map((p) => [p.id, p]));
  // Una ficha inactiva o con la vigencia vencida no ocupa cama, aunque su
  // último viaje registrado sea una subida.
  const vigente = (id: string, fecha: string) => {
    const p = personaPorId.get(id);
    return Boolean(p && p.active && (!p.end_date || p.end_date >= fecha));
  };

  const resultado: DiaDeCampamento[] = [];
  for (let i = 0; i < dias; i++) {
    const fecha = addDays(desde, i);
    const delDia = deLaObra.filter((v) => v.date === fecha);
    resultado.push({
      fecha,
      llegan: agruparTraslados(delDia.filter(llegaALaObra), (v) => v.origin, nombreDe),
      salen: agruparTraslados(delDia.filter(saleDeLaObra), (v) => v.destination, nombreDe),
      pernoctan: enObra(deLaObra, fecha).filter(
        (e) => e.estado !== "baja" && vigente(e.person_id, fecha),
      ).length,
    });
  }

  // Quienes duermen la primera noche y llevan demasiados días sin bajada.
  const limite = addDays(desde, -DIAS_SIN_BAJADA);
  const sinBajada: SinBajada[] = [];
  for (const e of enObra(deLaObra, desde)) {
    if (e.estado !== "en obra" || !vigente(e.person_id, desde)) continue;
    const subidas = deLaObra
      .filter((v) => v.person_id === e.person_id && v.date < desde && llegaALaObra(v))
      .map((v) => v.date)
      .sort();
    const subio = subidas.at(-1) ?? null;
    // Sin subida registrada antes es el caso «ya estaba» de en-obra.ts: su
    // primer viaje es una bajada que viene, y eso no es un error.
    if (subio && subio < limite) sinBajada.push({ nombre: nombreDe(e.person_id), subio });
  }
  sinBajada.sort((a, b) => comparar(a.nombre, b.nombre));

  return { desde, hasta: addDays(desde, dias - 1), dias: resultado, sinBajada };
}

// ---------------------------------------------------------------------------
// El texto que se manda al campamento.

const fechaLarga = (fecha: string) =>
  new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  })
    .format(new Date(fecha + "T12:00:00Z"))
    .replace(",", "")
    .toLocaleUpperCase("es-CL");

export const fechaCorta = (fecha: string) =>
  new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(fecha + "T12:00:00Z"));

// «del 17 al 23 de noviembre de 2026»; si cambia el mes o el año, se escribe entero.
export function rangoDeFechas(desde: string, hasta: string) {
  if (desde.slice(0, 7) === hasta.slice(0, 7)) {
    return `del ${Number(desde.slice(8))} al ${fechaCorta(hasta)}`;
  }
  if (desde.slice(0, 4) === hasta.slice(0, 4)) {
    return `del ${fechaCorta(desde).replace(/ de \d{4}$/, "")} al ${fechaCorta(hasta)}`;
  }
  return `del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const personasEn = (traslados: Traslado[]) =>
  traslados.reduce((suma, t) => suma + t.pasajeros.length, 0);

export const cabeceraDeTraslado = (t: Traslado, sentido: "llega" | "sale") =>
  [
    t.vuelo ? `Vuelo ${t.vuelo}` : "Vuelo por confirmar",
    t.hora ?? "hora por confirmar",
    sentido === "llega" ? `desde ${t.ciudad}` : `a ${t.ciudad}`,
  ].join(" · ");

export const totalesDeCampamento = (c: Campamento) => ({
  llegadas: c.dias.reduce((s, d) => s + personasEn(d.llegan), 0),
  salidas: c.dias.reduce((s, d) => s + personasEn(d.salen), 0),
  traslados: c.dias.reduce((s, d) => s + d.llegan.length + d.salen.length, 0),
});

export function textoDeCampamento(c: Campamento, hoy: string): string {
  const lineas: string[] = [
    "CAMPAMENTO — Daybook Travel",
    `Llegadas, salidas y traslados ${rangoDeFechas(c.desde, c.hasta)}`,
    `Generada el ${fechaCorta(hoy)}`,
  ];

  const bloque = (titulo: string, traslados: Traslado[], sentido: "llega" | "sale") => {
    lineas.push(`${titulo} (${personasEn(traslados)})`);
    for (const t of traslados) {
      lineas.push(`  ${cabeceraDeTraslado(t, sentido)}`);
      t.pasajeros.forEach((p, i) =>
        lineas.push(`    ${i + 1}. ${p.nombre}${p.sinPasaje ? " (sin pasaje aún)" : ""}`),
      );
    }
  };

  for (const dia of c.dias) {
    lineas.push("", fechaLarga(dia.fecha));
    if (dia.llegan.length === 0 && dia.salen.length === 0) lineas.push("Sin llegadas ni salidas.");
    if (dia.llegan.length) bloque("Llegan — traslado aeropuerto → campamento", dia.llegan, "llega");
    if (dia.salen.length) bloque("Salen — traslado campamento → aeropuerto", dia.salen, "sale");
    lineas.push(`Duermen en el campamento: ${plural(dia.pernoctan, "persona", "personas")}`);
  }

  if (c.sinBajada.length) {
    lineas.push("", "POR CONFIRMAR");
    lineas.push(`Figuran en obra hace más de ${DIAS_SIN_BAJADA} días, sin bajada registrada:`);
    for (const s of c.sinBajada) lineas.push(`  - ${s.nombre} (subió el ${fechaCorta(s.subio ?? c.desde)})`);
  }

  const t = totalesDeCampamento(c);
  lineas.push(
    "",
    `Total: ${plural(t.llegadas, "llegada", "llegadas")} y ${plural(t.salidas, "salida", "salidas")} en ${plural(t.traslados, "traslado", "traslados")}.`,
  );
  return lineas.join("\n");
}
