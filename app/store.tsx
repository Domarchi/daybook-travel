"use client";

// Aqui vive todo el estado de la aplicacion. Desde que se partio, este archivo
// solo junta los hooks de `app/estado/`: cada uno tiene un tema (la sesion, los
// datos, los filtros, los dialogos, las acciones). Cualquier pieza de la
// aplicacion pide lo que necesita con useApp(), igual que antes.
import { createContext, ReactNode, useContext } from "react";
import { motivosDeAcreditacion, resumenDeMotivos } from "../lib/accreditation";
import { localDate } from "../lib/format";
import { db } from "../lib/supabase";
import { csvDeViajes } from "../lib/trips-csv";
import { Trip } from "../lib/types";
import { useTema } from "./estado/use-tema";
import { useAvisos } from "./estado/use-avisos";
import { useSesion } from "./estado/use-sesion";
import { useDatos } from "./estado/use-datos";
import { useNavegacion } from "./estado/use-navegacion";
import { useDialogos } from "./estado/use-dialogos";
import { useDerivados } from "./estado/use-derivados";
import { useAcreditacion } from "./estado/use-acreditacion";
import { useAccionesSesion } from "./estado/use-acciones-sesion";
import { useAccionesViajes } from "./estado/use-acciones-viajes";
import { useAccionesPersonas } from "./estado/use-acciones-personas";
import { useAccionesGenerar } from "./estado/use-acciones-generar";

function useStoreValue() {
  const tema = useTema();
  const avisos = useAvisos({ ...tema });
  const sesion = useSesion({ ...tema, ...avisos });
  const datos = useDatos({ ...tema, ...avisos, ...sesion });
  const navegacion = useNavegacion({ ...tema, ...avisos, ...sesion, ...datos });
  const dialogos = useDialogos({ ...tema, ...avisos, ...sesion, ...datos, ...navegacion });
  const derivados = useDerivados({ ...tema, ...avisos, ...sesion, ...datos, ...navegacion, ...dialogos });
  const acreditacion = useAcreditacion({ ...tema, ...avisos, ...sesion, ...datos, ...navegacion, ...dialogos, ...derivados });
  const acciones_sesion = useAccionesSesion({ ...tema, ...avisos, ...sesion, ...datos, ...navegacion, ...dialogos, ...derivados, ...acreditacion });
  const acciones_viajes = useAccionesViajes({ ...tema, ...avisos, ...sesion, ...datos, ...navegacion, ...dialogos, ...derivados, ...acreditacion, ...acciones_sesion });
  const acciones_personas = useAccionesPersonas({ ...tema, ...avisos, ...sesion, ...datos, ...navegacion, ...dialogos, ...derivados, ...acreditacion, ...acciones_sesion, ...acciones_viajes });
  const acciones_generar = useAccionesGenerar({ ...tema, ...avisos, ...sesion, ...datos, ...navegacion, ...dialogos, ...derivados, ...acreditacion, ...acciones_sesion, ...acciones_viajes, ...acciones_personas });

  const {
    theme,
    setTheme,
    toggleTheme,
    notice,
    setNotice,
    formError,
    setFormError,
    busy,
    setBusy,
    busyRef,
    clearMessages,
    runAction,
    ready,
    setReady,
    email,
    setEmail,
    demo,
    setDemo,
    accessStatus,
    setAccessStatus,
    isAdmin,
    setIsAdmin,
    people,
    setPeople,
    trips,
    setTrips,
    documentTypes,
    setDocumentTypes,
    documents,
    setDocuments,
    loading,
    setLoading,
    purchaseWindow,
    setPurchaseWindow,
    allRows,
    reload,
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
    modal,
    setModal,
    closingModal,
    setClosingModal,
    editPerson,
    setEditPerson,
    editTrip,
    setEditTrip,
    newDate,
    setNewDate,
    newPerson,
    setNewPerson,
    pendingTripDate,
    setPendingTripDate,
    tripStatus,
    setTripStatus,
    reservationOpen,
    setReservationOpen,
    generateSelection,
    setGenerateSelection,
    generateUntil,
    setGenerateUntil,
    history,
    setHistory,
    historyLoading,
    setHistoryLoading,
    cierreRef,
    abrirModal,
    limpiarModal,
    closeModal,
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
    conAcreditacionAprobada,
    setConAcreditacionAprobada,
    manifestCandidates,
    exigeAcreditacion,
    manifestPendientesDeAcreditacion,
    manifestTrips,
    motivosDeAcreditacionDe,
    alternarAcreditacionAprobada,
    fechasDeDocumentosCambiadas,
    addDocumentType,
    setDocumentTypeActive,
    login,
    enterDemo,
    openTrip,
    saveTrip,
    savePurchaseWindow,
    showHistory,
    openPerson,
    savePerson,
    openGenerate,
    generateTrips,
  } = { ...tema, ...avisos, ...sesion, ...datos, ...navegacion, ...dialogos, ...derivados, ...acreditacion, ...acciones_sesion, ...acciones_viajes, ...acciones_personas, ...acciones_generar };

  // El manifiesto: los viajes por solicitar de la vista, agrupados por día y
  // ruta, para copiarlos a un correo. Deja esos viajes seleccionados para que,
  // una vez enviado el correo, se marquen como solicitados en un solo paso.
  function openManifest() {
    if (!requestableTrips.length) {
      setNotice("No hay viajes futuros por solicitar con estos filtros.");
      return;
    }
    clearMessages();
    // Cada manifiesto parte sin excepciones: una aprobación de ayer no vale hoy.
    setConAcreditacionAprobada([]);
    // Si ya hay viajes marcados no se tocan: pisarlos hacía que quien marcaba
    // tres terminara marcando trece como solicitados sin darse cuenta.
    const hayMarcados = requestableTrips.some((trip) =>
      selectedTrips.includes(trip.id),
    );
    if (!hayMarcados) setSelectedTrips(requestableTrips.map((trip) => trip.id));
    abrirModal("manifest");
  }

  function exportCsv() {
    // Lo mismo que lleva el texto y el PDF: lo que el manifiesto muestra.
    const rows = manifestTrips;
    if (!rows.length) {
      setNotice("No hay viajes futuros por solicitar con estos filtros.");
      return;
    }
    const csv = csvDeViajes(
      rows,
      personName,
      exigeAcreditacion
        ? (trip) =>
            resumenDeMotivos(
              motivosDeAcreditacion(
                trip.person_id,
                trip.date,
                documentTypes,
                documents,
              ),
            ) || "Al día"
        : undefined,
    );
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "daybook-travel-solicitud.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(
      "Lista descargada. Revísala y, cuando la envíes, marca la selección como solicitada.",
    );
  }

  async function markSelectedRequested(soloEstos?: string[]) {
    // El manifiesto pasa exactamente lo que mostró; sin argumento se usa la
    // selección de la tabla de viajes.
    const ids = (soloEstos ?? selectedTrips).filter((id) =>
      trips.some(
        (trip) =>
          trip.id === id &&
          trip.status === "Planificado" &&
          trip.date >= localDate(),
      ),
    );
    if (!ids.length) {
      setNotice("Selecciona viajes planificados para continuar.");
      return;
    }
    await runAction(async () => {
      const updatedAt = new Date().toISOString();
      if (demo) {
        const selected = new Set(ids);
        setTrips((current) =>
          current.map((trip) =>
            selected.has(trip.id)
              ? {
                  ...trip,
                  status: "Solicitado",
                  notes: [
                    trip.notes.trim(),
                    "Motivo del cambio: Solicitud enviada.",
                  ]
                    .filter(Boolean)
                    .join("\n"),
                  updated_at: updatedAt,
                }
              : trip,
          ),
        );
      } else {
        const rows = ids
          .map((id) => trips.find((trip) => trip.id === id))
          .filter((trip): trip is Trip => Boolean(trip));
        for (let index = 0; index < rows.length; index += 10) {
          const results = await Promise.all(
            rows.slice(index, index + 10).map((trip) =>
              db()
                .from("trips")
                .update({
                  status: "Solicitado",
                  notes: [
                    trip.notes.trim(),
                    "Motivo del cambio: Solicitud enviada.",
                  ]
                    .filter(Boolean)
                    .join("\n"),
                  updated_at: updatedAt,
                })
                .eq("id", trip.id)
                .eq("updated_at", trip.updated_at!)
                .select("id"),
            ),
          );
          for (const result of results) {
            if (result.error) throw result.error;
            if (!result.data?.length) {
              throw new Error(
                "Uno de los viajes cambió mientras trabajabas. Actualiza la lista y vuelve a intentarlo.",
              );
            }
          }
        }
        await reload();
      }
      setSelectedTrips([]);
      setNotice(
        `${ids.length} ${ids.length === 1 ? "viaje marcado como solicitado" : "viajes marcados como solicitados"}.`,
      );
    });
  }

  return {
    theme,
    setTheme,
    ready,
    setReady,
    email,
    setEmail,
    demo,
    setDemo,
    accessStatus,
    setAccessStatus,
    isAdmin,
    people,
    setPeople,
    trips,
    setTrips,
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
    calendarShift,
    setCalendarShift,
    costMonth,
    setCostMonth,
    costStatus,
    setCostStatus,
    costCategory,
    setCostCategory,
    costTrips,
    selectedDay,
    setSelectedDay,
    modal,
    setModal,
    editPerson,
    setEditPerson,
    editTrip,
    setEditTrip,
    newDate,
    setNewDate,
    newPerson,
    setNewPerson,
    pendingTripDate,
    setPendingTripDate,
    tripStatus,
    setTripStatus,
    reservationOpen,
    setReservationOpen,
    generateSelection,
    setGenerateSelection,
    generateUntil,
    setGenerateUntil,
    history,
    setHistory,
    notice,
    setNotice,
    formError,
    setFormError,
    busy,
    setBusy,
    loading,
    setLoading,
    historyLoading,
    setHistoryLoading,
    busyRef,
    allRows,
    reload,
    purchaseWindow,
    savePurchaseWindow,
    purchaseFilter,
    setPurchaseFilter,
    showPurchaseQueue,
    compraDe,
    costos,
    referenciaDe,
    resumenCompra,
    peopleById,
    personName,
    activePeople,
    planificables,
    visiblePeople,
    visibleTrips,
    requestableTrips,
    manifestTrips,
    manifestPendientesDeAcreditacion,
    alternarAcreditacionAprobada,
    motivosDeAcreditacionDe,
    exigeAcreditacion,
    documentTypes,
    documents,
    addDocumentType,
    setDocumentTypeActive,
    upcomingTrips,
    plannedCount,
    requestedCount,
    nextTrip,
    generationPeople,
    generationPreview,
    reservationRequired,
    toggleTheme,
    clearMessages,
    runAction,
    login,
    enterDemo,
    navigate,
    closeModal,
    closingModal,
    abrirModal,
    openPerson,
    openTrip,
    openGenerate,
    showPersonTrips,
    showTripGroup,
    clearTripFilters,
    savePerson,
    saveTrip,
    generateTrips,
    openManifest,
    exportCsv,
    markSelectedRequested,
    showHistory,
  };
}

type Store = ReturnType<typeof useStoreValue>;

const AppContext = createContext<Store | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const value = useStoreValue();
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const store = useContext(AppContext);
  if (!store) throw new Error("useApp se uso fuera de AppProvider");
  return store;
}
