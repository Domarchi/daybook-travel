// Qué pantalla se ve y con qué filtros: Viajes, Personas, Agenda y Costos, más la
// selección de viajes y los atajos que cambian de pantalla filtrando.
//
// El texto de las funciones es el mismo que tenían dentro de `store.tsx`; solo
// cambió dónde viven. Lo que usan de los otros hooks lo reciben en `e`.

import { useEffect, useState } from "react";
import { localDate } from "../../lib/format";
import { Person } from "../../lib/types";
import type { Avisos } from "./use-avisos";
import type { Datos } from "./use-datos";

type Entrada = Avisos & Datos;

export function useNavegacion(e: Entrada) {
  const {
    clearMessages,
    isAdmin,
  } = e;

  const [view, setView] = useState("Agenda");
  const [query, setQuery] = useState("");
  const [peopleQuery, setPeopleQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [dateFilter, setDateFilter] = useState("");
  const [personFilter, setPersonFilter] = useState("");
  const [peopleFilter, setPeopleFilter] = useState("Activas");
  const [onlyUpcoming, setOnlyUpcoming] = useState(true);
  const [selectedTrips, setSelectedTrips] = useState<string[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() =>
    localDate().slice(0, 7),
  );
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [calendarShift, setCalendarShift] = useState("Todos");
  const [costMonth, setCostMonth] = useState("");
  const [costStatus, setCostStatus] = useState("Todos");
  const [costCategory, setCostCategory] = useState("");

  const [purchaseFilter, setPurchaseFilter] = useState("todos");

  useEffect(() => {
    if (!isAdmin) setView((actual) => (actual === "Accesos" ? "Agenda" : actual));
  }, [isAdmin]);

  useEffect(() => {
    setSelectedTrips([]);
  }, [query, statusFilter, dateFilter, personFilter, onlyUpcoming]);

  function navigate(label: string) {
    setView(label);
    clearMessages();
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  }

  function showPersonTrips(person: Person) {
    clearTripFilters();
    navigate("Viajes");
    setPersonFilter(person.id);
  }

  function showTripGroup(status: string) {
    clearTripFilters();
    navigate("Viajes");
    setStatusFilter(status);
    setOnlyUpcoming(true);
  }

  function clearTripFilters() {
    setPurchaseFilter("todos");
    setQuery("");
    setStatusFilter("Todos");
    setDateFilter("");
    setPersonFilter("");
    setOnlyUpcoming(true);
    setSelectedTrips([]);
  }

  // La cola de compra: los viajes que hay que atender ahora, en la vista Viajes.
  // Con "sin_cerrar" muestra en cambio los que pasaron hace semanas sin reserva:
  // no hay nada que comprar, hay que cerrarlos.
  function showPurchaseQueue(filtro: "abiertos" | "sin_cerrar" = "abiertos") {
    clearMessages();
    setQuery("");
    setStatusFilter("Todos");
    setDateFilter("");
    setPersonFilter("");
    setOnlyUpcoming(false);
    setPurchaseFilter(filtro);
    setView("Viajes");
    setSelectedTrips([]);
  }

  return {
    view,
    setView,
    query,
    setQuery,
    peopleQuery,
    setPeopleQuery,
    statusFilter,
    setStatusFilter,
    dateFilter,
    setDateFilter,
    personFilter,
    setPersonFilter,
    peopleFilter,
    setPeopleFilter,
    onlyUpcoming,
    setOnlyUpcoming,
    selectedTrips,
    setSelectedTrips,
    calendarMonth,
    setCalendarMonth,
    selectedDay,
    setSelectedDay,
    calendarShift,
    setCalendarShift,
    costMonth,
    setCostMonth,
    costStatus,
    setCostStatus,
    costCategory,
    setCostCategory,
    purchaseFilter,
    setPurchaseFilter,
    navigate,
    showPersonTrips,
    showTripGroup,
    clearTripFilters,
    showPurchaseQueue,
  };
}

export type Navegacion = ReturnType<typeof useNavegacion>;
