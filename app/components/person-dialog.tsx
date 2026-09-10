"use client";

import DialogActions from "@/components/ui/dialog-actions";
import { BAGGAGE_OPTIONS as baggageOptions } from "../../lib/types";
import { localDate, nextWeekday } from "../../lib/format";
import { useState } from "react";
import { DIAS_SEMANA } from "../../lib/cycles";
import { useApp } from "../store";

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
                value={shift}
                onChange={(event) => setShift(event.target.value)}
              >
                <option>Por confirmar</option>
                <option>4×3</option>
                <option>10×10</option>
              </select>
            </label>
            {shift === "4×3" && (
              <>
                <label>
                  Sube los
                  <select
                    name="up_weekday"
                    defaultValue={String(editPerson?.up_weekday ?? 1)}
                  >
                    {DIAS_SEMANA.map((dia) => (
                      <option key={dia.valor} value={dia.valor}>
                        {dia.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Baja los
                  <select
                    name="down_weekday"
                    defaultValue={String(editPerson?.down_weekday ?? 4)}
                  >
                    {DIAS_SEMANA.map((dia) => (
                      <option key={dia.valor} value={dia.valor}>
                        {dia.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label>
              {shift === "10×10" ? "Primera subida" : "Inicio de vigencia"}
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
