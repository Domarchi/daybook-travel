"use client";

import GenerateDialog from "@/components/generate-dialog";
import HistoryDialog from "@/components/history-dialog";
import ManifestDialog from "@/components/manifest-dialog";
import PersonDialog from "@/components/person-dialog";
import TripDialog from "./trip-dialog";
import ExcelSyncPanel from "../excel-sync-panel";
import { X } from "lucide-react";
import { formatDate } from "../../lib/format";
import { useApp } from "../store";

export default function ModalLayer() {
  const {
    busy,
    busyRef,
    closeModal,
    closingModal,
    demo,
    editPerson,
    editTrip,
    formError,
    history,
    modal,
    pendingTripDate,
    people,
    personName,
    reload,
    setBusy,
    setNotice,
    trips,
  } = useApp();

  if (!modal) return null;

  return (
    <div
      className="overlay"
      data-cerrando={closingModal ? "" : undefined}
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
                    ? "PLANIFICACIÓN DE TURNOS"
                    : modal === "history"
                      ? "TRAZABILIDAD"
                      : modal === "manifest"
                        ? "SOLICITUD A LA AGENCIA"
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
                      ? "Crear calendario de turnos"
                      : modal === "manifest"
                        ? "Manifiesto para solicitar"
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
                      ? "Crea las subidas y bajadas de cada turno sin duplicar viajes."
                      : modal === "manifest"
                        ? "Los viajes por solicitar, agrupados por día y ruta, listos para pegar en un correo."
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

        {modal === "manifest" && <ManifestDialog />}
      </section>
    </div>
  );
}
