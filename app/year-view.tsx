"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
} from "lucide-react";
import { addDays } from "../lib/calendar";
import type { Person, Trip } from "../lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { FilterPills } from "@/components/ui/filter-pills";
import { SectionKicker } from "@/components/ui/section-kicker";
import { ShiftBadge, tonoDeJornada } from "@/components/ui/shift-badge";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";

// El día del calendario, sin los estados. Se arma fuera del componente porque
// se repite treinta veces por mes y no cambia nunca.
const DIA = [
  "relative flex min-h-[78px] min-w-11 flex-col items-stretch justify-between",
  "gap-[7px] overflow-hidden rounded-[10px] border-line p-[9px] text-left",
  "active:scale-100",
  "bg-[color-mix(in_srgb,var(--surface-raised)_70%,var(--bg))] text-foreground-soft",
  "raton:hover:not-disabled:border-foreground-soft raton:hover:not-disabled:bg-surface-hover",
  "max-[760px]:min-h-[66px] max-[760px]:rounded-sm max-[760px]:px-[5px] max-[760px]:py-[7px]",
].join(" ");

// La raya de arriba que marca el día de hoy.
const HOY = [
  "after:absolute after:inset-x-0 after:top-0 after:h-0.5",
  "after:bg-[var(--focus)] after:content-['']",
].join(" ");

type CalendarProps = {
  selected: string | null;
  onSelect: (date: string | null) => void;
  trips: Trip[];
  people: Person[];
  onTrip: (id: string) => void;
  onAdd: (date: string) => void;
  month: string;
  onMonthChange: (month: string) => void;
  shift: string;
  onShiftChange: (shift: string) => void;
};

const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const shifts = ["Todos", "4×3", "10×10", "Sin turno", "Por confirmar"];

const localToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());

const longDate = (date: string) =>
  new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date + "T12:00Z"));

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(month + "-01T12:00Z"));

export default function YearView({
  trips,
  people,
  onTrip,
  onAdd,
  selected,
  onSelect,
  month,
  onMonthChange,
  shift,
  onShiftChange,
}: CalendarProps) {
  const detailRef = useRef<HTMLElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [currentDay, setCurrentDay] = useState(localToday);
  const keyboardSelection = useRef(false);
  const [focusedDate, setFocusedDate] = useState(() => {
    const today = localToday();
    return today.startsWith(month) ? today : `${month}-01`;
  });
  const [focusRequest, setFocusRequest] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentDay(localToday()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (selected && !selected.startsWith(month)) {
      onMonthChange(selected.slice(0, 7));
    }
  }, [month, onMonthChange, selected]);

  useEffect(() => {
    setFocusedDate((previous) => {
      if (selected?.startsWith(month)) return selected;
      if (previous.startsWith(month)) return previous;
      return currentDay.startsWith(month) ? currentDay : `${month}-01`;
    });
  }, [currentDay, month, selected]);

  useEffect(() => {
    if (!focusRequest || !focusRequest.startsWith(month)) return;
    const frame = requestAnimationFrame(() => {
      const day = calendarRef.current?.querySelector<HTMLButtonElement>(
        `[data-calendar-date="${focusRequest}"]`,
      );
      if (!day) return;
      day.focus({ preventScroll: true });
      day.scrollIntoView({
        behavior: "auto",
        block: "nearest",
        inline: "nearest",
      });
      setFocusRequest(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest, month]);

  useEffect(() => {
    if (!selected || keyboardSelection.current || !window.matchMedia("(max-width: 1119px)").matches) return;
    const frame = requestAnimationFrame(() => {
      const detail = detailRef.current;
      if (!detail) return;
      const bounds = detail.getBoundingClientRect();
      if (bounds.top >= 72 && bounds.top < window.innerHeight - 96) return;
      detail.scrollIntoView({ behavior: "auto", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [selected]);

  const members = useMemo(
    () => new Map(people.map((person) => [person.id, person])),
    [people],
  );

  const byDay = useMemo(() => {
    const result = new Map<string, Trip[]>();
    for (const trip of trips) {
      const memberShift = members.get(trip.person_id)?.shift;
      if (
        trip.status === "Anulado" ||
        (shift !== "Todos" && memberShift !== shift)
      ) {
        continue;
      }
      const rows = result.get(trip.date) ?? [];
      rows.push(trip);
      result.set(trip.date, rows);
    }
    return result;
  }, [trips, members, shift]);

  const monthStart = month + "-01";
  const gap = (new Date(monthStart + "T12:00Z").getUTCDay() + 6) % 7;
  const monthEnd = new Date(monthStart + "T12:00Z");
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  monthEnd.setUTCDate(0);
  const length = monthEnd.getUTCDate();
  const numberOfWeeks = Math.ceil((gap + length) / 7);

  const monthRows = [...byDay].filter(([date]) => date.startsWith(month));
  const monthTrips = monthRows.flatMap(([, rows]) => rows);
  const distinctPeople = new Set(monthTrips.map((trip) => trip.person_id)).size;
  const rows = selected ? (byDay.get(selected) ?? []) : [];

  function navigateMonth(next: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(next)) return;
    onMonthChange(next);
    setFocusedDate(currentDay.startsWith(next) ? currentDay : `${next}-01`);
    onSelect(null);
  }

  function moveMonth(delta: number) {
    const next = new Date(month + "-01T12:00Z");
    next.setUTCMonth(next.getUTCMonth() + delta);
    if (next.getUTCFullYear() < 1 || next.getUTCFullYear() > 9999) return;
    navigateMonth(next.toISOString().slice(0, 7));
  }

  function goToday() {
    const date = localToday();
    setCurrentDay(date);
    onMonthChange(date.slice(0, 7));
    setFocusedDate(date);
    onSelect(date);
  }

  function shiftDateByMonth(date: string, delta: number) {
    const cursor = new Date(date + "T12:00Z");
    const day = cursor.getUTCDate();
    cursor.setUTCDate(1);
    cursor.setUTCMonth(cursor.getUTCMonth() + delta);
    if (cursor.getUTCFullYear() < 1 || cursor.getUTCFullYear() > 9999) {
      return null;
    }
    const lastDay = new Date(cursor);
    lastDay.setUTCMonth(lastDay.getUTCMonth() + 1);
    lastDay.setUTCDate(0);
    cursor.setUTCDate(Math.min(day, lastDay.getUTCDate()));
    return cursor.toISOString().slice(0, 10);
  }

  function requestDayFocus(date: string | null) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const targetYear = Number(date.slice(0, 4));
    if (targetYear < 1 || targetYear > 9999) return;
    const nextMonth = date.slice(0, 7);
    setFocusedDate(date);
    setFocusRequest(date);
    if (nextMonth !== month) {
      onMonthChange(nextMonth);
      onSelect(null);
    }
  }

  function handleDayKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    date: string,
  ) {
    let target: string | null = null;
    const weekday = (new Date(date + "T12:00Z").getUTCDay() + 6) % 7;

    switch (event.key) {
      case "ArrowLeft":
        target = addDays(date, -1);
        break;
      case "ArrowRight":
        target = addDays(date, 1);
        break;
      case "ArrowUp":
        target = addDays(date, -7);
        break;
      case "ArrowDown":
        target = addDays(date, 7);
        break;
      case "Home":
        target = addDays(date, -weekday);
        break;
      case "End":
        target = addDays(date, 6 - weekday);
        break;
      case "PageUp":
        target = shiftDateByMonth(date, event.shiftKey ? -12 : -1);
        break;
      case "PageDown":
        target = shiftDateByMonth(date, event.shiftKey ? 12 : 1);
        break;
      default:
        return;
    }

    event.preventDefault();
    requestDayFocus(target);
  }

  function countsFor(date: string) {
    const dayTrips = byDay.get(date) ?? [];
    return {
      total: dayTrips.length,
      fourByThree: dayTrips.filter(
        (trip) => members.get(trip.person_id)?.shift === "4×3",
      ).length,
      tenByTen: dayTrips.filter(
        (trip) => members.get(trip.person_id)?.shift === "10×10",
      ).length,
      withoutShift: dayTrips.filter(
        (trip) => members.get(trip.person_id)?.shift === "Sin turno",
      ).length,
      pending: dayTrips.filter(
        (trip) => members.get(trip.person_id)?.shift === "Por confirmar",
      ).length,
    };
  }

  function renderCalendarDay(index: number) {
    const date = addDays(monthStart, index);
    const counts = countsFor(date);
    const isToday = date === currentDay;
    const isSelected = date === selected;
    const weekday = new Date(date + "T12:00Z").getUTCDay();
    const shiftDescription = [
      counts.fourByThree ? `${counts.fourByThree} de turno 4 por 3` : "",
      counts.tenByTen ? `${counts.tenByTen} de turno 10 por 10` : "",
      counts.withoutShift ? `${counts.withoutShift} sin turno` : "",
      counts.pending ? `${counts.pending} con turno por confirmar` : "",
    ]
      .filter(Boolean)
      .join(", ");

    return (
      <Button
        type="button"
        role="gridcell"
        key={date}
        data-calendar-date={date}
        tabIndex={focusedDate === date ? 0 : -1}
        aria-label={
          `${longDate(date)}: ${counts.total} ${counts.total === 1 ? "viaje" : "viajes"}` +
          (shiftDescription ? `, ${shiftDescription}` : "") +
          (isToday ? ", hoy" : "")
        }
        aria-current={isToday ? "date" : undefined}
        aria-selected={isSelected}
        // El orden importa: la última clase de fondo o de borde gana, igual
        // que ganaba la última regla del CSS. Fin de semana primero, después
        // "tiene viajes", y al final el borde del día elegido.
        className={cn(
          DIA,
          (weekday === 0 || weekday === 6) &&
            "bg-[color-mix(in_srgb,var(--surface-soft)_58%,var(--surface))]",
          counts.total && "border-line-strong bg-surface-raised",
          isToday && HOY,
          isSelected &&
            "border-foreground shadow-[inset_0_0_0_1px_var(--text)]",
        )}
        onFocus={() => setFocusedDate(date)}
        onKeyDown={(event) => handleDayKeyDown(event, date)}
        onClick={(event) => {
          keyboardSelection.current = event.detail === 0;
          onSelect(isSelected ? null : date);
        }}
      >
        <span className="flex items-center justify-between gap-[5px]">
          <strong className="text-[15px] leading-none text-foreground max-[430px]:text-[14px] tabular-nums">
            {index + 1}
          </strong>
          {isToday ? (
            <em className="rounded-[999px] bg-[color-mix(in_srgb,var(--focus)_15%,transparent)] px-[5px] py-[2px] text-[8px] font-extrabold text-[var(--focus)] uppercase not-italic max-[760px]:hidden">
              Hoy
            </em>
          ) : null}
        </span>
        <span className="flex items-center justify-start gap-[5px]">
          {counts.total ? (
            <>
              <b className="text-[15px] text-foreground max-[760px]:text-[13px]">
                {counts.total}
              </b>
              <small className="text-[9px] max-[760px]:hidden">
                {counts.total === 1 ? "viaje" : "viajes"}
              </small>
            </>
          ) : null}
        </span>
        {counts.total ? (
          <span className="flex flex-wrap gap-[3px]" aria-hidden="true">
            {counts.fourByThree ? (
              <ShiftBadge tono="four" tamano="chica">
                4×3
              </ShiftBadge>
            ) : null}
            {counts.tenByTen ? (
              <ShiftBadge tono="ten" tamano="chica">
                10×10
              </ShiftBadge>
            ) : null}
            {counts.withoutShift ? (
              <ShiftBadge tono="manual" tamano="chica">
                <span className="max-[760px]:hidden">Sin turno</span>
                <span className="hidden max-[760px]:inline">S/T</span>
              </ShiftBadge>
            ) : null}
            {counts.pending ? (
              <ShiftBadge tono="pending" tamano="chica">
                <span className="max-[760px]:hidden">Por confirmar</span>
                <span className="hidden max-[760px]:inline">?</span>
              </ShiftBadge>
            ) : null}
          </span>
        ) : null}
      </Button>
    );
  }

  return (
    <section
      className="overflow-hidden rounded-lg border border-line bg-surface shadow-[0_1px_0_rgba(255,255,255,0.02)]"
      aria-labelledby="calendar-title"
    >
      <header className="flex items-end justify-between gap-7 border-b border-line px-[22px] pt-[22px] pb-[18px] max-[820px]:flex-col max-[820px]:items-start max-[760px]:gap-3 max-[760px]:px-[14px] max-[760px]:pt-[18px] max-[760px]:pb-[14px]">
        <div>
          <SectionKicker className="max-[760px]:hidden">Planificación mensual</SectionKicker>
          <h2
            id="calendar-title"
            className="text-[clamp(22px,2.5vw,31px)] leading-[1.1] tracking-[-0.035em] text-foreground first-letter:uppercase"
          >
            {monthLabel(month)}
          </h2>
          <p className="mt-[7px] text-[13px] text-muted">
            {monthTrips.length
              ? `${monthTrips.length} ${monthTrips.length === 1 ? "viaje" : "viajes"} de ${distinctPeople} ${distinctPeople === 1 ? "persona" : "personas"}.`
              : "Todavía no hay viajes programados para este mes."}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-[9px] max-[820px]:w-full max-[820px]:justify-between">
          <FilterPills
            label="Filtrar calendario por turno"
            variante="jornadas"
            opciones={shifts}
            valor={shift}
            onCambio={onShiftChange}
          />

          <div className="flex items-center gap-[3px] rounded-[10px] border border-line bg-bg p-[3px] max-[760px]:w-full">
            <Button
              type="button"
              variant="icon"
              className="border-0 bg-transparent"
              aria-label="Mes anterior"
              onClick={() => moveMonth(-1)}
            >
              <ChevronLeft size={18} />
            </Button>
            <Input
              className="w-[190px] border-0 bg-transparent px-[9px] py-[6px] text-[13px] font-bold max-[760px]:w-[100px] max-[760px]:flex-1"
              aria-label="Ir a mes y año"
              type="month"
              min="0001-01"
              max="9999-12"
              value={month}
              onChange={(event) => navigateMonth(event.target.value)}
            />
            <Button
              type="button"
              variant="icon"
              className="border-0 bg-transparent"
              aria-label="Mes siguiente"
              onClick={() => moveMonth(1)}
            >
              <ChevronRight size={18} />
            </Button>
            <Button
              type="button"
              className="ml-[2px] border-line-strong bg-surface-soft"
              onClick={goToday}
            >
              Hoy
            </Button>
          </div>
        </div>
      </header>

      <div
        className="flex min-h-11 flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-[22px] py-[10px] text-[11px] text-muted max-[760px]:px-[14px]"
        aria-label="Leyenda del calendario"
      >
        <span className="inline-flex items-center gap-[7px] max-[760px]:hidden">
          <i className="inline-block size-[9px] flex-none rounded-[3px] bg-four" />{" "}
          4×3
        </span>
        <span className="inline-flex items-center gap-[7px] max-[760px]:hidden">
          <i className="inline-block size-[9px] flex-none rounded-[3px] bg-ten" />{" "}
          10×10
        </span>
        <span className="inline-flex items-center gap-[7px] max-[760px]:hidden">
          <i className="inline-block size-[9px] flex-none rounded-[3px] border border-line-strong bg-surface-raised" />{" "}
          Sin turno
        </span>
        <span className="inline-flex items-center gap-[7px] max-[760px]:hidden">
          <i className="inline-block size-[9px] flex-none rounded-[3px] border border-line-strong bg-muted" />{" "}
          Por confirmar
        </span>
        <span className="inline-flex items-center gap-[7px]">
          <CalendarDays size={14} /> Total de viajes bajo cada fecha
        </span>
      </div>

      <p id="calendar-keyboard-help" className="sr-only">
        Usa las flechas para recorrer los días, Inicio y Fin para moverte dentro
        de la semana, y Avance o Retroceso de página para cambiar de mes.
      </p>

      <div className={cn("grid items-start", selected && "min-[1120px]:grid-cols-[minmax(0,1fr)_360px]")}>
      <div>
      <div
        className="overflow-x-auto overscroll-x-contain px-[18px] pt-4 pb-[18px] [scrollbar-width:thin] max-[760px]:px-[7px] max-[760px]:pt-3 max-[760px]:pb-[14px]"
        role="region"
        aria-label={`Calendario de ${monthLabel(month)}`}
      >
        <div
          ref={calendarRef}
          className="grid min-w-[346px] grid-cols-[repeat(7,minmax(44px,1fr))] gap-[6px] max-[760px]:gap-1"
          role="grid"
          aria-labelledby="calendar-title"
          aria-describedby="calendar-keyboard-help"
        >
          <div
            role="row"
            style={{ display: "contents" }}
          >
            {weekdays.map((day) => (
              <span
                className="px-[5px] pt-[2px] pb-[7px] text-right text-[10px] font-[750] text-muted uppercase"
                role="columnheader"
                key={day}
              >
                {day}
              </span>
            ))}
          </div>
          {Array.from({ length: numberOfWeeks }, (_, weekIndex) => (
            <div
              role="row"
              style={{ display: "contents" }}
              key={weekIndex}
            >
              {Array.from({ length: 7 }, (_, columnIndex) => {
                const dayIndex = weekIndex * 7 + columnIndex - gap;
                return dayIndex >= 0 && dayIndex < length ? (
                  renderCalendarDay(dayIndex)
                ) : (
                  <span
                    className="min-h-[78px] border border-transparent max-[760px]:min-h-[66px]"
                    role="gridcell"
                    aria-disabled="true"
                    aria-label="Fuera del mes"
                    key={`gap-${weekIndex}-${columnIndex}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <footer className="flex min-h-[50px] items-center gap-6 border-t border-line px-[22px] py-[11px] text-[11px] text-muted max-[760px]:flex-wrap max-[760px]:items-start max-[760px]:gap-x-[18px] max-[760px]:gap-y-[7px] max-[760px]:px-[14px]">
        <span>
          <strong className="mr-1 text-[14px] text-foreground">
            {monthRows.length}
          </strong>{" "}
          {monthRows.length === 1
            ? "día con movimiento"
            : "días con movimiento"}
        </span>
        <small className="ml-auto text-right max-[760px]:ml-0 max-[760px]:w-full max-[760px]:text-left">
          Los viajes anulados no se muestran. Los turnos 4×3 y 10×10 se generan
          desde Planificar turnos; los viajes sin turno se agregan manualmente.
        </small>
      </footer>
      </div>

      {selected ? (
        <section
          ref={detailRef}
          className="row-start-1 border-b border-line bg-surface-soft scroll-mt-[140px] min-[1120px]:sticky min-[1120px]:top-[86px] min-[1120px]:col-start-2 min-[1120px]:border-b-0 min-[1120px]:border-l min-[1120px]:self-stretch"
          aria-live="polite"
        >
          <header className="flex flex-col items-stretch gap-4 border-b border-line px-[18px] py-4 max-[760px]:px-[14px]">
            <div>
              <SectionKicker>Día seleccionado</SectionKicker>
              <h3 className="text-[20px] leading-[1.2] tracking-[-0.025em] text-foreground first-letter:uppercase">
                {longDate(selected)}
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
                onClick={() => onAdd(selected)}
              >
                <Plus size={17} /> Agregar viaje
              </Button>
              <Button
                type="button"
                variant="icon"
                aria-label="Cerrar detalle del día"
                onClick={() => {
                  onSelect(null);
                  requestDayFocus(selected);
                }}
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
      ) : (
        <p className="border-t border-line px-[22px] py-[13px] text-center text-[12px] text-muted">
          Selecciona un día para ver personas, horarios y reservas.
        </p>
      )}
      </div>
    </section>
  );
}
