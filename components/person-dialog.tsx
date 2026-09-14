"use client";

import DialogActions from "@/components/ui/dialog-actions";
import { DialogBody, FormGrid, FormSection, Hint } from "@/components/ui/dialog-parts";
import { Checkbox, Input, Label, Select } from "@/components/ui/field";
import { BAGGAGE_OPTIONS as baggageOptions } from "../lib/types";
import { localDate, nextWeekday } from "../lib/format";
import { useState } from "react";
import { DIAS_SEMANA } from "../lib/cycles";
import { useApp } from "../app/store";

export default function PersonDialog() {
  const {
    busy,
    closeModal,
    editPerson,
    savePerson,
  } = useApp();

  // El turno decide si los días de viaje tienen sentido: el 10×10 no los usa,
  // porque su ciclo es de veinte días y no depende del día de la semana.
  const [shift, setShift] = useState(editPerson?.shift ?? "Por confirmar");

  return (
    <form onSubmit={savePerson} aria-busy={busy}
      className="flex min-h-0 flex-1 flex-col"
    >
      <DialogBody>
        <FormSection aria-labelledby="person-main">
          <h3 id="person-main" className="text-foreground">Datos de la persona</h3>
          <Label>
            Nombre completo
            <Input
              data-autofocus
              name="name"
              required
              minLength={2}
              maxLength={180}
              defaultValue={editPerson?.name}
            />
          </Label>
          <FormGrid>
            <Label>
              Origen habitual
              <Input
                name="origin"
                required
                defaultValue={editPerson?.origin}
                placeholder="Santiago"
              />
            </Label>
            <Label>
              Destino de subida
              <Input
                name="destination"
                required
                defaultValue={editPerson?.destination ?? "Copiapó"}
              />
            </Label>
          </FormGrid>
        </FormSection>
        <FormSection aria-labelledby="person-schedule">
          <h3 id="person-schedule" className="text-foreground">Turno y vigencia</h3>
          <FormGrid>
            <Label>
              Turno
              <Select
                name="shift"
                value={shift}
                onChange={(event) => setShift(event.target.value)}
              >
                <option>Por confirmar</option>
                <option>4×3</option>
                <option>10×10</option>
              </Select>
            </Label>
            {shift === "4×3" && (
              <>
                <Label>
                  Sube los
                  <Select
                    name="up_weekday"
                    defaultValue={String(editPerson?.up_weekday ?? 1)}
                  >
                    {DIAS_SEMANA.map((dia) => (
                      <option key={dia.valor} value={dia.valor}>
                        {dia.nombre}
                      </option>
                    ))}
                  </Select>
                </Label>
                <Label>
                  Baja los
                  <Select
                    name="down_weekday"
                    defaultValue={String(editPerson?.down_weekday ?? 4)}
                  >
                    {DIAS_SEMANA.map((dia) => (
                      <option key={dia.valor} value={dia.valor}>
                        {dia.nombre}
                      </option>
                    ))}
                  </Select>
                </Label>
              </>
            )}
            <Label>
              {shift === "10×10" ? "Primera subida" : "Inicio de vigencia"}
              <Input
                name="start_date"
                type="date"
                required
                defaultValue={
                  editPerson?.start_date ??
                  nextWeekday(localDate(), 1)
                }
              />
            </Label>
            <Label>
              Vigente hasta <small className="text-muted">(opcional)</small>
              <Input
                name="end_date"
                type="date"
                defaultValue={editPerson?.end_date ?? ""}
              />
            </Label>
            <Label>
              Equipaje habitual
              <Select
                name="baggage"
                defaultValue={editPerson?.baggage ?? "Por confirmar"}
              >
                {baggageOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </Select>
            </Label>
          </FormGrid>
          <Label className="grid-cols-[20px_1fr] items-start gap-[10px] rounded-sm border border-line bg-surface-soft p-3">
            <Checkbox
              className="mt-[2px]"
              name="active"
              defaultChecked={editPerson?.active ?? true}
            />
            <span className="grid gap-[2px]">
              <strong className="text-foreground">Persona activa</strong>{" "}
              <small className="text-muted">
                Puede recibir nuevos viajes y planificación.
              </small>
            </span>
          </Label>
          <Hint>
            En 4×3 se generan viajes según los días de subida y bajada de la
            ficha. En 10×10, la primera subida inicia el ciclo: baja diez días
            después y vuelve a subir a los veinte. Usa Planificar turnos para
            generarlos sin duplicar viajes existentes. Con turno por confirmar,
            registra los movimientos uno a uno.
          </Hint>
        </FormSection>
      </DialogBody>
      <DialogActions
        busy={busy}
        busyLabel="Guardando…"
        submitLabel="Guardar persona"
        onCancel={closeModal}
      />
    </form>
  );
}
