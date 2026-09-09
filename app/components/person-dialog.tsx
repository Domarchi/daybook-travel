"use client";

import DialogActions from "./dialog-actions";
import { BAGGAGE_OPTIONS as baggageOptions } from "../../lib/types";
import { localDate, nextWeekday } from "../../lib/format";
import { useApp } from "../store";

export default function PersonDialog() {
  const {
    busy,
    closeModal,
    editPerson,
    savePerson,
  } = useApp();

  return (
    <form onSubmit={savePerson} aria-busy={busy}>
      <div className="dialog-body">
        <section
          className="form-section"
          aria-labelledby="person-main"
        >
          <h3 id="person-main">Datos de la persona</h3>
          <label>
            Nombre completo
            <input
              data-autofocus
              name="name"
              required
              minLength={2}
              maxLength={180}
              defaultValue={editPerson?.name}
            />
          </label>
          <div className="form-grid">
            <label>
              Origen habitual
              <input
                name="origin"
                required
                defaultValue={editPerson?.origin}
                placeholder="Santiago"
              />
            </label>
            <label>
              Destino de subida
              <input
                name="destination"
                required
                defaultValue={editPerson?.destination ?? "Copiapó"}
              />
            </label>
          </div>
        </section>
        <section
          className="form-section"
          aria-labelledby="person-schedule"
        >
          <h3 id="person-schedule">Turno y vigencia</h3>
          <div className="form-grid">
            <label>
              Turno
              <select
                name="shift"
                defaultValue={editPerson?.shift ?? "Por confirmar"}
              >
                <option>Por confirmar</option>
                <option>4×3</option>
                <option>10×10</option>
              </select>
            </label>
            <label>
              Primera subida / inicio
              <input
                name="start_date"
                type="date"
                required
                defaultValue={
                  editPerson?.start_date ??
                  nextWeekday(localDate(), 1)
                }
              />
            </label>
            <label>
              Vigente hasta <small>(opcional)</small>
              <input
                name="end_date"
                type="date"
                defaultValue={editPerson?.end_date ?? ""}
              />
            </label>
            <label>
              Equipaje habitual
              <select
                name="baggage"
                defaultValue={editPerson?.baggage ?? "Por confirmar"}
              >
                {baggageOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="check-field">
            <input
              name="active"
              type="checkbox"
              defaultChecked={editPerson?.active ?? true}
            />
            <span>
              <strong>Persona activa</strong>
              <small>
                Puede recibir nuevos viajes y planificación.
              </small>
            </span>
          </label>
          <p className="hint">
            Para 4×3, el inicio debe ser lunes. Las fechas 10×10 se
            registran manualmente. Si aún no conoces el turno, déjalo
            por confirmar y podrás completar sus viajes uno a uno.
          </p>
        </section>
      </div>
      <DialogActions
        busy={busy}
        busyLabel="Guardando…"
        submitLabel="Guardar persona"
        onCancel={closeModal}
      />
    </form>
  );
}
