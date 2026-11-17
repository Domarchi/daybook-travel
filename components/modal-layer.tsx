"use client";

import CampDialog from "@/components/camp-dialog";
import CloseDialog from "@/components/close-dialog";
import GenerateDialog from "@/components/generate-dialog";
import HistoryDialog from "@/components/history-dialog";
import ManifestDialog from "@/components/manifest-dialog";
import { Button } from "@/components/ui/button";
import { SectionKicker } from "@/components/ui/section-kicker";
import PersonDialog from "@/components/person-dialog";
import ReserveDialog from "@/components/reserve-dialog";
import TripDialog from "@/components/trip-dialog";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import ExcelSyncPanel from "../app/excel-sync-panel";
import { X } from "lucide-react";
import { formatDate } from "../lib/format";
import { useApp } from "../app/store";
import { avisoDeExito } from "@/lib/avisos";

export default function ModalLayer() {
  const {
    busy,
    busyRef,
    closeModal,
    closingModal,
    confirmandoDescarte,
    demo,
    descartarCambios,
    editPerson,
    editTrip,
    fijarModificado,
    formError,
    history,
    marcarModificado,
    modal,
    pedirCierre,
    pendingTripDate,
    people,
    personName,
    reload,
    setBusy,
    seguirEditando,
    setNotice,
    trips,
  } = useApp();

  if (!modal) return null;

  // El renglón sobre el título nombra la pantalla del menú a la que pertenece el
  // diálogo. Planificar turnos se abre desde Agenda y desde Personas: no lleva.
  const kicker =
    modal === "excel"
      ? "PERSONAS"
      : modal === "person"
        ? "PERSONAS"
        : modal === "generate"
          ? null
          : modal === "history"
            ? editPerson
              ? "PERSONAS"
              : "VIAJES"
            : modal === "campamento"
              ? "AGENDA"
              : "VIAJES";

  const description =
    modal === "excel"
      ? null
      : modal === "person"
        ? pendingTripDate
          ? `Al guardarla, continuaremos con el viaje del ${formatDate(pendingTripDate)}.`
          : null
        : modal === "trip"
          ? null
          : modal === "generate"
            ? "Crea las subidas y bajadas de cada turno."
            : modal === "manifest"
              ? "Los viajes por solicitar, agrupados por día y ruta, listos para pegar en un correo."
              : modal === "close"
                ? "Anula los que no se volaron o registra la reserva con que se volaron."
                : modal === "reserve"
                  ? "El código que mandó la agencia, para todos los pasajeros de ese vuelo."
                  : modal === "campamento"
                    ? "Quién llega, quién sale y cuántos duermen cada noche, con los traslados del aeropuerto."
                    : editTrip
                    ? `${personName(editTrip.person_id)} · ${formatDate(editTrip.date)}`
                    : editPerson
                      ? editPerson.name
                      : "Cambios registrados en este viaje.";

  return (
    <div
      className="overlay"
      data-cerrando={closingModal ? "" : undefined}
      onMouseDown={(event) => {
        // Un toque fuera de la caja hace lo mismo que Escape y la ✕: cierra si
        // no hay nada escrito y, si lo hay, pregunta antes de descartarlo. Sin
        // `preventDefault`, el navegador mueve el foco al cuerpo después de que
        // la pregunta lo puso en «Seguir editando».
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        pedirCierre();
      }}
    >
      <section
        className={modal === "excel" ? "dialog excel-dialog" : "dialog"}
        inert={confirmandoDescarte}
        onChange={marcarModificado}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? "dialog-description" : undefined}
      >
        <div className="flex shrink-0 items-start justify-between gap-[22px] border-b border-line bg-surface px-6 pt-[23px] pb-[19px]">
          <div>
            {kicker && <SectionKicker>{kicker}</SectionKicker>}
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
                          : modal === "reserve"
                            ? "Registrar reserva"
                            : modal === "campamento"
                              ? "Lista para el campamento"
                              : editPerson
                            ? "Historial de la persona"
                            : "Historial del viaje"}
            </h2>
            {description && (
              <p
                id="dialog-description"
                className="mt-[7px] max-w-[520px] text-caption text-muted"
              >
                {description}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="icon"
            aria-label="Cerrar"
            disabled={busy}
            onClick={pedirCierre}
          >
            <X size={20} />
          </Button>
        </div>

        {formError && (
          <p
            role="alert"
            tabIndex={-1}
            className="dialog-error mx-6 mt-[14px] shrink-0 rounded-md border border-[color-mix(in_srgb,var(--danger)_45%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] px-3 py-[11px] text-meta text-danger max-[760px]:mx-4 max-[760px]:mt-3"
          >
            {formError}
          </p>
        )}

        {modal === "excel" && (
          <ExcelSyncPanel
            people={people}
            trips={trips}
            demo={demo}
            onClose={pedirCierre}
            onCambiosChange={fijarModificado}
            onBusyChange={(nextBusy) => {
              setBusy(nextBusy);
              busyRef.current = nextBusy;
            }}
            onApplied={async (message) => {
              if (!demo) await reload();
              setNotice(avisoDeExito(message));
            }}
          />
        )}

        {modal === "person" && <PersonDialog />}

        {modal === "trip" && <TripDialog />}

        {modal === "generate" && <GenerateDialog />}

        {modal === "history" && <HistoryDialog />}

        {modal === "manifest" && <ManifestDialog />}

        {modal === "close" && <CloseDialog />}

        {modal === "reserve" && <ReserveDialog />}

        {modal === "campamento" && <CampDialog />}
      </section>

      {confirmandoDescarte && (
        <ConfirmDialog
          title="Hay cambios sin guardar"
          description="Si cierras ahora, se pierde lo que escribiste en este formulario."
          cancelLabel="Seguir editando"
          confirmLabel="Descartar cambios"
          onCancel={seguirEditando}
          onConfirm={descartarCambios}
        />
      )}
    </div>
  );
}
