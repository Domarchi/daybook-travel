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
  const pendientes = rows.filter((trip) => pendientesDelMovimiento(trip).length).length;

  return (
    <section className="mt-6 border-t border-line pt-5" aria-labelledby="handoff-title">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="handoff-title" className="text-[19px]">Entrega de coordinación</h2>
          <p className="mt-1 text-[13px]">Hoy y mañana · {rows.length} movimientos del proyecto completo, {pendientes} con datos pendientes.</p>
        </div>
        <span className="text-[13px] text-muted">Para coordinar el próximo relevo</span>
      </header>
      {rows.length ? <div className="divide-y divide-line rounded-md border border-line bg-surface">
        {rows.map((trip) => {
          const faltan = pendientesDelMovimiento(trip);
          return <Button key={trip.id} type="button" className="flex w-full justify-between gap-4 rounded-none border-0 bg-transparent p-4 text-left" onClick={() => openTrip(trip)}>
            <span className="grid min-w-0 gap-2">
              <span className="flex flex-wrap items-center gap-2"><strong>{personName(trip.person_id)}</strong><StatusPill status={trip.status} /></span>
              <small>{formatDate(trip.date)} · {trip.requested_time?.slice(0, 5) || "Hora por confirmar"} · {trip.direction === "SUBIDA" ? "Subida" : "Bajada"} · {trip.origin} → {trip.destination}</small>
              <span className={faltan.length ? "text-[12px] text-warning" : "text-[12px] text-success"}>
                {faltan.length ? faltan.join(" · ") : `Reserva ${trip.pnr} · hora y equipaje registrados`}
              </span>
            </span>
            <ChevronRight className="shrink-0 text-muted" size={18} />
          </Button>;
        })}
      </div> : <p className="py-3 text-[13px]">No hay movimientos activos para hoy ni mañana. Revisa el calendario para preparar la siguiente guardia.</p>}
    </section>
  );
}
