"use client";

import DialogActions from "@/components/ui/dialog-actions";
import { DialogBody, FormSection } from "@/components/ui/dialog-parts";
import { Input, Label, Select } from "@/components/ui/field";
import { formatDate, localDate } from "../lib/format";
import { DIAS_SEMANA } from "../lib/cycles";
import { useApp } from "../app/store";

const nombreDia = (valor: number | null | undefined) =>
  DIAS_SEMANA.find((dia) => dia.valor === valor)?.nombre.toLowerCase() ?? "";

export default function GenerateDialog() {
  const {
    busy,
    closeModal,
    generateSelection,
    generateTrips,
    generateUntil,
    generationPeople,
    generationPreview,
    planificables,
    setGenerateSelection,
    setGenerateUntil,
  } = useApp();

  // Cuando hay una sola persona elegida se puede decir exactamente qué va a
  // pasar. Con varias, cada una sigue los días de su propia ficha.
  const persona = generationPeople.length === 1 ? generationPeople[0] : null;
  const ritmo = !persona
    ? "Cada persona sigue la jornada y los días de viaje de su ficha."
    : persona.shift === "4×3"
      ? `Sube los ${nombreDia(persona.up_weekday ?? 1)} y baja los ${nombreDia(
          persona.down_weekday ?? 4,
        )}, todas las semanas.`
      : `Ciclo de veinte días desde el ${formatDate(
          persona.start_date,
        )}: sube, baja a los diez días y vuelve a subir a los veinte.`;

  return (
    <form onSubmit={generateTrips} aria-busy={busy}
      className="flex min-h-0 flex-1 flex-col"
    >
      <DialogBody>
        <FormSection>
          <p className="text-muted" aria-live="polite">
            {ritmo}
          </p>
          <Label>
            Personas a planificar
            <Select
              data-autofocus
              name="person_id"
              value={generateSelection}
              onChange={(event) => setGenerateSelection(event.target.value)}
            >
              <option value="all">
                Todas las personas activas con jornada ({planificables.length})
              </option>
              {planificables.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>
          </Label>
          <Label>
            Generar hasta
            <Input
              type="date"
              name="until"
              required
              min={localDate()}
              value={generateUntil}
              onChange={(event) => setGenerateUntil(event.target.value)}
            />
          </Label>
          <div
            className="grid gap-[2px] rounded-md border border-line bg-surface-soft p-[17px]"
            aria-live="polite"
          >
            <span className="text-foreground-soft">
              Se agregarán
            </span>
            <strong className="text-[27px] tracking-[-0.035em] text-foreground tabular-nums">
              {generationPreview} viajes
            </strong>
            <small className="text-muted">
              para {generationPeople.length}{" "}
              {generationPeople.length === 1 ? "persona" : "personas"}. Los
              viajes existentes no se duplican.
            </small>
            <small>Se generan desde el inicio de cada persona hasta la fecha indicada, dentro de su vigencia. Los movimientos y reservas existentes no se reemplazan.</small>
            <small>Las personas sin turno se gestionan con Nuevo viaje y no se incluyen en esta planificación.</small>
          </div>
        </FormSection>
      </DialogBody>
      <DialogActions
        busy={busy}
        busyLabel="Generando…"
        submitLabel={`Generar ${generationPreview} viajes`}
        submitDisabled={!generationPreview}
        onCancel={closeModal}
      />
    </form>
  );
}
