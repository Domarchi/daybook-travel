"use client";

import DialogActions from "@/components/ui/dialog-actions";
import { DialogBody, FormGrid, FormSection, Hint } from "@/components/ui/dialog-parts";
import { Checkbox, Input, Label, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { BAGGAGE_OPTIONS as baggageOptions, TRIP_STATUSES as statuses } from "../lib/types";
import { ChevronRight, Clock } from "lucide-react";
import { useState } from "react";
import { avisoDePrecio, formatoCLP } from "../lib/costs";
import { useApp } from "../app/store";

export default function TripDialog() {
  const {
    referenciaDe,
    activePeople,
    busy,
    closeModal,
    editTrip,
    newDate,
    newPerson,
    people,
    peopleById,
    reservationOpen,
    reservationRequired,
    saveTrip,
    setReservationOpen,
    setTripStatus,
    showHistory,
    tripStatus,
  } = useApp();

  // Lo que costó normalmente esta ruta, para comparar el monto que se escribe.
  // Se recalcula al escribir porque la ruta puede cambiar en el mismo diálogo.
  const [precio, setPrecio] = useState(() => {
    if (!editTrip) return null;
    const { referencia, viajes } = referenciaDe(editTrip);
    return {
      referencia,
      viajes,
      nivel: editTrip.amount
        ? avisoDePrecio(Number(editTrip.amount), referencia)
        : null,
    };
  });

  function revisarMonto(campo: HTMLInputElement) {
    const form = campo.form;
    const valor = (nombre: string) =>
      (form?.elements.namedItem(nombre) as HTMLInputElement | null)?.value ?? "";
    const { referencia, viajes } = referenciaDe({
      origin: valor("origin"),
      destination: valor("destination"),
    });
    const monto = Number(campo.value);
    setPrecio({
      referencia,
      viajes,
      nivel:
        campo.value.trim() && Number.isFinite(monto) && monto > 0
          ? avisoDePrecio(monto, referencia)
          : null,
    });
  }

  return (
    <form onSubmit={saveTrip} aria-busy={busy}>
      <DialogBody>
        {editTrip && (
          <Button
            type="button"
            className="mb-[18px] w-fit border-transparent bg-transparent"
            onClick={() => void showHistory(editTrip)}
          >
            <Clock size={16} /> Ver historial del viaje
          </Button>
        )}
        <FormSection aria-labelledby="trip-main">
          <h3 id="trip-main" className="text-foreground">Movimiento</h3>
          <Label>
            Persona
            {editTrip && (
              <Input
                type="hidden"
                name="person_id"
                value={editTrip.person_id}
              />
            )}
            <Select
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
            </Select>
            {editTrip && (
              <small>
                La persona se mantiene para conservar la trazabilidad.
              </small>
            )}
          </Label>
          <FormGrid>
            <Label>
              Fecha
              <Input
                name="date"
                type="date"
                required
                defaultValue={editTrip?.date ?? newDate}
              />
            </Label>
            <Label>
              Movimiento
              {editTrip && (
                <Input
                  type="hidden"
                  name="direction"
                  value={editTrip.direction}
                />
              )}
              <Select
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
              </Select>
              {editTrip && (
                <small>
                  El sentido identifica este registro y no se cambia.
                </small>
              )}
            </Label>
            <Label>
              Origen
              <Input
                name="origin"
                defaultValue={
                  editTrip?.origin ??
                  peopleById.get(newPerson)?.origin ??
                  activePeople[0]?.origin
                }
                placeholder="Usar ruta habitual"
              />
            </Label>
            <Label>
              Destino
              <Input
                name="destination"
                defaultValue={
                  editTrip?.destination ??
                  peopleById.get(newPerson)?.destination ??
                  activePeople[0]?.destination
                }
                placeholder="Usar ruta habitual"
              />
            </Label>
            <Label>
              Hora requerida
              <Input
                name="requested_time"
                type="time"
                defaultValue={editTrip?.requested_time?.slice(0, 5)}
              />
            </Label>
            <Label>
              Equipaje
              <Select
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
              </Select>
            </Label>
          </FormGrid>
        </FormSection>

        <FormSection aria-labelledby="trip-status">
          <h3 id="trip-status" className="text-foreground">Estado</h3>
          <Label>
            Estado del viaje
            <Select
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
            </Select>
          </Label>
          <details
            className="overflow-hidden rounded-md border border-line bg-surface-soft open:[&_summary_svg]:rotate-90"
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
              className="flex min-h-[60px] cursor-pointer list-none items-center justify-between gap-4 px-[13px] py-[10px] text-foreground-soft [&::-webkit-details-marker]:hidden [&_svg]:transition-transform [&_svg]:duration-[180ms] [&_svg]:ease-[var(--ease-out)]"
              aria-disabled={reservationRequired || undefined}
              onClick={(event) => {
                if (reservationRequired) event.preventDefault();
              }}
            >
              <span className="grid gap-[2px]">
                <strong className="text-foreground">Datos de reserva</strong>
                <small className="text-muted">
                  PNR, vuelo y monto cuando estén disponibles
                </small>
              </span>
              <ChevronRight size={18} />
            </summary>
            <div className="grid grid-cols-2 gap-[15px] border-t border-line bg-surface p-[14px] max-[760px]:grid-cols-1">
              <Label>
                Código de reserva
                <Input
                  name="pnr"
                  defaultValue={editTrip?.pnr}
                  maxLength={40}
                  required={reservationRequired}
                />
              </Label>
              <Label>
                Aerolínea y vuelo
                <Input
                  name="flight"
                  defaultValue={editTrip?.flight}
                  placeholder="Ej. LA 112"
                />
              </Label>
              <Label>
                Monto por persona (CLP)
                <Input
                  name="amount"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={editTrip?.amount ?? ""}
                  onChange={(event) => revisarMonto(event.currentTarget)}
                />
                {precio && precio.referencia !== null && (
                  <small
                    className={
                      precio.nivel ? `precio-aviso ${precio.nivel}` : "precio-aviso"
                    }
                    aria-live="polite"
                  >
                    {precio.nivel === "caro"
                      ? "Más caro de lo habitual. "
                      : precio.nivel === "barato"
                        ? "Más barato de lo habitual. "
                        : ""}
                    Esta ruta ha costado {formatoCLP(precio.referencia)} en{" "}
                    {precio.viajes}{" "}
                    {precio.viajes === 1 ? "viaje" : "viajes"}.
                  </small>
                )}
              </Label>
            </div>
          </details>
        </FormSection>

        <FormSection aria-labelledby="trip-notes">
          <h3 id="trip-notes" className="text-foreground">Observaciones</h3>
          <Label>
            Información útil <small className="text-muted">(opcional)</small>
            <Textarea
              name="notes"
              defaultValue={editTrip?.notes}
              placeholder="Restricciones horarias, equipaje o acuerdos."
            />
          </Label>
          {editTrip && (
            <Label>
              Motivo de este cambio
              <Textarea
                name="change_reason"
                required
                placeholder="Describe brevemente qué cambió y por qué."
              />
            </Label>
          )}
          <Hint>
            Los montos los registra el equipo. Cambiar a Solicitado
            indica que la solicitud ya fue enviada.
          </Hint>
        </FormSection>
      </DialogBody>
      <DialogActions
        busy={busy}
        busyLabel="Guardando…"
        submitLabel="Guardar viaje"
        onCancel={closeModal}
      />
    </form>
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
