"use client";

import DialogActions from "./dialog-actions";
import { BAGGAGE_OPTIONS as baggageOptions, TRIP_STATUSES as statuses } from "../../lib/types";
import { ChevronRight, Clock } from "lucide-react";
import { useState } from "react";
import { avisoDePrecio, formatoCLP } from "../../lib/costs";
import { useApp } from "../store";

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
