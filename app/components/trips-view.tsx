"use client";

import EmptyState from "./empty-state";
import { ArrowDownLeft, ArrowUpRight, Clock, Download, Plane, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { formatDate, localDate, statusClass } from "../../lib/format";
import { TRIP_STATUSES as statuses } from "../../lib/types";
import { useApp } from "../store";

export default function TripsView() {
  const {
    busy,
    clearTripFilters,
    dateFilter,
    demo,
    exportCsv,
    loading,
    markSelectedRequested,
    navigate,
    onlyUpcoming,
    openTrip,
    people,
    peopleById,
    personFilter,
    personName,
    query,
    reload,
    requestableTrips,
    selectedTrips,
    setDateFilter,
    setOnlyUpcoming,
    setPeopleFilter,
    setQuery,
    setSelectedTrips,
    setStatusFilter,
    showHistory,
    statusFilter,
    trips,
    visibleTrips,
  } = useApp();

  const hasTripFilters =
    Boolean(query) ||
    Boolean(dateFilter) ||
    statusFilter !== "Todos" ||
    Boolean(personFilter) ||
    !onlyUpcoming;

  return (
    <section aria-labelledby="trip-results">
      {personFilter && peopleById.get(personFilter) && (
        <div className="context-banner">
          <span>
            Viajes de <strong>{personName(personFilter)}</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              const person = peopleById.get(personFilter);
              navigate("Personas");
              if (person) {
                setPeopleFilter("Todas");
                setQuery(person.name);
              }
            }}
          >
            Volver a la persona
          </button>
        </div>
      )}
      <div className="toolbar trips-toolbar">
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Buscar viajes"
            placeholder="Buscar persona, ruta, vuelo o reserva…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="select-field">
          <span className="sr-only">Filtrar por estado</span>
          <select
            aria-label="Filtrar por estado"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value)
            }
          >
            <option>Todos</option>
            {statuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
        <label className="date-field">
          <span className="sr-only">Filtrar por fecha</span>
          <input
            aria-label="Filtrar por fecha"
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
          />
        </label>
        <button
          type="button"
          className={onlyUpcoming ? "active-filter" : ""}
          aria-pressed={onlyUpcoming}
          onClick={() => setOnlyUpcoming((current) => !current)}
        >
          <SlidersHorizontal size={17} />
          {onlyUpcoming ? "Próximos" : "Todos los periodos"}
        </button>
        <button type="button" onClick={exportCsv}>
          <Download size={17} /> Lista para solicitar
        </button>
        {!demo && (
          <button type="button" onClick={reload} disabled={loading}>
            <RefreshCw
              className={loading ? "spin" : ""}
              size={17}
            />
            {loading ? "Actualizando…" : "Actualizar"}
          </button>
        )}
      </div>
      <div
        className="results-line"
        id="trip-results"
        aria-live="polite"
      >
        <span>
          {visibleTrips.length}{" "}
          {visibleTrips.length === 1 ? "viaje" : "viajes"}
          {onlyUpcoming ? " desde hoy" : " en total"}
          {statusFilter !== "Todos" ? ` · ${statusFilter}` : ""}
          {dateFilter ? ` · ${formatDate(dateFilter)}` : ""}
        </span>
        {hasTripFilters && visibleTrips.length > 0 && (
          <button type="button" onClick={clearTripFilters}>
            Limpiar filtros
          </button>
        )}
      </div>

      {selectedTrips.length > 0 && (
        <div className="bulk-action-bar" role="status">
          <span>
            <strong>{selectedTrips.length}</strong>{" "}
            {selectedTrips.length === 1
              ? "viaje seleccionado"
              : "viajes seleccionados"}
          </span>
          <div>
            <button
              type="button"
              onClick={() => setSelectedTrips([])}
              disabled={busy}
            >
              Quitar selección
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void markSelectedRequested()}
              disabled={busy}
            >
              {busy
                ? "Actualizando…"
                : `Marcar ${selectedTrips.length} como ${selectedTrips.length === 1 ? "solicitado" : "solicitados"}`}
            </button>
          </div>
        </div>
      )}

      {visibleTrips.length ? (
        <div
          className="table-wrap"
          role="region"
          aria-label="Listado de viajes"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th className="selection-cell">
                  <label className="selection-toggle">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todos los viajes planificados visibles"
                      checked={
                        requestableTrips.length > 0 &&
                        requestableTrips.every((trip) =>
                          selectedTrips.includes(trip.id),
                        )
                      }
                      onChange={(event) => {
                        const ids = requestableTrips.map(
                          (trip) => trip.id,
                        );
                        setSelectedTrips((current) =>
                          event.target.checked
                            ? Array.from(
                                new Set([...current, ...ids]),
                              )
                            : current.filter(
                                (id) => !ids.includes(id),
                              ),
                        );
                      }}
                      disabled={!requestableTrips.length}
                    />
                  </label>
                </th>
                <th>Persona y ruta</th>
                <th>Fecha</th>
                <th>Movimiento</th>
                <th>Hora</th>
                <th>Estado</th>
                <th>Reserva</th>
                <th>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleTrips.map((trip) => (
                <tr key={trip.id}>
                  <td
                    data-label="Seleccionar"
                    className="selection-cell"
                  >
                    {trip.status === "Planificado" &&
                    trip.date >= localDate() ? (
                      <label className="selection-toggle">
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar viaje de ${personName(trip.person_id)} del ${formatDate(trip.date)}`}
                          checked={selectedTrips.includes(trip.id)}
                          onChange={(event) =>
                            setSelectedTrips((current) =>
                              event.target.checked
                                ? [...current, trip.id]
                                : current.filter(
                                    (id) => id !== trip.id,
                                  ),
                            )
                          }
                        />
                      </label>
                    ) : (
                      <span aria-hidden="true">—</span>
                    )}
                  </td>
                  <td data-label="Persona y ruta">
                    <strong>{personName(trip.person_id)}</strong>
                    <small>
                      {trip.origin} → {trip.destination}
                    </small>
                  </td>
                  <td data-label="Fecha">
                    {formatDate(trip.date)}
                  </td>
                  <td data-label="Movimiento">
                    <span
                      className={`direction ${trip.direction.toLowerCase()}`}
                    >
                      {trip.direction === "SUBIDA" ? (
                        <ArrowUpRight size={16} />
                      ) : (
                        <ArrowDownLeft size={16} />
                      )}
                      {trip.direction === "SUBIDA"
                        ? "Subida"
                        : "Bajada"}
                    </span>
                  </td>
                  <td data-label="Hora">
                    {trip.requested_time?.slice(0, 5) ||
                      "Por confirmar"}
                  </td>
                  <td data-label="Estado">
                    <span
                      className={`status-pill ${statusClass(trip.status)}`}
                    >
                      {trip.status}
                    </span>
                  </td>
                  <td data-label="Reserva">{trip.pnr || "—"}</td>
                  <td data-label="Acciones" className="row-actions">
                    <button
                      type="button"
                      onClick={() => openTrip(trip)}
                    >
                      Abrir <ArrowUpRight size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Ver historial de ${personName(trip.person_id)}`}
                      onClick={() => void showHistory(trip)}
                    >
                      <Clock size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={<Plane />}
          title={
            hasTripFilters
              ? "No hay viajes con estos filtros"
              : "Aún no hay viajes"
          }
          description={
            hasTripFilters
              ? "Cambia los filtros para ampliar la búsqueda."
              : people.length
                ? "Agrega un viaje o planifica el calendario de los turnos 4×3."
                : "Primero registra a las personas que viajarán."
          }
          action={
            hasTripFilters
              ? "Limpiar filtros"
              : people.length
                ? "Nuevo viaje"
                : "Ir a personas"
          }
          onAction={
            hasTripFilters
              ? clearTripFilters
              : people.length
                ? () => openTrip(null)
                : () => navigate("Personas")
          }
        />
      )}
      <div className="integration-note">
        <Plane size={17} />
        <span>
          <strong>Tarifas en vivo aún no conectadas.</strong> El
          monto se registra al confirmar el pasaje.
        </span>
      </div>
    </section>
  );
}

