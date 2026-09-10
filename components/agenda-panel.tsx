"use client";

import AgendaView from "@/components/agenda-view";
import YearView from "../app/year-view";
import { useApp } from "../app/store";

export default function AgendaPanel() {
  const {
    nextTrip,
    resumenCompra,
    purchaseWindow,
    savePurchaseWindow,
    showPurchaseQueue,
    requestedCount,
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
    trips,
    people,
  } = useApp();

  return (
    <AgendaView
      nextTrip={nextTrip}
      purchaseSummary={resumenCompra}
      purchaseWindow={purchaseWindow}
      onPurchase={showPurchaseQueue}
      onWindowChange={(dias) => void savePurchaseWindow(dias)}
      requestedCount={requestedCount}
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
        onTrip={(id) =>
          openTrip(trips.find((trip) => trip.id === id) ?? null)
        }
        onAdd={(date) => openTrip(null, date)}
      />
    </AgendaView>
  );
}
