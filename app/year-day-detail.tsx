"use client";

// El panel del día seleccionado en la Agenda: sus viajes, con persona, hora,
// turno y estado, y el botón para agregar uno. Vivía dentro de `year-view.tsx`.
import type { RefObject } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Plus,
  X,
} from "lucide-react";
import type { Person, Trip } from "../lib/types";
import { Button } from "@/components/ui/button";
import { SectionKicker } from "@/components/ui/section-kicker";
import { ShiftBadge, tonoDeJornada } from "@/components/ui/shift-badge";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";

export default function YearDayDetail({
  detailRef,
  titulo,
  rows,
  members,
  onAdd,
  onClose,
  onTrip,
}: {
  detailRef: RefObject<HTMLElement | null>;
  /** El día en palabras, "lunes 16 de noviembre de 2026". */
  titulo: string;
  rows: Trip[];
  members: Map<string, Person>;
  onAdd: () => void;
  onClose: () => void;
  onTrip: (id: string) => void;
}) {
  return (
  <section
    ref={detailRef}
    className="row-start-1 border-b border-line bg-surface-soft scroll-mt-[140px] min-[1120px]:sticky min-[1120px]:top-[86px] min-[1120px]:col-start-2 min-[1120px]:border-b-0 min-[1120px]:border-l min-[1120px]:self-stretch"
    aria-live="polite"
  >
    <header className="flex flex-col items-stretch gap-4 border-b border-line px-[18px] py-4 max-[760px]:px-[14px]">
      <div>
        <SectionKicker>Día seleccionado</SectionKicker>
        <h3 className="text-[20px] leading-[1.2] tracking-[-0.025em] text-foreground first-letter:uppercase">
          {titulo}
        </h3>
        <p className="mt-[7px] text-[13px] text-muted">
          {rows.length
            ? `${rows.length} ${rows.length === 1 ? "viaje programado" : "viajes programados"}`
            : "Sin movimientos registrados"}
        </p>
      </div>
      <div className="flex items-center gap-[7px]">
        <Button
          type="button"
          variant="primary"
          className="max-[760px]:flex-1"
          onClick={onAdd}
        >
          <Plus size={17} /> Agregar viaje
        </Button>
        <Button
          type="button"
          variant="icon"
          aria-label="Cerrar detalle del día"
          onClick={onClose}
        >
          <X size={18} />
        </Button>
      </div>
    </header>

    {rows.length ? (
      <div className="grid">
        {rows.map((trip) => {
          const member = members.get(trip.person_id);
          const isUp = trip.direction === "SUBIDA";
          const directionLabel = isUp ? "Subida" : "Bajada";
          return (
            <Button
              type="button"
              key={trip.id}
              className="grid min-h-[100px] grid-cols-[32px_minmax(0,1fr)_18px] items-start gap-x-[10px] gap-y-2 rounded-none border-0 border-b border-line bg-transparent px-[18px] py-[14px] text-left last:border-b-0 max-[760px]:px-[14px]"
              onClick={() => onTrip(trip.id)}
            >
              <span
                className={cn(
                  "inline-flex size-9 items-center justify-center rounded-[9px]",
                  isUp
                    ? "bg-subida-soft text-subida"
                    : "bg-bajada-soft text-bajada",
                )}
                aria-hidden="true"
              >
                {isUp ? (
                  <ArrowUpRight size={19} />
                ) : (
                  <ArrowDownLeft size={19} />
                )}
              </span>
              <span className="grid min-w-0 gap-[2px]">
                <strong className="overflow-hidden text-[13px] text-ellipsis whitespace-nowrap text-foreground">
                  {member?.name ?? "Persona"}
                </strong>
                <small className="text-muted whitespace-normal">
                  <span
                    className={isUp ? "text-subida" : "text-bajada"}
                  >
                    {directionLabel}
                  </span>{" "}
                  · {trip.origin} → {trip.destination}
                </small>
              </span>
              <span className="col-start-2 row-start-2 flex min-w-0 flex-wrap items-center gap-2">
                <strong className="overflow-hidden text-[13px] text-ellipsis whitespace-nowrap text-foreground">
                  {trip.requested_time?.slice(0, 5) || "Hora pendiente"}
                </strong>
                <ShiftBadge tono={tonoDeJornada(member?.shift ?? "")}>
                  {member?.shift ?? "Por confirmar"}
                </ShiftBadge>
              <StatusPill
                status={trip.status}
              />
              </span>
              <ChevronRight
                className="col-start-3 row-start-1 self-center text-muted"
                size={17}
              />
            </Button>
          );
        })}
      </div>
    ) : (
      <div className="flex min-h-24 items-center justify-center gap-3 p-[22px] text-muted">
        <CalendarDays size={20} />
        <span className="grid gap-[2px]">
          <strong className="text-foreground">
            Este día está libre
          </strong>
          <small>
            Agrega un viaje si necesitas registrar un movimiento.
          </small>
        </span>
      </div>
    )}
  </section>
  );
}
