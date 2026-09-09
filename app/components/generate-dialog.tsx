"use client";

import DialogActions from "./dialog-actions";
import { ChevronRight } from "lucide-react";
import { localDate } from "../../lib/format";
import { useApp } from "../store";

export default function GenerateDialog() {
  const {
    busy,
    closeModal,
    eligibleFourByThree,
    generateSelection,
    generateTrips,
    generateUntil,
    generationPeople,
    generationPreview,
    setGenerateSelection,
    setGenerateUntil,
  } = useApp();

  return (
    <form onSubmit={generateTrips} aria-busy={busy}>
      <div className="dialog-body">
        <section className="form-section generate-section">
          <div
            className="pulse-example"
            aria-label="Regla de turno 4 por 3"
          >
            <span className="four">
              Lun <strong>Subida</strong>
            </span>
            <ChevronRight size={16} />
            <span>Mar</span>
            <span>Mié</span>
            <ChevronRight size={16} />
            <span className="four">
              Jue <strong>Bajada</strong>
            </span>
          </div>
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
                Todas las personas 4×3 activas (
                {eligibleFourByThree.length})
              </option>
              {eligibleFourByThree.map((person) => (
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
