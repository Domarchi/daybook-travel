"use client";

import DialogActions from "./dialog-actions";
import EmptyState from "./empty-state";
import GenerateDialog from "./generate-dialog";
import HistoryDialog from "./history-dialog";
import PersonDialog from "./person-dialog";
import TripDialog from "./trip-dialog";
import ExcelSyncPanel from "../excel-sync-panel";
import { ArrowDownLeft, ChevronRight, Clock, X } from "lucide-react";
import { BAGGAGE_OPTIONS as baggageOptions, TRIP_STATUSES as statuses } from "../../lib/types";
import { formatDate, formatDateTime, localDate, nextWeekday } from "../../lib/format";
import { useApp } from "../store";

export default function ModalLayer() {
  const {
    activePeople,
    busy,
    busyRef,
    closeModal,
    demo,
    editPerson,
    editTrip,
    eligibleFourByThree,
    formError,
    generateSelection,
    generateTrips,
    generateUntil,
    generationPeople,
    generationPreview,
    history,
    historyLoading,
    loading,
    modal,
    newDate,
    newPerson,
    openTrip,
    pendingTripDate,
    people,
    peopleById,
    personName,
    reload,
    reservationOpen,
    reservationRequired,
    savePerson,
    saveTrip,
    setBusy,
    setGenerateSelection,
    setGenerateUntil,
    setNotice,
    setReservationOpen,
    setTripStatus,
    showHistory,
    tripStatus,
    trips,
    view,
  } = useApp();

  if (!modal) return null;

  return (
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

        {modal === "person" && <PersonDialog />}

        {modal === "trip" && <TripDialog />}

        {modal === "generate" && <GenerateDialog />}

        {modal === "history" && <HistoryDialog />}
      </section>
    </div>
  );
}
