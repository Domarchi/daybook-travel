"use client";

import { CalendarDays, ChevronRight } from "lucide-react";
import { formatDate } from "../../lib/format";
import type { Trip } from "../../lib/types";

const VENTANAS_SUGERIDAS = [7, 14, 21, 30, 45, 60];

export default function AgendaView({
  nextTrip,
  purchaseSummary,
  purchaseWindow,
  onPurchase,
  onWindowChange,
  requestedCount,
  activeCount,
  personName,
  onTrip,
  onRequested,
  onPeople,
  onGenerate,
  children,
}: {
  nextTrip?: Trip;
  purchaseSummary: {
    urgentes: number;
    vencidos: number;
    fechasAbiertas: string[];
  };
  purchaseWindow: number;
  onPurchase: () => void;
  onWindowChange: (dias: number) => void;
  requestedCount: number;
  activeCount: number;
  personName: (id: string) => string;
  onTrip: (trip: Trip) => void;
  onRequested: () => void;
  onPeople: () => void;
  onGenerate: () => void;
  children: React.ReactNode;
}) {
  // Lo que espera una gestion hoy: lo que vuela dentro de la ventana mas lo que
  // ya volo sin comprarse.
  const porComprar = purchaseSummary.urgentes + purchaseSummary.vencidos;
  const opciones = VENTANAS_SUGERIDAS.includes(purchaseWindow)
    ? VENTANAS_SUGERIDAS
    : [...VENTANAS_SUGERIDAS, purchaseWindow].sort((a, b) => a - b);

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
        <button
          type="button"
          className={
            porComprar > 0 ? "overview-card urgente" : "overview-card"
          }
          onClick={onPurchase}
        >
          <span>Por comprar ahora</span>
          <strong>{porComprar}</strong>
          <small>
            {purchaseSummary.vencidos > 0
              ? `${purchaseSummary.vencidos} con fecha vencida`
              : porComprar === 0
                ? "Nada urgente por ahora"
                : `En ${purchaseSummary.fechasAbiertas.length} ${
                    purchaseSummary.fechasAbiertas.length === 1
                      ? "fecha"
                      : "fechas"
                  }`}
          </small>
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
        <label className="window-field">
          Comprar con
          <select
            value={purchaseWindow}
            onChange={(event) => onWindowChange(Number(event.target.value))}
          >
            {opciones.map((dias) => (
              <option key={dias} value={dias}>
                {dias} días
              </option>
            ))}
          </select>
          de anticipación
        </label>
      </div>
      {children}
    </>
  );
}
