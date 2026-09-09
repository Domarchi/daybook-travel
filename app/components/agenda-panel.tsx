"use client";

import AgendaView from "./agenda-view";
import YearView from "../year-view";
import { useApp } from "../store";

export default function AgendaPanel() {
  const {
    nextTrip,
    plannedCount,
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
      plannedCount={plannedCount}
      requestedCount={requestedCount}
      activeCount={activePeople.length}
      personName={personName}
      onTrip={(trip) => openTrip(trip)}
      onPlanned={() => showTripGroup("Planificado")}
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
