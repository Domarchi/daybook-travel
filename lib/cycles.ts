// El motor de ciclos: dada una persona y una fecha tope, dice qué días sube y
// qué días baja. Es la única fuente de esas fechas en todo el sistema.
//
// Antes había dos calendarios que hacían esto por separado: `pulseDates` en
// TypeScript (solo demostración) y `generate_pulse` en SQL (operación real).
// Los dos tenían lunes y jueves grabados a fuego, exigían que la persona
// empezara un lunes, y ninguno sabía generar el 10×10.
//
// Las dos jornadas, en una línea cada una:
//
//   4×3    Semanal. Sube un día de la semana y baja otro, todas las semanas.
//          Los días viven en la ficha de cada persona (por omisión lunes y
//          jueves, que es lo que la obra usa hoy).
//
//   10×10  Ciclo de veinte días. Sube en su fecha de inicio, baja diez días
//          después, vuelve a subir a los veinte, y así. No hay grupos A y B:
//          dos personas cuyas fechas de inicio están desfasadas diez días
//          quedan cruzadas solas, que es lo que el relevo significa.
//
// Ninguna función de este archivo toca la red ni el reloj: mismas entradas,
// mismas salidas, siempre. Por eso se puede probar de verdad.
import { addDays } from "./calendar.ts";

export type Jornada = "4×3" | "10×10";
export type Sentido = "SUBIDA" | "BAJADA";

export type Movimiento = { date: string; direction: Sentido };

export type CicloPersona = {
  /** Jornada de la persona. */
  shift: Jornada;
  /**
   * Inicio de vigencia. En 10×10 es además el primer día de subida.
   * En 4×3 no necesita caer en ningún día en particular: la primera subida es
   * el primer `up_weekday` que llega en esa fecha o después.
   */
  start_date: string;
  /** Fin de vigencia, si lo tiene. Ningún movimiento se genera después. */
  end_date?: string | null;
  /** Día de subida, 1 = lunes … 7 = domingo. Solo se usa en 4×3. */
  up_weekday?: number | null;
  /** Día de bajada, 1 = lunes … 7 = domingo. Solo se usa en 4×3. */
  down_weekday?: number | null;
};

export const SUBIDA_POR_OMISION = 1; // lunes
export const BAJADA_POR_OMISION = 4; // jueves

export const DIAS_SEMANA = [
  { valor: 1, nombre: "Lunes" },
  { valor: 2, nombre: "Martes" },
  { valor: 3, nombre: "Miércoles" },
  { valor: 4, nombre: "Jueves" },
  { valor: 5, nombre: "Viernes" },
  { valor: 6, nombre: "Sábado" },
  { valor: 7, nombre: "Domingo" },
] as const;

/** Tope de seguridad: nadie planifica más allá de dos años. */
const HORIZONTE_MAXIMO_DIAS = 366 * 2;
/** Tope de seguridad para no colgar el navegador si algo se descuadra. */
const MAXIMO_MOVIMIENTOS = 2000;

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Día de la semana en la norma ISO: 1 = lunes … 7 = domingo. */
export function diaSemana(fecha: string) {
  const dia = new Date(fecha + "T12:00:00Z").getUTCDay();
  return dia === 0 ? 7 : dia;
}

/** Días entre dos fechas, sin importar la hora ni el cambio de horario. */
export function diasEntre(desde: string, hasta: string) {
  const a = Date.parse(desde + "T12:00:00Z");
  const b = Date.parse(hasta + "T12:00:00Z");
  return Math.round((b - a) / 86400000);
}

/** La primera fecha en `desde` o después que cae en el día pedido. */
function primerDia(desde: string, dia: number) {
  return addDays(desde, (dia - diaSemana(desde) + 7) % 7);
}

function normalizarDia(valor: number | null | undefined, porOmision: number) {
  if (valor === null || valor === undefined) return porOmision;
  if (!Number.isInteger(valor) || valor < 1 || valor > 7) {
    throw new Error("Los días de viaje van de 1 (lunes) a 7 (domingo).");
  }
  return valor;
}

/**
 * Los movimientos de una persona desde su fecha de inicio hasta `hasta`.
 * Devuelve las fechas ordenadas, sin repetir, cortadas por el fin de vigencia.
 */
export function movimientos(persona: CicloPersona, hasta: string): Movimiento[] {
  const { shift, start_date: inicio } = persona;

  if (!ES_FECHA.test(inicio) || !ES_FECHA.test(hasta)) {
    throw new Error("Revisa el período.");
  }
  if (hasta < inicio) return [];
  if (diasEntre(inicio, hasta) > HORIZONTE_MAXIMO_DIAS) {
    throw new Error("El período debe ser de hasta dos años.");
  }

  const fin =
    persona.end_date && persona.end_date < hasta ? persona.end_date : hasta;
  if (fin < inicio) return [];

  const salida: Movimiento[] = [];
  const anotar = (date: string, direction: Sentido) => {
    if (date < inicio || date > fin) return;
    salida.push({ date, direction });
    if (salida.length > MAXIMO_MOVIMIENTOS) {
      throw new Error("Selecciona un período menor.");
    }
  };

  if (shift === "4×3") {
    const sube = normalizarDia(persona.up_weekday, SUBIDA_POR_OMISION);
    const baja = normalizarDia(persona.down_weekday, BAJADA_POR_OMISION);
    if (sube === baja) {
      throw new Error("La subida y la bajada no pueden ser el mismo día.");
    }
    // Cuántos días después de subir toca bajar. Si el día de bajada cae antes
    // en la semana que el de subida, la bajada es de la semana siguiente.
    const largo = (baja - sube + 7) % 7;

    for (let dia = primerDia(inicio, sube); dia <= fin; dia = addDays(dia, 7)) {
      anotar(dia, "SUBIDA");
      anotar(addDays(dia, largo), "BAJADA");
    }
    // La bajada del último ciclo puede haber quedado fuera del bucle si su
    // subida cayó dentro del período pero ella no: el corte de `anotar` ya lo
    // resolvió. Queda ordenar, porque bajada y subida se intercalan.
    salida.sort(
      (a, b) => a.date.localeCompare(b.date) || (a.direction === "SUBIDA" ? -1 : 1),
    );
    return salida;
  }

  if (shift === "10×10") {
    let sentido: Sentido = "SUBIDA";
    for (let dia = inicio; dia <= fin; dia = addDays(dia, 10)) {
      anotar(dia, sentido);
      sentido = sentido === "SUBIDA" ? "BAJADA" : "SUBIDA";
    }
    return salida;
  }

  throw new Error(`Jornada desconocida: ${shift}`);
}
