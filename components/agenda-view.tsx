"use client";

import { CalendarDays, ChevronRight } from "lucide-react";
import { formatDate } from "../lib/format";
import type { Trip } from "../lib/types";
import { Button } from "@/components/ui/button";
import { OverviewCard } from "@/components/ui/overview-card";
import { Select } from "@/components/ui/field";

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
      <section
        className="mb-3 grid grid-cols-[1.45fr_repeat(3,1fr)] gap-[10px] max-[1120px]:grid-cols-2 max-[760px]:grid-cols-[repeat(2,minmax(0,1fr))] max-[760px]:gap-[7px]"
        aria-label="Resumen operativo"
      >
        <OverviewCard
          type="button"
          variante="next"
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
        </OverviewCard>
        <OverviewCard
          type="button"
          variante={porComprar > 0 ? "urgente" : "normal"}
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
        </OverviewCard>
        <OverviewCard type="button" onClick={onRequested}>
          <span>Pendientes de confirmación</span>
          <strong>{requestedCount}</strong>
          <small>Solicitudes enviadas</small>
          <ChevronRight size={18} />
        </OverviewCard>
        <OverviewCard type="button" onClick={onPeople}>
          <span>Personas activas</span>
          <strong>{activeCount}</strong>
          <small>En el proyecto</small>
          <ChevronRight size={18} />
        </OverviewCard>
      </section>
      <p className="mb-2 text-[12px]">Resumen del proyecto completo. El filtro de turno aplica al calendario.</p>
      <div className="mb-3 flex min-h-[52px] flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          onClick={onGenerate}
        >
          <CalendarDays size={17} /> Planificar turnos
        </Button>
        <label className="m-0 inline-flex items-center gap-2 text-[12px] font-[650] text-foreground-soft">
          Anticipación
          <Select
            className="min-h-11 w-auto px-2 py-1 font-bold"
            value={purchaseWindow}
            onChange={(event) => onWindowChange(Number(event.target.value))}
          >
            {opciones.map((dias) => (
              <option key={dias} value={dias}>
                {dias} días
              </option>
            ))}
          </Select>
        </label>
      </div>
      {children}
    </>
  );
}
