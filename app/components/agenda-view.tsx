"use client";

import { CalendarDays, ChevronRight } from "lucide-react";
import { formatDate } from "../../lib/format";
import type { Trip } from "../../lib/types";

export default function AgendaView({
  nextTrip,
  plannedCount,
  requestedCount,
  activeCount,
  personName,
  onTrip,
  onPlanned,
  onRequested,
  onPeople,
  onGenerate,
  children,
}: {
  nextTrip?: Trip;
  plannedCount: number;
  requestedCount: number;
  activeCount: number;
  personName: (id: string) => string;
  onTrip: (trip: Trip) => void;
  onPlanned: () => void;
  onRequested: () => void;
  onPeople: () => void;
  onGenerate: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <section className="overview-strip" aria-label="Resumen operativo">
        <button
          type="button"
          className="overview-card next"
          onClick={() => nextTrip && onTrip(nextTrip)}
          disabled={!nextTrip}
        >
          <span>Próximo movimiento</span>
          {nextTrip ? (
            <>
              <strong>{formatDate(nextTrip.date)}</strong>
              <small>
                {personName(nextTrip.person_id)} ·{" "}
                {nextTrip.requested_time?.slice(0, 5) || "hora pendiente"}
              </small>
            </>
          ) : (
            <>
              <strong>Sin viajes próximos</strong>
              <small>La agenda está despejada</small>
            </>
          )}
          <ChevronRight size={18} />
        </button>
        <button type="button" className="overview-card" onClick={onPlanned}>
          <span>Por solicitar</span>
          <strong>{plannedCount}</strong>
          <small>Viajes planificados</small>
          <ChevronRight size={18} />
        </button>
        <button type="button" className="overview-card" onClick={onRequested}>
          <span>Pendientes de confirmación</span>
          <strong>{requestedCount}</strong>
          <small>Solicitudes enviadas</small>
          <ChevronRight size={18} />
        </button>
        <button type="button" className="overview-card" onClick={onPeople}>
          <span>Personas activas</span>
          <strong>{activeCount}</strong>
          <small>En el proyecto</small>
          <ChevronRight size={18} />
        </button>
      </section>
      <div className="agenda-actions">
        <button
          type="button"
          className="shift-action four"
          onClick={onGenerate}
        >
          <CalendarDays size={17} /> Planificar turnos
        </button>
        <p>
          <span className="shift-dot ten" /> Los turnos 10×10 se agregan con sus
          fechas confirmadas.
        </p>
      </div>
      {children}
    </>
  );
}
