// Viajes que vienen y conviene revisar antes de comprar.
//
// Nada de esto bloquea: son avisos. Cada uno apunta a un error que hoy pasa
// sin que nadie lo note y que después se paga (un pasaje de más, uno que no
// calza, alguien que «En obra» cuenta como arriba cuando ya bajó).
//
//   repetido        dos viajes de la misma persona, el mismo día y el mismo
//                   sentido. La aplicación no deja crearlos, pero el
//                   importador y los datos viejos sí los traen.
//   secuencia       dos subidas seguidas sin una bajada entre medio, o dos
//                   bajadas sin una subida. Se mira con lo registrado, igual
//                   que lib/en-obra.ts: lo anulado y lo no presentado no
//                   cuentan, y lo primero de alguien puede ser una bajada.
//   fuera_de_turno  un viaje planificado que ya no calza con el turno de la
//                   persona: le cambiaron la jornada, los días o la fecha de
//                   inicio, y los viajes generados antes quedaron donde
//                   estaban. Solo se miran los Planificados: uno solicitado o
//                   con reserva ya lo vio alguien, y si se movió fue a
//                   propósito (alguien que bajó antes, un cambio de vuelo).
//
// Solo se avisa de viajes de hoy en adelante: lo pasado se cierra (ver «sin
// cerrar» en lib/purchase.ts), no se revisa. Pero lo pasado sí sirve de
// contexto: si la última vez alguien subió, su próxima subida es un problema.
//
// Sin React ni Supabase.
import { movimientosEntre } from "./cycles.ts";
import { esTurnoRotativo, type Person, type Trip } from "./types.ts";

export type MotivoDeRevision = "repetido" | "secuencia" | "fuera_de_turno";

type Viaje = Pick<Trip, "id" | "person_id" | "date" | "direction" | "status">;
type Persona = Pick<
  Person,
  "id" | "active" | "shift" | "start_date" | "end_date" | "up_weekday" | "down_weekday"
>;

const NO_CUENTAN = ["Anulado", "No presentado"];

/** Cada viaje a revisar, con sus motivos. Los que están bien no aparecen. */
export function viajesARevisar(
  viajes: Viaje[],
  personas: Persona[],
  hoy: string,
): Map<string, MotivoDeRevision[]> {
  const resultado = new Map<string, MotivoDeRevision[]>();
  const anotar = (viaje: Viaje, motivo: MotivoDeRevision) => {
    if (viaje.date < hoy) return;
    const motivos = resultado.get(viaje.id) ?? [];
    if (!motivos.includes(motivo)) resultado.set(viaje.id, [...motivos, motivo]);
  };

  const porPersona = new Map<string, Viaje[]>();
  for (const viaje of viajes) {
    if (NO_CUENTAN.includes(viaje.status)) continue;
    porPersona.set(viaje.person_id, [...(porPersona.get(viaje.person_id) ?? []), viaje]);
  }

  for (const lista of porPersona.values()) {
    // En un mismo día, la subida va antes que la bajada (como en lib/en-obra.ts).
    lista.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.direction === b.direction ? 0 : a.direction === "SUBIDA" ? -1 : 1),
    );

    // Repetidos: se avisa en todos los del grupo, porque no se sabe cuál sobra.
    const grupos = new Map<string, Viaje[]>();
    for (const viaje of lista) {
      const clave = `${viaje.date}|${viaje.direction}`;
      grupos.set(clave, [...(grupos.get(clave) ?? []), viaje]);
    }
    for (const grupo of grupos.values()) {
      if (grupo.length > 1) grupo.forEach((viaje) => anotar(viaje, "repetido"));
    }

    // Secuencia: un repetido no cuenta dos veces, ya tiene su propio aviso.
    let anterior: Viaje | null = null;
    for (const viaje of lista) {
      if (anterior && anterior.date === viaje.date && anterior.direction === viaje.direction) continue;
      if (anterior && anterior.direction === viaje.direction) anotar(viaje, "secuencia");
      anterior = viaje;
    }
  }

  // Fuera de turno.
  const futurosPlanificados = viajes.filter(
    (viaje) => viaje.status === "Planificado" && viaje.date >= hoy,
  );
  const ultimoDia = futurosPlanificados.reduce((max, viaje) => (viaje.date > max ? viaje.date : max), hoy);
  for (const persona of personas) {
    if (!persona.active || !esTurnoRotativo(persona.shift)) continue;
    const suyos = futurosPlanificados.filter((viaje) => viaje.person_id === persona.id);
    if (!suyos.length) continue;
    let turno: Set<string>;
    try {
      turno = new Set(
        movimientosEntre(persona, hoy, ultimoDia).map((paso) => `${paso.date}|${paso.direction}`),
      );
    } catch {
      // Una ficha con días imposibles: Planificar turnos ya lo dice al usarla.
      continue;
    }
    for (const viaje of suyos) {
      if (!turno.has(`${viaje.date}|${viaje.direction}`)) anotar(viaje, "fuera_de_turno");
    }
  }

  return resultado;
}

/** El aviso, escrito para leer en la fila del viaje. */
export function textoDeRevision(motivo: MotivoDeRevision, direction: string) {
  if (motivo === "repetido") return "Repetido: hay otro igual ese día";
  if (motivo === "fuera_de_turno") return "No calza con su turno";
  return direction === "SUBIDA" ? "Sube sin haber bajado" : "Baja sin haber subido";
}
