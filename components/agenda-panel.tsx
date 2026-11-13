"use client";

import AgendaView from "@/components/agenda-view";
import OperationalHandoff from "@/components/operational-handoff";
import YearView from "../app/year-view";
import { useApp } from "../app/store";

export default function AgendaPanel() {
  const {
    nextTrip,
    resumenCompra,
    revision,
    purchaseWindow,
    savePurchaseWindow,
    showPurchaseQueue,
    requestedCount,
    esperaMasLarga,
    activePeople,
    personName,
    openTrip,
    showTripGroup,
    navigate,
    openGenerate,
    selectedDay,
    setSelectedDay,
    calendarMonth,
    setCalendarMonth,
    calendarShift,
    setCalendarShift,
    trips,
    people,
  } = useApp();

  return (
    <AgendaView
      nextTrip={nextTrip}
      purchaseSummary={resumenCompra}
      purchaseWindow={purchaseWindow}
      onPurchase={() => showPurchaseQueue()}
      onUnclosed={() => showPurchaseQueue("sin_cerrar")}
      reviewCount={revision.size}
      onReview={() => showPurchaseQueue("revisar")}
      onWindowChange={(dias) => void savePurchaseWindow(dias)}
      requestedCount={requestedCount}
      esperaMasLarga={esperaMasLarga}
      activeCount={activePeople.length}
      personName={personName}
      onTrip={(trip) => openTrip(trip)}
      onRequested={() => showTripGroup("Solicitado")}
      onPeople={() => navigate("Personas")}
      onGenerate={() => openGenerate()}
    >
      <YearView
        selected={selectedDay}
        onSelect={setSelectedDay}
        month={calendarMonth}
        onMonthChange={setCalendarMonth}
        trips={trips}
        people={people}
        shift={calendarShift}
        onShiftChange={setCalendarShift}
        onTrip={(id) =>
          openTrip(trips.find((trip) => trip.id === id) ?? null)
        }
        onAdd={(date) => openTrip(null, date)}
      />
      <OperationalHandoff />
    </AgendaView>
  );
}
