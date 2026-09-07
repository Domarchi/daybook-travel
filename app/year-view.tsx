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

type Travel = {
  id: string;
  date: string;
  person_id: string;
  direction: string;
  origin: string;
  destination: string;
  status: string;
  requested_time: string | null;
};

type Member = {
  id: string;
  name: string;
  shift: string;
};

type CalendarProps = {
  selected: string | null;
  onSelect: (date: string | null) => void;
  trips: Travel[];
  people: Member[];
  onTrip: (id: string) => void;
  onAdd: (date: string) => void;
  month: string;
  onMonthChange: (month: string) => void;
};

const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const shifts = ["Todos", "4×3", "10×10"];

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
}: CalendarProps) {
  const detailRef = useRef<HTMLElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [currentDay, setCurrentDay] = useState(localToday);
  const [shift, setShift] = useState("Todos");
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
    if (!selected || !window.matchMedia("(max-width: 760px)").matches) return;
    const frame = requestAnimationFrame(() => {
      const detail = detailRef.current;
      if (!detail) return;
      const bounds = detail.getBoundingClientRect();
      if (bounds.top >= 72 && bounds.top < window.innerHeight - 96) return;
      detail.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [selected]);

  const members = useMemo(
    () => new Map(people.map((person) => [person.id, person])),
    [people],
  );

  const byDay = useMemo(() => {
    const result = new Map<string, Travel[]>();
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
    ]
      .filter(Boolean)
      .join(", ");

    return (
      <button
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
        className={[
          "calendar-day",
          counts.total ? "has-trips" : "",
          counts.fourByThree ? "has-four" : "",
          counts.tenByTen ? "has-ten" : "",
          weekday === 0 || weekday === 6 ? "weekend" : "",
          isToday ? "current-day" : "",
          isSelected ? "selected-day" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onFocus={() => setFocusedDate(date)}
        onKeyDown={(event) => handleDayKeyDown(event, date)}
        onClick={() => onSelect(isSelected ? null : date)}
      >
        <span className="calendar-day-top">
          <strong>{index + 1}</strong>
          {isToday ? <em>Hoy</em> : null}
        </span>
        <span className="calendar-day-count">
          {counts.total ? (
            <>
              <b>{counts.total}</b>
              <small>{counts.total === 1 ? "viaje" : "viajes"}</small>
            </>
          ) : (
            <small>Sin viajes</small>
          )}
        </span>
        {counts.total ? (
          <span className="calendar-shifts" aria-hidden="true">
            {counts.fourByThree ? (
              <span className="shift-tag four">
                4×3 <b>{counts.fourByThree}</b>
              </span>
            ) : null}
            {counts.tenByTen ? (
              <span className="shift-tag ten">
                10×10 <b>{counts.tenByTen}</b>
              </span>
            ) : null}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <section className="calendar-section" aria-labelledby="calendar-title">
      <header className="calendar-header">
        <div className="calendar-title">
          <span className="section-kicker">Planificación mensual</span>
          <h2 id="calendar-title">{monthLabel(month)}</h2>
          <p>
            {monthTrips.length
              ? `${monthTrips.length} ${monthTrips.length === 1 ? "viaje" : "viajes"} de ${distinctPeople} ${distinctPeople === 1 ? "persona" : "personas"}.`
              : "Todavía no hay viajes programados para este mes."}
          </p>
        </div>

        <div className="calendar-actions">
          <div
            className="shift-filter"
            aria-label="Filtrar calendario por turno"
          >
            {shifts.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={shift === option}
                className={shift === option ? "active" : ""}
                onClick={() => setShift(option)}
              >
                {option === "Todos" ? "Todos" : option}
              </button>
            ))}
          </div>

          <div className="month-navigation">
            <button
              type="button"
              className="icon-button"
              aria-label="Mes anterior"
              onClick={() => moveMonth(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <input
              aria-label="Ir a mes y año"
              type="month"
              min="0001-01"
              max="9999-12"
              value={month}
              onChange={(event) => navigateMonth(event.target.value)}
            />
            <button
              type="button"
              className="icon-button"
              aria-label="Mes siguiente"
              onClick={() => moveMonth(1)}
            >
              <ChevronRight size={18} />
            </button>
            <button type="button" className="today-button" onClick={goToday}>
              Hoy
            </button>
          </div>
        </div>
      </header>

      <div className="calendar-key" aria-label="Leyenda del calendario">
        <span>
          <i className="shift-dot four" /> 4×3
        </span>
        <span>
          <i className="shift-dot ten" /> 10×10
        </span>
        <span>
          <CalendarDays size={14} /> El número indica la cantidad de viajes
        </span>
      </div>

      <p id="calendar-keyboard-help" className="sr-only">
        Usa las flechas para recorrer los días, Inicio y Fin para moverte dentro
        de la semana, y Avance o Retroceso de página para cambiar de mes.
      </p>

      <div
        className="calendar-scroll"
        role="region"
        aria-label={`Calendario de ${monthLabel(month)}`}
      >
        <div
          ref={calendarRef}
          className="calendar-grid"
          role="grid"
          aria-labelledby="calendar-title"
          aria-describedby="calendar-keyboard-help"
        >
          <div
            className="calendar-week"
            role="row"
            style={{ display: "contents" }}
          >
            {weekdays.map((day) => (
              <span className="calendar-weekday" role="columnheader" key={day}>
                {day}
              </span>
            ))}
          </div>
          {Array.from({ length: numberOfWeeks }, (_, weekIndex) => (
            <div
              className="calendar-week"
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
                    className="calendar-gap"
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

      <footer className="calendar-summary">
        <span>
          <strong>{monthRows.length}</strong>{" "}
          {monthRows.length === 1
            ? "día con movimiento"
            : "días con movimiento"}
        </span>
        <span>
          <strong>{monthTrips.length}</strong>{" "}
          {monthTrips.length === 1 ? "viaje programado" : "viajes programados"}
        </span>
        <small>
          Los viajes anulados no se muestran. El 10×10 usa las fechas
          registradas manualmente.
        </small>
      </footer>

      {selected ? (
        <section ref={detailRef} className="day-detail" aria-live="polite">
          <header className="day-detail-head">
            <div>
              <span className="section-kicker">Día seleccionado</span>
              <h3>{longDate(selected)}</h3>
              <p>
                {rows.length
                  ? `${rows.length} ${rows.length === 1 ? "viaje programado" : "viajes programados"}`
                  : "Sin movimientos registrados"}
              </p>
            </div>
            <div className="day-detail-actions">
              <button
                type="button"
                className="primary"
                onClick={() => onAdd(selected)}
              >
                <Plus size={17} /> Agregar viaje
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Cerrar detalle del día"
                onClick={() => onSelect(null)}
              >
                <X size={18} />
              </button>
            </div>
          </header>

          {rows.length ? (
            <div className="day-travellers">
              {rows.map((trip) => {
                const member = members.get(trip.person_id);
                const isUp = trip.direction === "SUBIDA";
                const directionLabel = isUp ? "Subida" : "Bajada";
                return (
                  <button
                    type="button"
                    key={trip.id}
                    onClick={() => onTrip(trip.id)}
                  >
                    <span
                      className={"travel-arrow " + (isUp ? "up" : "down")}
                      aria-hidden="true"
                    >
                      {isUp ? (
                        <ArrowUpRight size={19} />
                      ) : (
                        <ArrowDownLeft size={19} />
                      )}
                    </span>
                    <span className="day-person">
                      <strong>{member?.name ?? "Persona"}</strong>
                      <small>
                        <span
                          className={
                            "direction-label " + (isUp ? "up" : "down")
                          }
                        >
                          {directionLabel}
                        </span>{" "}
                        · {trip.origin} → {trip.destination}
                      </small>
                    </span>
                    <span className="day-trip-time">
                      <strong>
                        {trip.requested_time?.slice(0, 5) || "Hora pendiente"}
                      </strong>
                      <small>Turno {member?.shift ?? "sin definir"}</small>
                    </span>
                    <span
                      className={
                        "status-pill " + trip.status.replaceAll(" ", "")
                      }
                    >
                      {trip.status}
                    </span>
                    <ChevronRight className="row-chevron" size={17} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="day-empty">
              <CalendarDays size={20} />
              <span>
                <strong>Este día está libre</strong>
                <small>
                  Agrega un viaje si necesitas registrar un movimiento.
                </small>
              </span>
            </div>
          )}
        </section>
      ) : (
        <p className="calendar-instruction">
          Selecciona un día para ver personas, horarios y reservas.
        </p>
      )}
    </section>
  );
}
