// Los costos: cuánto se gastó, en qué rutas, y si una tarifa nueva está fuera
// de lo normal.
//
// Dos decisiones que conviene tener presentes al leer esto:
//
//   El monto es POR PASAJERO. Dos personas en la misma reserva son dos montos
//   que se suman. Lo confirmó la obra; el Excel de la agencia repite el valor
//   en cada fila y esa fila es una persona.
//
//   Todo total viene con su COBERTURA: cuántos de los viajes que abarca tienen
//   monto registrado. Un total que cubre 3 de 41 viajes no es "el gasto": es
//   una muestra, y decirlo es la diferencia entre un dato y un engaño.
//
// El precio de referencia de una ruta es la MEDIANA de lo pagado, no el
// promedio: reduce el efecto de tarifas extremas. Puede cambiar entre compras,
// especialmente si la ruta tiene pocos registros.
import type { Trip } from "./types.ts";

export type ViajeConCosto = Pick<
  Trip,
  "date" | "origin" | "destination" | "amount" | "status" | "person_id"
> & { pnr?: string | null };

export type RegistroCosto = "registrado" | "reserva-sin-monto" | "planificado-sin-monto" | "excluido";

/** La falta de precio en un plan no demuestra que haya un gasto realizado. */
export function registroDeCosto(trip: ViajeConCosto): RegistroCosto {
  if (!cuentaParaCostos(trip)) return "excluido";
  if (montoDe(trip) !== null) return "registrado";
  if (trip.pnr?.trim() || ["Emitido", "Completado", "No presentado"].includes(trip.status)) {
    return "reserva-sin-monto";
  }
  return "planificado-sin-monto";
}

export const rutaDe = (trip: Pick<Trip, "origin" | "destination">) =>
  `${trip.origin} → ${trip.destination}`;

/** El mes al que pertenece una fecha, como AAAA-MM. */
export const mesDe = (fecha: string) => fecha.slice(0, 7);

/** Los anulados se excluyen del informe y de su cobertura; no modela devoluciones. */
export const cuentaParaCostos = (trip: Pick<Trip, "status">) =>
  trip.status !== "Anulado";

const montoDe = (trip: Pick<Trip, "amount">) =>
  trip.amount === null || trip.amount === undefined
    ? null
    : Number(trip.amount);

/** La mediana de una lista. Devuelve null si no hay nada que medir. */
export function mediana(valores: number[]): number | null {
  const limpios = valores.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!limpios.length) return null;
  const medio = Math.floor(limpios.length / 2);
  return limpios.length % 2
    ? limpios[medio]
    : Math.round((limpios[medio - 1] + limpios[medio]) / 2);
}

export type Cobertura = {
  /** Viajes que cuentan (todos menos los anulados). */
  viajes: number;
  /** De esos, cuántos tienen monto registrado. */
  conMonto: number;
  /** Entre 0 y 1. Null si no hay viajes que cubrir. */
  proporcion: number | null;
};

export function cobertura(trips: ViajeConCosto[]): Cobertura {
  const cuentan = trips.filter(cuentaParaCostos);
  const conMonto = cuentan.filter((t) => montoDe(t) !== null).length;
  return {
    viajes: cuentan.length,
    conMonto,
    proporcion: cuentan.length ? conMonto / cuentan.length : null,
  };
}

export type Grupo = {
  clave: string;
  viajes: number;
  conMonto: number;
  total: number;
  /** Mediana de lo pagado en el grupo. Null si nadie registró monto. */
  referencia: number | null;
};

function agrupar(
  trips: ViajeConCosto[],
  clave: (trip: ViajeConCosto) => string,
): Grupo[] {
  const mapa = new Map<string, { viajes: number; montos: number[] }>();
  for (const trip of trips) {
    if (!cuentaParaCostos(trip)) continue;
    const k = clave(trip);
    const actual = mapa.get(k) ?? { viajes: 0, montos: [] };
    actual.viajes++;
    const monto = montoDe(trip);
    if (monto !== null) actual.montos.push(monto);
    mapa.set(k, actual);
  }
  return [...mapa.entries()]
    .map(([clave, { viajes, montos }]) => ({
      clave,
      viajes,
      conMonto: montos.length,
      total: montos.reduce((suma, m) => suma + m, 0),
      referencia: mediana(montos),
    }))
    .sort((a, b) => a.clave.localeCompare(b.clave));
}

/** Gasto por mes, del más antiguo al más nuevo. */
export const porMes = (trips: ViajeConCosto[]) =>
  agrupar(trips, (trip) => mesDe(trip.date));

/** Gasto por ruta, en orden alfabético. La referencia es la mediana. */
export const porRuta = (trips: ViajeConCosto[]) => agrupar(trips, rutaDe);

/** Gasto por persona. La clave es el id; el nombre lo pone la pantalla. */
export const porPersona = (trips: ViajeConCosto[]) =>
  agrupar(trips, (trip) => trip.person_id);

/** El precio de referencia de una ruta, mirando todo el historial. */
export function referenciaDeRuta(
  trips: ViajeConCosto[],
  ruta: string,
): { referencia: number | null; viajes: number } {
  const montos = trips
    .filter((t) => cuentaParaCostos(t) && rutaDe(t) === ruta)
    .map(montoDe)
    .filter((m): m is number => m !== null);
  return { referencia: mediana(montos), viajes: montos.length };
}

/**
 * Cuánto se aparta un monto de la referencia, como fracción.
 * 0.4 significa "un 40% más caro". Null si no hay con qué comparar.
 */
export function desviacion(monto: number, referencia: number | null) {
  if (referencia === null || referencia === 0) return null;
  if (!Number.isFinite(monto)) return null;
  return (monto - referencia) / referencia;
}

/** Umbral por omisión a partir del cual vale la pena avisar. */
export const UMBRAL_AVISO = 0.4;

/**
 * Si un monto merece un aviso. No bloquea nada: una tarifa cara puede ser
 * legítima. Solo evita que un cero de más pase inadvertido.
 */
export function avisoDePrecio(
  monto: number,
  referencia: number | null,
  umbral: number = UMBRAL_AVISO,
): "caro" | "barato" | null {
  const d = desviacion(monto, referencia);
  if (d === null) return null;
  if (d >= umbral) return "caro";
  if (d <= -umbral) return "barato";
  return null;
}

/** Pesos chilenos, sin decimales, como se leen en Chile. */
/**
 * Si conviene pedir el monto: hay código de reserva y el monto está vacío. Es
 * el momento en que quien carga tiene el precio delante; después nadie vuelve a
 * buscarlo, y Costos solo suma lo que tiene monto. No obliga: puede quedar
 * vacío y cargarse después.
 */
export function pideMonto(pnr: string, monto: string) {
  return pnr.trim() !== "" && monto.trim() === "";
}

export const formatoCLP = (monto: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(monto);
