// Todo lo que se calcula a partir del estado sin escribir nada: listas filtradas,
// costos, ventana de compra, próximos viajes y lo que el motor generaría.
//
// El texto de las funciones es el mismo que tenían dentro de `store.tsx`; solo
// cambió dónde viven. Lo que usan de los otros hooks lo reciben en `e`.

import { useMemo } from "react";
import {
  cobertura,
  porMes,
  porPersona,
  porRuta,
  referenciaDeRuta,
  rutaDe,
} from "../../lib/costs";
import { movimientos } from "../../lib/cycles";
import { localDate, normalize } from "../../lib/format";
import { estadoDeCompra, resumenDeCompra } from "../../lib/purchase";
import { esTurnoRotativo, Person, Trip } from "../../lib/types";
import type { Datos } from "./use-datos";
import type { Navegacion } from "./use-navegacion";
import type { Dialogos } from "./use-dialogos";

type Entrada = Datos & Navegacion & Dialogos;

export function useDerivados(e: Entrada) {
  const {
    costMonth,
    costStatus,
    dateFilter,
    generateSelection,
    generateUntil,
    onlyUpcoming,
    people,
    peopleFilter,
    peopleQuery,
    personFilter,
    purchaseFilter,
    purchaseWindow,
    query,
    statusFilter,
    trips,
    tripStatus,
  } = e;

  const peopleById = useMemo(
    () => new Map(people.map((person) => [person.id, person])),
    [people],
  );

  const personName = (id: string) =>
    peopleById.get(id)?.name ?? "Persona sin registro";

  const activePeople = useMemo(
    () => people.filter((person) => person.active),
    [people],
  );

  // Personas a las que el motor les puede armar el calendario: activas y con
  // jornada definida. Antes solo el 4×3; el 10×10 se cargaba viaje por viaje.
  const planificables = useMemo(
    () =>
      people.filter(
        (person) =>
          person.active && esTurnoRotativo(person.shift),
      ),
    [people],
  );

  const visiblePeople = useMemo(() => {
    const needle = normalize(peopleQuery);
    return people.filter((person) => {
      const matchesText =
        !needle ||
        normalize(
          [person.name, person.origin, person.destination, person.shift].join(
            " ",
          ),
        ).includes(needle);
      const matchesFilter =
        peopleFilter === "Todas" ||
        (peopleFilter === "Activas" && person.active) ||
        (peopleFilter === "Inactivas" && !person.active) ||
        (peopleFilter === "4×3" && person.active && person.shift === "4×3") ||
        (peopleFilter === "10×10" && person.active && person.shift === "10×10") ||
        (peopleFilter === "Sin turno" &&
          person.active &&
          person.shift === "Sin turno") ||
        (peopleFilter === "Por confirmar" &&
          person.active &&
          person.shift === "Por confirmar");
      return matchesText && matchesFilter;
    });
  }, [people, peopleFilter, peopleQuery]);

  const visibleTrips = useMemo(() => {
    const needle = normalize(query);
    return trips
      .filter((trip) => {
        const matchesText =
          !needle ||
          normalize(
            [
              personName(trip.person_id),
              trip.origin,
              trip.destination,
              trip.pnr,
              trip.flight,
            ].join(" "),
          ).includes(needle);
        return (
          matchesText &&
          (statusFilter === "Todos" || trip.status === statusFilter) &&
          (!dateFilter || trip.date === dateFilter) &&
          (!personFilter || trip.person_id === personFilter) &&
          (!onlyUpcoming || trip.date >= localDate()) &&
          (purchaseFilter === "todos" ||
            (purchaseFilter === "abiertos" &&
              ["urgente", "vencido"].includes(
                estadoDeCompra(trip, localDate(), purchaseWindow),
              )))
        );
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [
    trips,
    query,
    statusFilter,
    dateFilter,
    personFilter,
    onlyUpcoming,
    peopleById,
    purchaseFilter,
    purchaseWindow,
  ]);

  // En que situacion de compra esta cada viaje, segun la ventana vigente.
  const compraDe = (trip: Pick<Trip, "date" | "status" | "pnr">) =>
    estadoDeCompra(trip, localDate(), purchaseWindow);

  const resumenCompra = useMemo(
    () => resumenDeCompra(trips, localDate(), purchaseWindow),
    [trips, purchaseWindow],
  );

  const costTrips = useMemo(
    () => trips.filter((trip) =>
      (!costMonth || trip.date.startsWith(costMonth)) &&
      (costStatus === "Todos" || trip.status === costStatus)
    ),
    [trips, costMonth, costStatus],
  );

  // La cobertura y los totales siempre usan el mismo período y estado.
  const costos = useMemo(
    () => ({
      cobertura: cobertura(costTrips),
      porMes: porMes(costTrips),
      porRuta: porRuta(costTrips),
      porPersona: porPersona(costTrips),
    }),
    [costTrips],
  );

  // El precio de referencia de la ruta de un viaje, para comparar al registrar
  // un monto nuevo.
  const referenciaDe = (trip: Pick<Trip, "origin" | "destination">) =>
    referenciaDeRuta(trips, rutaDe(trip));

  const requestableTrips = useMemo(
    () =>
      visibleTrips.filter(
        (trip) => trip.status === "Planificado" && trip.date >= localDate(),
      ),
    [visibleTrips],
  );

  const upcomingTrips = useMemo(
    () =>
      trips
        .filter(
          (trip) =>
            trip.date >= localDate() &&
            !["Anulado", "Completado", "No presentado"].includes(trip.status),
        )
        .sort((a, b) => a.date.localeCompare(b.date)),
    [trips],
  );

  const plannedCount = upcomingTrips.filter(
    (trip) => trip.status === "Planificado",
  ).length;
  const requestedCount = upcomingTrips.filter(
    (trip) => trip.status === "Solicitado",
  ).length;
  const nextTrip = upcomingTrips[0];

  const generationPeople = useMemo(() => {
    if (generateSelection === "all") return planificables;
    return planificables.filter((person) => person.id === generateSelection);
  }, [planificables, generateSelection]);

  // Lo que el motor generaria para una persona y que todavia no existe. Es la
  // unica cuenta que se hace: la vista previa y la generacion usan esta misma
  // funcion, asi que no pueden decir cosas distintas.
  const porGenerar = (persona: Person, hasta: string) =>
    movimientos(persona, hasta).filter(
      (paso) =>
        !trips.some(
          (trip) =>
            trip.person_id === persona.id &&
            trip.date === paso.date &&
            trip.direction === paso.direction,
        ),
    );

  const generationPreview = useMemo(() => {
    try {
      return generationPeople.reduce(
        (total, person) => total + porGenerar(person, generateUntil).length,
        0,
      );
    } catch {
      // Un periodo imposible o unos dias mal puestos: el mensaje sale al
      // intentar generar, no en la vista previa.
      return 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generationPeople, generateUntil, trips]);

  const reservationRequired = ["Emitido", "Completado", "No presentado"].includes(
    tripStatus,
  );

  return {
    peopleById,
    personName,
    activePeople,
    planificables,
    visiblePeople,
    visibleTrips,
    compraDe,
    resumenCompra,
    costTrips,
    costos,
    referenciaDe,
    requestableTrips,
    upcomingTrips,
    plannedCount,
    requestedCount,
    nextTrip,
    generationPeople,
    porGenerar,
    generationPreview,
    reservationRequired,
  };
}

export type Derivados = ReturnType<typeof useDerivados>;
