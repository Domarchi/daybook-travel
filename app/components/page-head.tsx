"use client";

import { Plus } from "lucide-react";
import { useApp } from "../store";

export default function PageHead() {
  const {
    view,
    openPerson,
    openTrip,
  } = useApp();

  return (
    <header className="page-head">
      <div>
        <span className="section-kicker">
          {view === "Agenda"
            ? "OPERACIÓN DEL PROYECTO"
            : view === "Personas"
              ? "DIRECTORIO DE OBRA"
              : "SOLICITUDES Y RESERVAS"}
        </span>
        <h1>
          {view === "Agenda"
            ? "Agenda de viajes"
            : view === "Personas"
              ? "Personas del proyecto"
              : "Viajes y solicitudes"}
        </h1>
        <p className="page-description">
          {view === "Agenda"
            ? "Revisa el movimiento del equipo y atiende lo que sigue."
            : view === "Personas"
              ? "Administra rutas, turnos, vigencia y equipaje."
              : "Prepara solicitudes y completa cada reserva."}
        </p>
      </div>
      <button
        type="button"
        className="primary page-primary"
        onClick={() =>
          view === "Personas" ? openPerson() : openTrip(null)
        }
      >
        <Plus size={18} />
        {view === "Personas" ? "Nueva persona" : "Nuevo viaje"}
      </button>
    </header>
  );
}
