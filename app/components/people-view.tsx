"use client";

import EmptyState from "./empty-state";
import { ArrowUpRight, CalendarDays, ChevronRight, FileSpreadsheet, Search, UserPlus, Users } from "lucide-react";
import { formatDate } from "../../lib/format";
import { useApp } from "../store";

export default function PeopleView() {
  const {
    clearMessages,
    openGenerate,
    openPerson,
    openTrip,
    people,
    peopleFilter,
    query,
    setModal,
    setPeopleFilter,
    setQuery,
    showPersonTrips,
    visiblePeople,
  } = useApp();

  return (
    <section aria-labelledby="people-results">
      <div className="toolbar people-toolbar">
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Buscar personas"
            placeholder="Buscar nombre, ciudad o turno…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="filter-pills" aria-label="Filtrar personas">
          {[
            "Activas",
            "4×3",
            "10×10",
            "Por confirmar",
            "Inactivas",
            "Todas",
          ].map((option) => (
              <button
                type="button"
                key={option}
                className={peopleFilter === option ? "active" : ""}
                aria-pressed={peopleFilter === option}
                onClick={() => setPeopleFilter(option)}
              >
                {option}
              </button>
            ))}
        </div>
        <button type="button" onClick={() => openGenerate()}>
          <CalendarDays size={18} />
          Planificar turnos
        </button>
        <button
          type="button"
          onClick={() => {
            clearMessages();
            setModal("excel");
          }}
        >
          <FileSpreadsheet size={18} />
          Gestionar con Excel
        </button>
      </div>
      <div
        className="results-line"
        id="people-results"
        aria-live="polite"
      >
        <span>
          {visiblePeople.length} de {people.length} personas
        </span>
        {(query || peopleFilter !== "Activas") &&
          visiblePeople.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setPeopleFilter("Activas");
              }}
            >
              Limpiar filtros
            </button>
          )}
      </div>

      {visiblePeople.length ? (
        <div className="people-list">
          {visiblePeople.map((person, index) => (
            <article className="person-row" key={person.id}>
              <span className="person-index" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="person-name">
                <div>
                  <h2>{person.name}</h2>
                  <span
                    className={
                      person.active
                        ? "active-person"
                        : "inactive-person"
                    }
                  >
                    {person.active ? "Activa" : "Inactiva"}
                  </span>
                </div>
                <small>{person.baggage}</small>
              </div>
              <div className="person-route">
                <small>Ruta habitual</small>
                <span>
                  {person.origin} <ChevronRight size={15} />{" "}
                  {person.destination}
                </span>
              </div>
              <div className="person-shift">
                <span
                  className={`shift-badge ${
                    person.shift === "4×3"
                      ? "four"
                      : person.shift === "10×10"
                        ? "ten"
                        : "pending"
                  }`}
                >
                  Turno {person.shift}
                </span>
                <small>Desde {formatDate(person.start_date)}</small>
              </div>
              <div className="person-actions">
                {person.active && (
                  <button
                    type="button"
                    onClick={() =>
                      openTrip(null, undefined, person.id)
                    }
                  >
                    <UserPlus size={16} /> Nuevo viaje
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => showPersonTrips(person)}
                >
                  Ver viajes
                </button>
                <button
                  type="button"
                  aria-label={`Editar a ${person.name}`}
                  onClick={() => openPerson(person)}
                >
                  Editar <ArrowUpRight size={16} />
                </button>
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
