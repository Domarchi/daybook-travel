"use client";

import CloseDialog from "@/components/close-dialog";
import GenerateDialog from "@/components/generate-dialog";
import HistoryDialog from "@/components/history-dialog";
import ManifestDialog from "@/components/manifest-dialog";
import { Button } from "@/components/ui/button";
import { SectionKicker } from "@/components/ui/section-kicker";
import PersonDialog from "@/components/person-dialog";
import TripDialog from "@/components/trip-dialog";
import ExcelSyncPanel from "../app/excel-sync-panel";
import { X } from "lucide-react";
import { formatDate } from "../lib/format";
import { useApp } from "../app/store";

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
        <div className="flex shrink-0 items-start justify-between gap-[22px] border-b border-line bg-surface px-6 pt-[23px] pb-[19px]">
          <div>
            <SectionKicker>
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
                        : modal === "close"
                          ? "VIAJES SIN CERRAR"
                          : "REGISTRO DE VIAJE"}
            </SectionKicker>
            <h2
              id="dialog-title"
              className="text-display leading-[1.1] tracking-[-0.035em] text-foreground"
            >
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
                        : modal === "close"
                          ? "Cerrar viajes pasados"
                          : "Historial del viaje"}
            </h2>
            <p
              id="dialog-description"
              className="mt-[7px] max-w-[520px] text-caption text-muted"
            >
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
                        : modal === "close"
                          ? "Anula los que no se volaron o registra la reserva con que se volaron."
                          : editTrip
                        ? `${personName(editTrip.person_id)} · ${formatDate(editTrip.date)}`
                        : "Cambios registrados en este viaje."}
            </p>
          </div>
          <Button
            type="button"
            variant="icon"
            aria-label="Cerrar"
            disabled={busy}
            onClick={closeModal}
          >
            <X size={20} />
          </Button>
        </div>

        {formError && (
          <p
            role="alert"
            tabIndex={-1}
            className="mx-6 mt-[14px] shrink-0 rounded-md border border-[color-mix(in_srgb,var(--danger)_45%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] px-3 py-[11px] text-meta text-danger max-[760px]:mx-4 max-[760px]:mt-3"
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

        {modal === "close" && <CloseDialog />}
      </section>
    </div>
  );
}
