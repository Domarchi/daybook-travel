"use client";

import DocumentTypesPanel from "@/components/document-types-panel";
import EmptyState from "@/components/ui/empty-state";
import { ArrowUpRight, CalendarDays, ChevronRight, Ellipsis, FileSpreadsheet, Search, UserPlus, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatDate } from "../lib/format";
import { idsConNombreRepetido } from "../lib/personas-repetidas";
import { Button } from "@/components/ui/button";
import { FilterPills } from "@/components/ui/filter-pills";
import { ShiftBadge, tonoDeJornada } from "@/components/ui/shift-badge";
import { useApp } from "../app/store";

export default function PeopleView() {
  const {
    clearMessages,
    openGenerate,
    openPerson,
    openTrip,
    people,
    peopleFilter,
    peopleQuery: query,
    abrirModal,
    setPeopleFilter,
    setPeopleQuery: setQuery,
    showPersonTrips,
    visiblePeople,
  } = useApp();

  // Fichas que comparten nombre con otra. Se marcan en la lista para que se vean
  // sin tener que abrirlas (ver lib/personas-repetidas.ts).
  const repetidas = useMemo(() => idsConNombreRepetido(people), [people]);

  return (
    <section aria-labelledby="people-results">
      <DocumentTypesPanel />
      <div className="mb-[10px] flex flex-wrap items-center gap-2 max-[760px]:flex-col max-[760px]:items-stretch">
        <label className="flex min-h-[46px] min-w-[min(100%,300px)] flex-[1_1_320px] items-center gap-[9px] rounded-sm border border-line-strong bg-surface px-3 text-meta font-semibold text-muted max-[760px]:w-full max-[760px]:flex-[0_0_auto]">
          <Search size={18} aria-hidden="true" />
          <input
            className="min-h-[42px] w-full min-w-0 border-0 bg-transparent p-0 text-foreground shadow-none outline-0 placeholder:text-muted placeholder:opacity-80"
            aria-label="Buscar personas"
            placeholder="Buscar nombre, ciudad o turno…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <FilterPills
          label="Filtrar personas"
          opciones={[
            "Activas",
            "4×3",
            "10×10",
            "Sin turno",
            "Por confirmar",
            "Inactivas",
            "Todas",
          ]}
          valor={peopleFilter}
          onCambio={setPeopleFilter}
        />
        <Button type="button" onClick={() => openGenerate()}>
          <CalendarDays size={18} />
          Planificar turnos
        </Button>
        <MenuMas
          onExcel={() => {
            clearMessages();
            abrirModal("excel");
          }}
        />
      </div>
      <div
        className="mb-[6px] flex min-h-7 items-center justify-between gap-[14px] text-caption text-muted"
        id="people-results"
        aria-live="polite"
      >
        <span>
          {visiblePeople.length} de {people.length} personas
        </span>
        {(query || peopleFilter !== "Activas") &&
          visiblePeople.length > 0 && (
            <Button
              type="button"
              className="border-transparent bg-transparent px-[10px]"
              onClick={() => {
                setQuery("");
                setPeopleFilter("Activas");
              }}
            >
              Limpiar filtros
            </Button>
          )}
      </div>

      {visiblePeople.length ? (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          {visiblePeople.map((person, index) => (
            <article
              className="grid min-h-[106px] grid-cols-[42px_minmax(210px,1.25fr)_minmax(190px,0.9fr)_minmax(150px,0.55fr)_auto] items-center gap-[18px] border-b border-line px-[18px] py-[17px] last:border-b-0 max-[1120px]:grid-cols-[36px_minmax(190px,1.2fr)_minmax(170px,0.8fr)_minmax(130px,0.55fr)] max-[760px]:grid-cols-[28px_minmax(0,1fr)] max-[760px]:gap-3 max-[760px]:px-[14px] max-[760px]:py-[15px]"
              key={person.id}
            >
              <span className="text-overline text-muted tabular-nums" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="grid min-w-0 gap-[5px] max-[760px]:col-start-2">
                <div className="flex items-center gap-[9px]">
                  <h2 className="overflow-hidden text-emphasis leading-[1.25] tracking-[-0.02em] text-ellipsis whitespace-nowrap text-foreground">
                    {person.name}
                  </h2>
                  <span
                    className={
                      "shrink-0 text-overline font-extrabold tracking-[0.04em] uppercase " +
                      (person.active ? "text-success" : "text-muted")
                    }
                  >
                    {person.active ? "Activa" : "Inactiva"}
                  </span>
                </div>
                {/* La marca va abajo y no junto al nombre, para no recortarlo. */}
                <div className="flex flex-wrap items-center gap-[7px]">
                  <small>{person.baggage}</small>
                  {repetidas.has(person.id) && (
                    <span className="shrink-0 rounded-pill border border-urgente-line bg-urgente-soft px-[6px] py-px text-overline font-extrabold tracking-[0.04em] text-warning uppercase">
                      Nombre repetido
                    </span>
                  )}
                </div>
              </div>
              <div className="grid min-w-0 gap-[5px] max-[760px]:col-start-2">
                <small>Ruta habitual</small>
                <span className="flex items-center gap-1 overflow-hidden text-meta text-ellipsis whitespace-nowrap text-foreground-soft">
                  {person.origin} <ChevronRight size={15} />{" "}
                  {person.destination}
                </span>
              </div>
              <div className="grid min-w-0 gap-[5px] max-[760px]:col-start-2">
                <ShiftBadge tono={tonoDeJornada(person.shift)}>
                  {person.shift === "Sin turno"
                    ? "Sin turno"
                    : `Turno ${person.shift}`}
                </ShiftBadge>
                <small>Desde {formatDate(person.start_date)}</small>
              </div>
              <div className="flex items-center justify-end gap-[6px] max-[1120px]:col-[2/-1] max-[1120px]:justify-start max-[760px]:col-start-2 max-[760px]:grid max-[760px]:w-full max-[760px]:grid-cols-2 max-[430px]:grid-cols-1">
                {person.active && (
                  <Button
                    type="button"
                    className="px-[10px] max-[760px]:col-span-2 max-[430px]:col-auto"
                    onClick={() => openTrip(null, undefined, person.id)}
                  >
                    <UserPlus size={16} /> Nuevo viaje
                  </Button>
                )}
                <Button
                  type="button"
                  className="px-[10px]"
                  onClick={() => showPersonTrips(person)}
                >
                  Ver viajes
                </Button>
                <Button
                  type="button"
                  className="px-[10px]"
                  aria-label={`Editar a ${person.name}`}
                  onClick={() => openPerson(person)}
                >
                  Editar <ArrowUpRight size={16} />
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Users />}
          title={
            people.length
              ? "No encontramos personas"
              : "Agrega a la primera persona"
          }
          description={
            people.length
              ? "Prueba otra búsqueda o vuelve a las personas activas."
              : "Su ruta, turno y fecha de inicio serán el punto de partida."
          }
          action={
            people.length ? "Limpiar filtros" : "Nueva persona"
          }
          onAction={
            people.length
              ? () => {
                  setQuery("");
                  setPeopleFilter("Activas");
                }
              : () => openPerson()
          }
        />
      )}
    </section>
  );
}

// «Más»: lo ocasional (hoy, Gestionar con Excel) fuera de la barra de todos los
// días. Es un botón que despliega una lista, como «Más» en Parte Diario: se
// cierra con Escape (y el foco vuelve al botón), al tocar fuera o al elegir.
function MenuMas({ onExcel }: { onExcel: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!abierto) return;
    function fuera(evento: PointerEvent) {
      if (!caja.current?.contains(evento.target as Node)) setAbierto(false);
    }
    function tecla(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return;
      setAbierto(false);
      boton.current?.focus();
    }
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);
  return (
    <div ref={caja} className="relative max-[760px]:grid">
      <Button
        ref={boton}
        type="button"
        aria-expanded={abierto}
        // Solo mientras la lista existe: un aria-controls que apunta a nada
        // confunde al lector de pantalla.
        aria-controls={abierto ? "personas-mas" : undefined}
        onClick={() => setAbierto((actual) => !actual)}
      >
        <Ellipsis size={18} aria-hidden="true" />
        Más
      </Button>
      {abierto && (
        <div
          id="personas-mas"
          className="absolute right-0 top-[calc(100%+6px)] z-20 grid min-w-[240px] gap-1 rounded-md border border-line-strong bg-surface-raised p-1 shadow-[0_10px_35px_rgba(0,0,0,0.18)] max-[760px]:left-0"
        >
          <Button
            type="button"
            className="justify-start border-transparent bg-transparent"
            onClick={() => {
              setAbierto(false);
              onExcel();
            }}
          >
            <FileSpreadsheet size={18} />
            Gestionar con Excel
          </Button>
        </div>
      )}
    </div>
  );
}
