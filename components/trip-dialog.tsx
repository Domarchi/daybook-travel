"use client";

import DialogActions from "@/components/ui/dialog-actions";
import { DialogBody, FormGrid, FormSection, Hint } from "@/components/ui/dialog-parts";
import { Checkbox, Input, Label, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { observacionesDe } from "../lib/notas";
import { BAGGAGE_OPTIONS as baggageOptions, TRIP_STATUSES as statuses } from "../lib/types";
import { ChevronRight } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  MOTIVOS_RAPIDOS,
  camposDelFormulario,
  motivoAutomatico,
  problemaDeMotivo,
} from "../lib/motivo";
import { avisoDePrecio, formatoCLP, pideMonto } from "../lib/costs";
import { useApp } from "../app/store";
import { HistorialEnFicha } from "@/components/history-dialog";

export default function TripDialog() {
  const {
    referenciaDe,
    busy,
    pedirCierre,
    editTrip,
    marcarModificado,
    newDate,
    newPerson,
    people,
    peopleById,
    reservationOpen,
    reservationRequired,
    saveTrip,
    setReservationOpen,
    setTripStatus,
    tripStatus,
  } = useApp();

  // El código y el monto que se están escribiendo: con código y sin monto, el
  // diálogo lo pide (ver pideMonto en lib/costs.ts).
  const [pnrActual, setPnrActual] = useState(editTrip?.pnr ?? "");
  const [montoActual, setMontoActual] = useState(
    editTrip?.amount === null || editTrip?.amount === undefined ? "" : String(editTrip.amount),
  );

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

  // El motivo: si el cambio es solo registrar un dato que faltaba (código,
  // vuelo, monto u hora), se anota solo y el campo no se muestra. Si hace falta,
  // el mínimo de letras se avisa al salir del campo, junto a él.
  const [motivoSolo, setMotivoSolo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [errorDeMotivo, setErrorDeMotivo] = useState("");
  const campoMotivo = useRef<HTMLTextAreaElement>(null);
  const pideMotivo = Boolean(editTrip) && motivoSolo === null;

  function revisarCambios(form: HTMLFormElement) {
    if (!editTrip) return;
    setMotivoSolo(motivoAutomatico(editTrip, camposDelFormulario(new FormData(form))));
  }

  function enviar(event: FormEvent<HTMLFormElement>) {
    if (pideMotivo) {
      const problema = problemaDeMotivo(motivo);
      if (problema) {
        event.preventDefault();
        setErrorDeMotivo(problema);
        campoMotivo.current?.focus();
        return;
      }
    }
    void saveTrip(event);
  }

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
    <form onSubmit={enviar} aria-busy={busy}
      onChange={(event) => revisarCambios(event.currentTarget)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <DialogBody>
        {editTrip && <HistorialEnFicha titulo="Historial del viaje" />}
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
                Para cambiar la persona, anula este viaje y crea otro.
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
                  Para cambiar el sentido, anula este viaje y crea otro.
                </small>
              )}
            </Label>
            <Label>
              Origen
              <Input
                name="origin"
                defaultValue={
                  editTrip?.origin ??
                  peopleById.get(newPerson)?.origin ?? ""
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
                  peopleById.get(newPerson)?.destination ?? ""
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
              className="flex min-h-[60px] cursor-pointer list-none items-center justify-between gap-4 px-[13px] py-[10px] text-foreground-soft [&::-webkit-details-marker]:hidden [&_svg]:transition-transform [&_svg]:duration-[180ms] [&_svg]:ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--focus)]"
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
                  onChange={(event) => setPnrActual(event.currentTarget.value)}
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
                  aria-describedby={pideMonto(pnrActual, montoActual) ? "pedir-monto" : undefined}
                  onChange={(event) => {
                    setMontoActual(event.currentTarget.value);
                    revisarMonto(event.currentTarget);
                  }}
                />
                {pideMonto(pnrActual, montoActual) && (
                  <small
                    id="pedir-monto"
                    className="mt-[6px] border-l-2 border-[var(--focus)] pl-2 text-overline leading-[1.4] font-normal text-foreground-soft"
                  >
                    Anota el monto si lo tienes: Costos solo suma los viajes con monto.
                  </small>
                )}
                {precio && precio.referencia !== null && (
                  <small
                    className={cn(
                      "mt-[6px] text-overline leading-[1.4] text-foreground-soft",
                      precio.nivel === "caro" && "font-bold text-warning",
                      precio.nivel === "barato" && "font-bold",
                    )}
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
            Notas <small className="text-muted">(opcional)</small>
            <Textarea
              name="notes"
              defaultValue={observacionesDe(editTrip?.notes)}
              placeholder="Restricciones horarias, equipaje o acuerdos."
            />
          </Label>
          {editTrip && motivoSolo !== null && (
            <Hint id="motivo-automatico">
              No hace falta escribir un motivo: queda anotado «{motivoSolo}»
            </Hint>
          )}
          {pideMotivo && (
            <div className="grid gap-2">
              <Label>
                Motivo de este cambio
                <Textarea
                  ref={campoMotivo}
                  name="change_reason"
                  aria-required="true"
                  aria-invalid={errorDeMotivo ? true : undefined}
                  aria-describedby={errorDeMotivo ? "motivo-error" : undefined}
                  placeholder="Describe brevemente qué cambió y por qué."
                  value={motivo}
                  onChange={(event) => {
                    setMotivo(event.target.value);
                    if (errorDeMotivo && !problemaDeMotivo(event.target.value)) setErrorDeMotivo("");
                  }}
                  onBlur={(event) => {
                    // Vacío no se marca al pasar: se avisa al guardar.
                    if (event.target.value.trim()) setErrorDeMotivo(problemaDeMotivo(event.target.value) ?? "");
                  }}
                />
              </Label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Motivos frecuentes">
                {MOTIVOS_RAPIDOS.map((opcion) => (
                  <Button
                    key={opcion}
                    type="button"
                    aria-pressed={motivo === opcion}
                    onClick={() => {
                      setMotivo(opcion);
                      setErrorDeMotivo("");
                      marcarModificado();
                      campoMotivo.current?.focus();
                    }}
                  >
                    {opcion}
                  </Button>
                ))}
              </div>
              {errorDeMotivo && (
                <p id="motivo-error" role="alert" className="m-0 text-meta font-semibold text-danger">
                  {errorDeMotivo}
                </p>
              )}
            </div>
          )}
          <Hint>
            Solicitado significa que la solicitud ya se envió a la agencia.
          </Hint>
        </FormSection>
      </DialogBody>
      <DialogActions
        busy={busy}
        busyLabel="Guardando…"
        submitLabel="Guardar viaje"
        onCancel={pedirCierre}
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
