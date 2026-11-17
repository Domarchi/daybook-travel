"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useApp } from "@/app/store";
import { movimientosParaEntrega, pendientesDelMovimiento } from "@/lib/agenda";
import { formatDate, localDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";

export default function OperationalHandoff() {
  const { trips, personName, openTrip } = useApp();
  const [today, setToday] = useState(localDate);
  useEffect(() => {
    const timer = setInterval(() => setToday(localDate()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const rows = movimientosParaEntrega(trips, today);
  // Arriba van solo los que tienen algo por resolver; los que están listos se
  // cuentan en una línea y se despliegan si alguien los quiere ver.
  const pendientes = rows.filter((trip) => pendientesDelMovimiento(trip).length);
  const listos = rows.filter((trip) => !pendientesDelMovimiento(trip).length);

  const fila = (trip: (typeof rows)[number]) => {
    const faltan = pendientesDelMovimiento(trip);
    return <Button key={trip.id} type="button" className="flex w-full justify-between gap-4 rounded-none border-0 bg-transparent p-4 text-left" onClick={() => openTrip(trip)}>
      <span className="grid min-w-0 gap-2">
        <span className="flex flex-wrap items-center gap-2"><strong>{personName(trip.person_id)}</strong><StatusPill status={trip.status} /></span>
        <small>{formatDate(trip.date)} · {trip.requested_time?.slice(0, 5) || "Hora por confirmar"} · {trip.direction === "SUBIDA" ? "Subida" : "Bajada"} · {trip.origin} → {trip.destination}</small>
        <span className={faltan.length ? "text-caption text-warning" : "text-caption text-success"}>
          {faltan.length ? faltan.join(" · ") : `Reserva ${trip.pnr} · hora y equipaje registrados`}
        </span>
      </span>
      <ChevronRight className="shrink-0 text-muted" size={18} />
    </Button>;
  };

  return (
    <section className="mb-4" aria-labelledby="handoff-title">
      <header className="mb-2">
        <h2 id="handoff-title" className="text-heading">Entrega de coordinación</h2>
        <p className="mt-1 text-meta">
          {rows.length === 0
            ? "Hoy y mañana no hay movimientos activos."
            : pendientes.length === 0
              ? `Hoy y mañana · ${rows.length === 1 ? "el movimiento tiene" : `los ${rows.length} movimientos tienen`} reserva, hora y equipaje.`
              : `Hoy y mañana · ${pendientes.length} con datos pendientes.`}
        </p>
      </header>
      {pendientes.length > 0 && <div className="divide-y divide-line rounded-md border border-line bg-surface">
        {pendientes.map(fila)}
      </div>}
      {listos.length > 0 && <details className="group mt-2 rounded-md border border-line bg-surface">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-meta font-semibold text-foreground-soft [&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--focus)]">
          {listos.length === 1 ? "1 movimiento listo" : `${listos.length} movimientos listos`}
          <ChevronRight className="text-muted transition-transform duration-[180ms] ease-[var(--ease-out)] group-open:rotate-90" size={18} aria-hidden="true" />
        </summary>
        <div className="divide-y divide-line border-t border-line">{listos.map(fila)}</div>
      </details>}
    </section>
  );
}
