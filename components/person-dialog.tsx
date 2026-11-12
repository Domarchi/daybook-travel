"use client";

import DialogActions from "@/components/ui/dialog-actions";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { DialogBody, FormGrid, FormSection, Hint } from "@/components/ui/dialog-parts";
import { Checkbox, Input, Label, Select } from "@/components/ui/field";
import { BAGGAGE_OPTIONS as baggageOptions } from "../lib/types";
import { formatDate, localDate, nextWeekday } from "../lib/format";
import { personasConMismoNombre } from "../lib/personas-repetidas";
import { useState } from "react";
import { DIAS_SEMANA } from "../lib/cycles";
import { useApp } from "../app/store";

export default function PersonDialog() {
  const {
    busy,
    closeModal,
    documents,
    documentTypes,
    editPerson,
    people,
    savePerson,
    showPersonHistory,
  } = useApp();
  const tiposActivos = documentTypes.filter((tipo) => tipo.active);

  // El turno decide si los días de viaje tienen sentido: el 10×10 no los usa,
  // porque su ciclo es de veinte días y no depende del día de la semana.
  const [shift, setShift] = useState(editPerson?.shift ?? "Por confirmar");

  // Aviso, no bloqueo: dos personas distintas pueden llamarse igual. Ver
  // lib/personas-repetidas.ts.
  const [nombre, setNombre] = useState(editPerson?.name ?? "");
  const repetidas = personasConMismoNombre(nombre, people, editPerson?.id);

  return (
    <form onSubmit={savePerson} aria-busy={busy}
      className="flex min-h-0 flex-1 flex-col"
    >
      <DialogBody>
        {editPerson && (
          <Button
            type="button"
            className="mb-[18px] w-fit border-transparent bg-transparent"
            onClick={() => void showPersonHistory(editPerson)}
          >
            <Clock size={16} /> Ver historial de la persona
          </Button>
        )}
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
              aria-describedby={repetidas.length ? "persona-repetida" : undefined}
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
            />
          </Label>
          <div aria-live="polite">
            {repetidas.length > 0 && (
              <Hint id="persona-repetida" className="border-l-warning text-foreground-soft">
                {editPerson ? "Hay otra persona" : "Ya hay una persona"} con este nombre:
                {repetidas.map((otra) => (
                  <span key={otra.id} className="mt-1 block">
                    {otra.origin} → {otra.destination} · {otra.shift} · desde{" "}
                    {formatDate(otra.start_date)}
                    {otra.active ? "" : " · inactiva"}
                  </span>
                ))}
                <span className="mt-1 block">
                  {editPerson
                    ? "Si es la misma persona repetida, desactiva una de las dos: con las dos activas, Planificar turnos le genera los viajes dos veces."
                    : "Si es la misma, cierra esto y edita la que ya está: una ficha nueva le generaría los viajes dos veces. Si son personas distintas, guarda igual."}
                </span>
              </Hint>
            )}
          </div>
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
                <option>Sin turno</option>
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
                {shift === "Sin turno"
                  ? "Puede recibir viajes agregados manualmente."
                  : "Puede recibir nuevos viajes y planificación."}
              </small>
            </span>
          </Label>
          <Hint>
            {shift === "4×3"
              ? "Planificar turnos generará las subidas y bajadas semanales según los días elegidos."
              : shift === "10×10"
                ? "La primera subida inicia el ciclo: baja diez días después y vuelve a subir a los veinte."
                : shift === "Sin turno"
                  ? "Para jefaturas o viajes ocasionales. Esta persona no entra en ciclos automáticos; agrega cada movimiento con Nuevo viaje."
                  : "Úsalo mientras falta definir la jornada. Los movimientos se registran uno a uno hasta completar la ficha."}
          </Hint>
        </FormSection>
        {tiposActivos.length > 0 && (
          <FormSection aria-labelledby="person-documents">
            <h3 id="person-documents" className="text-foreground">Documentos</h3>
            <FormGrid>
              {tiposActivos.map((tipo) => (
                <Label key={tipo.id}>
                  {tipo.name} <small className="text-muted">(vence el)</small>
                  <Input
                    name={"doc_" + tipo.id}
                    type="date"
                    defaultValue={
                      documents.find(
                        (documento) =>
                          documento.person_id === editPerson?.id &&
                          documento.type_id === tipo.id,
                      )?.expires_on ?? ""
                    }
                  />
                </Label>
              ))}
            </FormGrid>
            <Hint>
              Sin fecha, el documento figura como sin registrar. Al armar el
              manifiesto, quien tenga uno faltante o vencido para el día del
              viaje aparece marcado con el motivo.
            </Hint>
          </FormSection>
        )}
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
