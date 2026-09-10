"use client";

import DialogActions from "./dialog-actions";
import { formatDate, localDate } from "../../lib/format";
import { DIAS_SEMANA } from "../../lib/cycles";
import { useApp } from "../store";

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
    <form onSubmit={generateTrips} aria-busy={busy}>
      <div className="dialog-body">
        <section className="form-section generate-section">
          <p aria-live="polite">{ritmo}</p>
          <label>
            Personas a planificar
            <select
              data-autofocus
              name="person_id"
              value={generateSelection}
              onChange={(event) =>
                setGenerateSelection(event.target.value)
              }
            >
              <option value="all">
                Todas las personas activas con jornada (
                {planificables.length})
              </option>
              {planificables.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Generar hasta
            <input
              type="date"
              name="until"
              required
              min={localDate()}
              value={generateUntil}
              onChange={(event) =>
                setGenerateUntil(event.target.value)
              }
            />
          </label>
          <div className="generation-preview" aria-live="polite">
            <span>Se agregarán</span>
            <strong>{generationPreview} viajes</strong>
            <small>
              para {generationPeople.length}{" "}
              {generationPeople.length === 1 ? "persona" : "personas"}
              . Los viajes existentes no se duplican.
            </small>
          </div>
        </section>
      </div>
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
