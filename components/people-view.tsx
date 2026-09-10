"use client";

import EmptyState from "@/components/ui/empty-state";
import { ArrowUpRight, CalendarDays, ChevronRight, FileSpreadsheet, Search, UserPlus, Users } from "lucide-react";
import { formatDate } from "../lib/format";
import { Button } from "@/components/ui/button";
import { FilterPills } from "@/components/ui/filter-pills";
import { ShiftBadge, tonoDeJornada } from "@/components/ui/shift-badge";
import { useApp } from "../app/store";

export default function PeopleView() {
  const {
    clearMessages,
    openGenerate,
    openPerson,
    openTrip,
    people,
    peopleFilter,
    query,
    abrirModal,
    setPeopleFilter,
    setQuery,
    showPersonTrips,
    visiblePeople,
  } = useApp();

  return (
    <section aria-labelledby="people-results">
      <div className="mb-[10px] flex flex-wrap items-center gap-2 max-[760px]:flex-col max-[760px]:items-stretch">
        <label className="flex min-h-[46px] min-w-[min(100%,300px)] flex-[1_1_320px] items-center gap-[9px] rounded-sm border border-line-strong bg-surface px-3 text-muted max-[760px]:w-full max-[760px]:flex-[0_0_auto]">
          <Search size={18} aria-hidden="true" />
          <input
            className="min-h-[42px] w-full min-w-0 border-0 bg-transparent p-0 text-foreground shadow-none outline-0 placeholder:text-muted placeholder:opacity-80"
            aria-label="Buscar personas"
            placeholder="Buscar nombre, ciudad o turno…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <FilterPills
          label="Filtrar personas"
          opciones={[
            "Activas",
            "4×3",
            "10×10",
            "Por confirmar",
            "Inactivas",
            "Todas",
          ]}
          valor={peopleFilter}
          onCambio={setPeopleFilter}
        />
        <Button type="button" onClick={() => openGenerate()}>
          <CalendarDays size={18} />
          Planificar turnos
        </Button>
        <Button
          type="button"
          onClick={() => {
            clearMessages();
            abrirModal("excel");
          }}
        >
          <FileSpreadsheet size={18} />
          Gestionar con Excel
        </Button>
      </div>
      <div
        className="mb-[6px] flex min-h-7 items-center justify-between gap-[14px] text-[12px] text-muted"
        id="people-results"
        aria-live="polite"
      >
        <span>
          {visiblePeople.length} de {people.length} personas
        </span>
        {(query || peopleFilter !== "Activas") &&
          visiblePeople.length > 0 && (
            <Button
              type="button"
              onClick={() => {
                setQuery("");
                setPeopleFilter("Activas");
              }}
            >
              Limpiar filtros
            </Button>
          )}
      </div>

      {visiblePeople.length ? (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          {visiblePeople.map((person, index) => (
            <article
              className="grid min-h-[106px] grid-cols-[42px_minmax(210px,1.25fr)_minmax(190px,0.9fr)_minmax(150px,0.55fr)_auto] items-center gap-[18px] border-b border-line px-[18px] py-[17px] last:border-b-0 max-[1120px]:grid-cols-[36px_minmax(190px,1.2fr)_minmax(170px,0.8fr)_minmax(130px,0.55fr)] max-[760px]:grid-cols-[28px_minmax(0,1fr)] max-[760px]:gap-3 max-[760px]:px-[14px] max-[760px]:py-[15px]"
              key={person.id}
            >
              <span className="text-[11px] text-muted tabular-nums" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="grid min-w-0 gap-[5px]">
                <div className="flex items-center gap-[9px]">
                  <h2>{person.name}</h2>
                  <span
                    className={
                      "shrink-0 text-[9px] font-extrabold tracking-[0.04em] uppercase " +
                      (person.active ? "text-success" : "text-muted")
                    }
                  >
                    {person.active ? "Activa" : "Inactiva"}
                  </span>
                </div>
                <small>{person.baggage}</small>
              </div>
              <div className="grid min-w-0 gap-[5px]">
                <small>Ruta habitual</small>
                <span>
                  {person.origin} <ChevronRight size={15} />{" "}
                  {person.destination}
                </span>
              </div>
              <div className="grid min-w-0 gap-[5px]">
                <ShiftBadge tono={tonoDeJornada(person.shift)}>
                  Turno {person.shift}
                </ShiftBadge>
                <small>Desde {formatDate(person.start_date)}</small>
              </div>
              <div className="flex items-center justify-end gap-[6px]">
                {person.active && (
                  <Button
                    type="button"
                    onClick={() => openTrip(null, undefined, person.id)}
                  >
                    <UserPlus size={16} /> Nuevo viaje
                  </Button>
                )}
                <Button type="button" onClick={() => showPersonTrips(person)}>
                  Ver viajes
                </Button>
                <Button
                  type="button"
                  aria-label={`Editar a ${person.name}`}
                  onClick={() => openPerson(person)}
                >
                  Editar <ArrowUpRight size={16} />
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Users />}
          title={
            people.length
              ? "No encontramos personas"
              : "Agrega a la primera persona"
          }
          description={
            people.length
              ? "Prueba otra búsqueda o vuelve a las personas activas."
              : "Su ruta, turno y fecha de inicio serán el punto de partida."
          }
          action={
            people.length ? "Limpiar filtros" : "Nueva persona"
          }
          onAction={
            people.length
              ? () => {
                  setQuery("");
                  setPeopleFilter("Activas");
                }
              : () => openPerson()
          }
        />
      )}
    </section>
  );
}
