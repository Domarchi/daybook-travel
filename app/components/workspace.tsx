"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  LogOut,
  Plane,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import YearView from "../year-view";
import AgendaView from "./agenda-view";
import DialogActions from "./dialog-actions";
import EmptyState from "./empty-state";
import { LoadingView, LoginView } from "./login-view";
import ThemeToggle from "./theme-toggle";
import ExcelSyncPanel from "../excel-sync-panel";
import { useApp } from "../store";
import { db } from "../../lib/supabase";
import { addDays, pulseDates } from "../../lib/calendar";
import { makeDemoPeople, makeDemoTrips } from "../../lib/demo";
import {
  formatDate,
  formatDateTime,
  localDate,
  nextWeekday,
  normalize,
  statusClass,
} from "../../lib/format";
// Se importan con los nombres locales de siempre para no tocar el JSX que los usa.
import {
  BAGGAGE_OPTIONS as baggageOptions,
  TRIP_STATUSES as statuses,
} from "../../lib/types";
import type {
  AccessStatus,
  HistoryItem,
  ModalName,
  Person,
  Trip,
} from "../../lib/types";

const navItems = [
  { label: "Agenda", icon: CalendarDays },
  { label: "Personas", icon: Users },
  { label: "Viajes", icon: Plane },
];

export default function Workspace() {
  const {
    theme,
    ready,
    email,
    demo,
    setDemo,
    accessStatus,
    setAccessStatus,
    people,
    setPeople,
    trips,
    setTrips,
    view,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    dateFilter,
    setDateFilter,
    personFilter,
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
    modal,
    setModal,
    editPerson,
    editTrip,
    newDate,
    newPerson,
    pendingTripDate,
    tripStatus,
    setTripStatus,
    reservationOpen,
    setReservationOpen,
    generateSelection,
    setGenerateSelection,
    generateUntil,
    setGenerateUntil,
    history,
    notice,
    setNotice,
    formError,
    busy,
    setBusy,
    loading,
    historyLoading,
    busyRef,
    reload,
    peopleById,
    personName,
    activePeople,
    eligibleFourByThree,
    visiblePeople,
    visibleTrips,
    requestableTrips,
    plannedCount,
    requestedCount,
    nextTrip,
    generationPeople,
    generationPreview,
    reservationRequired,
    toggleTheme,
    clearMessages,
    login,
    enterDemo,
    navigate,
    closeModal,
    openPerson,
    openTrip,
    openGenerate,
    showPersonTrips,
    showTripGroup,
    clearTripFilters,
    savePerson,
    saveTrip,
    generateTrips,
    exportCsv,
    markSelectedRequested,
    showHistory,
  } = useApp();

  if (!ready) {
    return <LoadingView />;
  }

  if (!email && !demo) {
    return (
      <LoginView
        theme={theme}
        toggleTheme={toggleTheme}
        login={login}
        busy={busy}
        notice={notice}
        enterDemo={enterDemo}
      />
    );
  }

  const hasTripFilters =
    Boolean(query) ||
    Boolean(dateFilter) ||
    statusFilter !== "Todos" ||
    Boolean(personFilter) ||
    !onlyUpcoming;

  return (
    <div className="shell">
      <div
        className="app-content"
        inert={modal ? true : undefined}
        aria-hidden={modal ? true : undefined}
      >
        <header className="topbar">
          <div className="brand-block">
            <span className="brand">FCC TRAVEL</span>
            <span className="worksite">Copiapó</span>
          </div>
          <nav aria-label="Navegación principal">
            {navItems.map(({ label, icon: Icon }) => (
              <button
                type="button"
                key={label}
                className={view === label ? "selected" : ""}
                aria-current={view === label ? "page" : undefined}
                onClick={() => navigate(label)}
              >
                <Icon size={17} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="account">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <span className="account-name">
              {demo ? "Demostración" : email}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label={demo ? "Salir de la demostración" : "Cerrar sesión"}
              onClick={async () => {
                if (!demo) await db.auth.signOut();
                setDemo(false);
                setAccessStatus("checking");
                setPeople([]);
                setTrips([]);
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="workspace">
          {demo && (
            <div className="demo-banner">
              <span className="demo-dot" aria-hidden="true" />
              <span>
                Demostración con datos ficticios. Los cambios duran hasta que
                cierres esta sesión.
              </span>
            </div>
          )}

          {notice && (
            <div className="message global-message" role="status">
              <span>{notice}</span>
              <button
                type="button"
                className="icon-button"
                aria-label="Cerrar aviso"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}

          {accessStatus !== "allowed" && !demo ? (
            <section className="access-state" aria-live="polite">
              {accessStatus === "checking" ? (
                <>
                  <span className="loading-mark" aria-hidden="true" />
                  <h1>Comprobando tu acceso…</h1>
                  <p>Estamos conectando con la agenda del proyecto.</p>
                </>
              ) : accessStatus === "error" ? (
                <>
                  <RefreshCw size={25} />
                  <h1>No pudimos comprobar tu acceso</h1>
                  <p>Revisa la conexión y vuelve a intentarlo.</p>
                  <button type="button" className="primary" onClick={reload}>
                    Intentar nuevamente
                  </button>
                </>
              ) : (
                <>
                  <Users size={25} />
                  <h1>Tu cuenta todavía no está habilitada</h1>
                  <p>
                    Solicita al responsable de FCC TRAVEL que agregue tu correo
                    al equipo.
                  </p>
                  <button type="button" onClick={reload}>
                    Volver a comprobar
                  </button>
                </>
              )}
            </section>
          ) : (
            <>
              <header className="page-head">
                <div>
                  <span className="section-kicker">
                    {view === "Agenda"
                      ? "OPERACIÓN DEL PROYECTO"
                      : view === "Personas"
                        ? "DIRECTORIO DE OBRA"
                        : "SOLICITUDES Y RESERVAS"}
                  </span>
                  <h1>
                    {view === "Agenda"
                      ? "Agenda de viajes"
                      : view === "Personas"
                        ? "Personas del proyecto"
                        : "Viajes y solicitudes"}
                  </h1>
                  <p className="page-description">
                    {view === "Agenda"
                      ? "Revisa el movimiento del equipo y atiende lo que sigue."
                      : view === "Personas"
                        ? "Administra rutas, turnos, vigencia y equipaje."
                        : "Prepara solicitudes y completa cada reserva."}
                  </p>
                </div>
                <button
                  type="button"
                  className="primary page-primary"
                  onClick={() =>
                    view === "Personas" ? openPerson() : openTrip(null)
                  }
                >
                  <Plus size={18} />
                  {view === "Personas" ? "Nueva persona" : "Nuevo viaje"}
                </button>
              </header>

              {view === "Agenda" ? (
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
              ) : view === "Personas" ? (
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
                      Planificar 4×3
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
              ) : (
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
              )}
            </>
          )}
          <footer className="workspace-footer">
            <span>FCC TRAVEL / Copiapó</span>
            <span>Personas · Planificación · Pasajes</span>
          </footer>
        </main>
      </div>

      {modal && (
        <div
          className="overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) closeModal();
          }}
        >
          <section
            className={modal === "excel" ? "dialog excel-dialog" : "dialog"}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            aria-describedby="dialog-description"
          >
            <div className="dialog-head">
              <div>
                <span className="section-kicker">
                  {modal === "excel"
                    ? "CONTROL DE DATOS"
                    : modal === "person"
                      ? "DIRECTORIO"
                      : modal === "generate"
                        ? "PLANIFICACIÓN 4×3"
                        : modal === "history"
                          ? "TRAZABILIDAD"
                          : "REGISTRO DE VIAJE"}
                </span>
                <h2 id="dialog-title">
                  {modal === "excel"
                    ? "Gestionar con Excel"
                    : modal === "person"
                      ? editPerson
                        ? "Editar persona"
                        : pendingTripDate
                          ? "Primero, agrega una persona"
                          : "Nueva persona"
                      : modal === "trip"
                        ? editTrip
                          ? "Editar viaje"
                          : "Nuevo viaje"
                        : modal === "generate"
                          ? "Crear calendario 4×3"
                          : "Historial del viaje"}
                </h2>
                <p id="dialog-description">
                  {modal === "excel"
                    ? "Descarga, revisa y aplica cambios sin reemplazar información a ciegas."
                    : modal === "person"
                      ? pendingTripDate
                        ? `Al guardarla, continuaremos con el viaje del ${formatDate(pendingTripDate)}.`
                        : "Define su ruta habitual, turno y vigencia."
                      : modal === "trip"
                        ? "Registra el movimiento y completa la reserva cuando corresponda."
                        : modal === "generate"
                          ? "Crea subidas los lunes y bajadas los jueves sin duplicar viajes."
                          : editTrip
                            ? `${personName(editTrip.person_id)} · ${formatDate(editTrip.date)}`
                            : "Cambios registrados en este viaje."}
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Cerrar"
                disabled={busy}
                onClick={closeModal}
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <p
                role="alert"
                tabIndex={-1}
                className="message error-message dialog-error"
              >
                {formError}
              </p>
            )}

            {modal === "excel" && (
              <ExcelSyncPanel
                people={people}
                trips={trips}
                demo={demo}
                onClose={closeModal}
                onBusyChange={(nextBusy) => {
                  setBusy(nextBusy);
                  busyRef.current = nextBusy;
                }}
                onApplied={async (message) => {
                  if (!demo) await reload();
                  setNotice(message);
                }}
              />
            )}

            {modal === "person" && (
              <form onSubmit={savePerson} aria-busy={busy}>
                <div className="dialog-body">
                  <section
                    className="form-section"
                    aria-labelledby="person-main"
                  >
                    <h3 id="person-main">Datos de la persona</h3>
                    <label>
                      Nombre completo
                      <input
                        data-autofocus
                        name="name"
                        required
                        minLength={2}
                        maxLength={180}
                        defaultValue={editPerson?.name}
                      />
                    </label>
                    <div className="form-grid">
                      <label>
                        Origen habitual
                        <input
                          name="origin"
                          required
                          defaultValue={editPerson?.origin}
                          placeholder="Santiago"
                        />
                      </label>
                      <label>
                        Destino de subida
                        <input
                          name="destination"
                          required
                          defaultValue={editPerson?.destination ?? "Copiapó"}
                        />
                      </label>
                    </div>
                  </section>
                  <section
                    className="form-section"
                    aria-labelledby="person-schedule"
                  >
                    <h3 id="person-schedule">Turno y vigencia</h3>
                    <div className="form-grid">
                      <label>
                        Turno
                        <select
                          name="shift"
                          defaultValue={editPerson?.shift ?? "Por confirmar"}
                        >
                          <option>Por confirmar</option>
                          <option>4×3</option>
                          <option>10×10</option>
                        </select>
                      </label>
                      <label>
                        Primera subida / inicio
                        <input
                          name="start_date"
                          type="date"
                          required
                          defaultValue={
                            editPerson?.start_date ??
                            nextWeekday(localDate(), 1)
                          }
                        />
                      </label>
                      <label>
                        Vigente hasta <small>(opcional)</small>
                        <input
                          name="end_date"
                          type="date"
                          defaultValue={editPerson?.end_date ?? ""}
                        />
                      </label>
                      <label>
                        Equipaje habitual
                        <select
                          name="baggage"
                          defaultValue={editPerson?.baggage ?? "Por confirmar"}
                        >
                          {baggageOptions.map((option) => (
                            <option key={option}>{option}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="check-field">
                      <input
                        name="active"
                        type="checkbox"
                        defaultChecked={editPerson?.active ?? true}
                      />
                      <span>
                        <strong>Persona activa</strong>
                        <small>
                          Puede recibir nuevos viajes y planificación.
                        </small>
                      </span>
                    </label>
                    <p className="hint">
                      Para 4×3, el inicio debe ser lunes. Las fechas 10×10 se
                      registran manualmente. Si aún no conoces el turno, déjalo
                      por confirmar y podrás completar sus viajes uno a uno.
                    </p>
                  </section>
                </div>
                <DialogActions
                  busy={busy}
                  busyLabel="Guardando…"
                  submitLabel="Guardar persona"
                  onCancel={closeModal}
                />
              </form>
            )}

            {modal === "trip" && (
              <form onSubmit={saveTrip} aria-busy={busy}>
                <div className="dialog-body">
                  {editTrip && (
                    <button
                      type="button"
                      className="context-link"
                      onClick={() => void showHistory(editTrip)}
                    >
                      <Clock size={16} /> Ver historial del viaje
                    </button>
                  )}
                  <section className="form-section" aria-labelledby="trip-main">
                    <h3 id="trip-main">Movimiento</h3>
                    <label>
                      Persona
                      {editTrip && (
                        <input
                          type="hidden"
                          name="person_id"
                          value={editTrip.person_id}
                        />
                      )}
                      <select
                        data-autofocus
                        disabled={Boolean(editTrip)}
                        name="person_id"
                        required
                        defaultValue={editTrip?.person_id ?? newPerson}
                        onChange={(event) =>
                          fillRoute(
                            event.currentTarget.form,
                            event.currentTarget.value,
                          )
                        }
                      >
                        <option value="" disabled>
                          Seleccionar persona
                        </option>
                        {people.map((person) => (
                          <option
                            key={person.id}
                            value={person.id}
                            disabled={!person.active}
                          >
                            {person.name}
                            {!person.active ? " · inactiva" : ""}
                          </option>
                        ))}
                      </select>
                      {editTrip && (
                        <small>
                          La persona se mantiene para conservar la trazabilidad.
                        </small>
                      )}
                    </label>
                    <div className="form-grid">
                      <label>
                        Fecha
                        <input
                          name="date"
                          type="date"
                          required
                          defaultValue={editTrip?.date ?? newDate}
                        />
                      </label>
                      <label>
                        Movimiento
                        {editTrip && (
                          <input
                            type="hidden"
                            name="direction"
                            value={editTrip.direction}
                          />
                        )}
                        <select
                          disabled={Boolean(editTrip)}
                          name="direction"
                          defaultValue={editTrip?.direction ?? "SUBIDA"}
                          onChange={(event) =>
                            fillRoute(
                              event.currentTarget.form,
                              undefined,
                              event.currentTarget.value,
                            )
                          }
                        >
                          <option value="SUBIDA">Subida</option>
                          <option value="BAJADA">Bajada</option>
                        </select>
                        {editTrip && (
                          <small>
                            El sentido identifica este registro y no se cambia.
                          </small>
                        )}
                      </label>
                      <label>
                        Origen
                        <input
                          name="origin"
                          defaultValue={
                            editTrip?.origin ??
                            peopleById.get(newPerson)?.origin ??
                            activePeople[0]?.origin
                          }
                          placeholder="Usar ruta habitual"
                        />
                      </label>
                      <label>
                        Destino
                        <input
                          name="destination"
                          defaultValue={
                            editTrip?.destination ??
                            peopleById.get(newPerson)?.destination ??
                            activePeople[0]?.destination
                          }
                          placeholder="Usar ruta habitual"
                        />
                      </label>
                      <label>
                        Hora requerida
                        <input
                          name="requested_time"
                          type="time"
                          defaultValue={editTrip?.requested_time?.slice(0, 5)}
                        />
                      </label>
                      <label>
                        Equipaje
                        <select
                          name="baggage"
                          defaultValue={
                            editTrip?.baggage ??
                            peopleById.get(newPerson)?.baggage ??
                            activePeople[0]?.baggage ??
                            "Por confirmar"
                          }
                        >
                          {baggageOptions.map((option) => (
                            <option key={option}>{option}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </section>

                  <section
                    className="form-section"
                    aria-labelledby="trip-status"
                  >
                    <h3 id="trip-status">Estado</h3>
                    <label>
                      Estado del viaje
                      <select
                        name="status"
                        value={tripStatus}
                        onChange={(event) => {
                          setTripStatus(event.target.value);
                          if (event.target.value !== "Planificado") {
                            setReservationOpen(true);
                          }
                        }}
                      >
                        {statuses.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    </label>
                    <details
                      className="form-disclosure"
                      open={reservationOpen || reservationRequired}
                      onToggle={(event) => {
                        if (reservationRequired && !event.currentTarget.open) {
                          event.currentTarget.open = true;
                          setReservationOpen(true);
                        } else {
                          setReservationOpen(event.currentTarget.open);
                        }
                      }}
                    >
                      <summary
                        aria-disabled={reservationRequired || undefined}
                        onClick={(event) => {
                          if (reservationRequired) event.preventDefault();
                        }}
                      >
                        <span>
                          <strong>Datos de reserva</strong>
                          <small>
                            PNR, vuelo y monto cuando estén disponibles
                          </small>
                        </span>
                        <ChevronRight size={18} />
                      </summary>
                      <div className="form-grid disclosure-content">
                        <label>
                          Código de reserva
                          <input
                            name="pnr"
                            defaultValue={editTrip?.pnr}
                            maxLength={40}
                            required={reservationRequired}
                          />
                        </label>
                        <label>
                          Aerolínea y vuelo
                          <input
                            name="flight"
                            defaultValue={editTrip?.flight}
                            placeholder="Ej. LA 112"
                          />
                        </label>
                        <label>
                          Monto por persona (CLP)
                          <input
                            name="amount"
                            type="number"
                            min="0"
                            step="1"
                            defaultValue={editTrip?.amount ?? ""}
                          />
                        </label>
                      </div>
                    </details>
                  </section>

                  <section
                    className="form-section"
                    aria-labelledby="trip-notes"
                  >
                    <h3 id="trip-notes">Observaciones</h3>
                    <label>
                      Información útil <small>(opcional)</small>
                      <textarea
                        name="notes"
                        defaultValue={editTrip?.notes}
                        placeholder="Restricciones horarias, equipaje o acuerdos."
                      />
                    </label>
                    {editTrip && (
                      <label>
                        Motivo de este cambio
                        <textarea
                          name="change_reason"
                          required
                          placeholder="Describe brevemente qué cambió y por qué."
                        />
                      </label>
                    )}
                    <p className="hint">
                      Los montos los registra el equipo. Cambiar a Solicitado
                      indica que la solicitud ya fue enviada.
                    </p>
                  </section>
                </div>
                <DialogActions
                  busy={busy}
                  busyLabel="Guardando…"
                  submitLabel="Guardar viaje"
                  onCancel={closeModal}
                />
              </form>
            )}

            {modal === "generate" && (
              <form onSubmit={generateTrips} aria-busy={busy}>
                <div className="dialog-body">
                  <section className="form-section generate-section">
                    <div
                      className="pulse-example"
                      aria-label="Regla de turno 4 por 3"
                    >
                      <span className="four">
                        Lun <strong>Subida</strong>
                      </span>
                      <ChevronRight size={16} />
                      <span>Mar</span>
                      <span>Mié</span>
                      <ChevronRight size={16} />
                      <span className="four">
                        Jue <strong>Bajada</strong>
                      </span>
                    </div>
                    <label>
                      Personas a planificar
                      <select
                        data-autofocus
                        name="person_id"
                        value={generateSelection}
                        onChange={(event) =>
                          setGenerateSelection(event.target.value)
                        }
                      >
                        <option value="all">
                          Todas las personas 4×3 activas (
                          {eligibleFourByThree.length})
                        </option>
                        {eligibleFourByThree.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Generar hasta
                      <input
                        type="date"
                        name="until"
                        required
                        min={localDate()}
                        value={generateUntil}
                        onChange={(event) =>
                          setGenerateUntil(event.target.value)
                        }
                      />
                    </label>
                    <div className="generation-preview" aria-live="polite">
                      <span>Se agregarán</span>
                      <strong>{generationPreview} viajes</strong>
                      <small>
                        para {generationPeople.length}{" "}
                        {generationPeople.length === 1 ? "persona" : "personas"}
                        . Los viajes existentes no se duplican.
                      </small>
                    </div>
                  </section>
                </div>
                <DialogActions
                  busy={busy}
                  busyLabel="Generando…"
                  submitLabel={`Generar ${generationPreview} viajes`}
                  submitDisabled={!generationPreview}
                  onCancel={closeModal}
                />
              </form>
            )}

            {modal === "history" && (
              <div className="history-view">
                <div className="dialog-body">
                  {editTrip && (
                    <button
                      type="button"
                      className="context-link"
                      onClick={() => openTrip(editTrip)}
                    >
                      <ArrowDownLeft size={16} /> Volver al viaje
                    </button>
                  )}
                  {historyLoading ? (
                    <div className="history-loading" aria-live="polite">
                      <span className="loading-mark" aria-hidden="true" />
                      <p>Cargando cambios…</p>
                    </div>
                  ) : demo ? (
                    <EmptyState
                      icon={<Clock />}
                      title="Historial disponible en la operación"
                      description="La demostración no guarda cambios permanentes."
                    />
                  ) : history.length ? (
                    <div className="history-list">
                      {history.map((item) => (
                        <article className="history-item" key={item.id}>
                          <span className="history-dot" aria-hidden="true" />
                          <div>
                            <strong>
                              {item.action === "INSERT"
                                ? "Viaje creado"
                                : "Viaje actualizado"}
                            </strong>
                            <small>
                              {formatDateTime(item.created_at)} · Usuario{" "}
                              {item.actor?.slice(0, 8)}
                            </small>
                            <p>
                              {String(
                                item.after_data?.notes || "Sin observaciones",
                              )}{" "}
                              · {String(item.after_data?.status || "")}
                            </p>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={<Clock />}
                      title="Sin cambios anteriores"
                      description="Este viaje todavía no tiene cambios registrados."
                    />
                  )}
                </div>
                <div className="dialog-actions">
                  <button type="button" onClick={closeModal}>
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );

  function fillRoute(
    form: HTMLFormElement | null,
    personId?: string,
    directionOverride?: string,
  ) {
    if (!form) return;
    const personSelect = form.elements.namedItem(
      "person_id",
    ) as HTMLSelectElement;
    const directionSelect = form.elements.namedItem(
      "direction",
    ) as HTMLSelectElement;
    const person = peopleById.get(personId ?? personSelect.value);
    if (!person) return;
    const direction = directionOverride ?? directionSelect.value;
    const down = direction === "BAJADA";
    (form.elements.namedItem("origin") as HTMLInputElement).value = down
      ? person.destination
      : person.origin;
    (form.elements.namedItem("destination") as HTMLInputElement).value = down
      ? person.origin
      : person.destination;
    (form.elements.namedItem("baggage") as HTMLSelectElement).value =
      person.baggage;
  }
}
