"use client";

import { useRef } from "react";

import EmptyState from "@/components/ui/empty-state";
import { ArrowDownLeft, ArrowUpRight, ClipboardList, Clock, Plane, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { formatDate, localDate } from "../lib/format";
import { TRIP_STATUSES as statuses } from "../lib/types";
import { diasParaVolar } from "../lib/purchase";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Label, Select } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import { TableWrap } from "@/components/ui/table-wrap";
import {
  CASILLA_TOQUE,
  CELDA_ACCIONES,
  CELDA_PRINCIPAL,
  CELDA_SELECCION,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui/data-table";
import { DirectionPill, PurchasePill } from "@/components/ui/trip-pills";
import { useApp } from "../app/store";

// Un boton de la barra de filtros: ancho completo cuando la barra se apila.
const BOTON_BARRA = "max-[760px]:w-full";

// Un filtro encendido se distingue por el borde y el fondo, no por el color del
// texto: el estado tiene que leerse igual en el tema claro y en el oscuro.
const FILTRO_ENCENDIDO = "border-line-strong bg-surface-soft text-foreground";

export default function TripsView() {
  const {
    busy,
    clearTripFilters,
    dateFilter,
    demo,
    openManifest,
    loading,
    markSelectedRequested,
    navigate,
    onlyUpcoming,
    compraDe,
    purchaseFilter,
    setPurchaseFilter,
    openTrip,
    people,
    peopleById,
    personFilter,
    personName,
    query,
    reload,
    requestableTrips,
    selectedTrips,
    setDateFilter,
    setOnlyUpcoming,
    setPeopleFilter,
    setQuery,
    setSelectedTrips,
    setStatusFilter,
    showHistory,
    statusFilter,
    trips,
    visibleTrips,
  } = useApp();

  // La cuenta que muestra la barra. Mientras se cierra, el número real ya es 0
  // y se leería "0 viajes seleccionados" encogiéndose; se conserva el último.
  const ultimaCuenta = useRef(0);
  if (selectedTrips.length) ultimaCuenta.current = selectedTrips.length;
  const cuentaSeleccion = selectedTrips.length || ultimaCuenta.current;

  const hasTripFilters =
    Boolean(query) ||
    Boolean(dateFilter) ||
    statusFilter !== "Todos" ||
    Boolean(personFilter) ||
    purchaseFilter !== "todos" ||
    !onlyUpcoming;

  return (
    <section aria-labelledby="trip-results">
      {personFilter && peopleById.get(personFilter) && (
        <div className="mb-[10px] flex min-h-12 items-center justify-between gap-4 rounded-md border border-line bg-surface py-[7px] pr-[9px] pl-[14px] text-[13px] text-foreground-soft max-[760px]:flex-col max-[760px]:items-stretch max-[760px]:p-3">
          <span>
            Viajes de <strong>{personName(personFilter)}</strong>
          </span>
          <Button
            type="button"
            onClick={() => {
              const person = peopleById.get(personFilter);
              navigate("Personas");
              if (person) {
                setPeopleFilter("Todas");
                setQuery(person.name);
              }
            }}
          >
            Volver a la persona
          </Button>
        </div>
      )}
      <div className="mb-[10px] flex flex-wrap items-center gap-2 max-[760px]:flex-col max-[760px]:items-stretch">
        <label className="flex min-h-[46px] min-w-[min(100%,300px)] flex-[1_1_320px] items-center gap-[9px] rounded-sm border border-line-strong bg-surface px-3 text-[13px] font-[650] text-muted max-[760px]:w-full max-[760px]:flex-[0_0_auto]">
          <Search size={18} aria-hidden="true" />
          <input
            className="min-h-[42px] w-full min-w-0 border-0 bg-transparent p-0 text-foreground shadow-none outline-0 placeholder:text-muted placeholder:opacity-80"
            aria-label="Buscar viajes"
            placeholder="Buscar persona, ruta, vuelo o reserva…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <Label className="block max-[760px]:w-full">
          <span className="sr-only">Filtrar por estado</span>
          <Select
            className="w-[155px] max-[760px]:w-full"
            aria-label="Filtrar por estado"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option>Todos</option>
            {statuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </Select>
        </Label>
        <Label className="block max-[760px]:w-full">
          <span className="sr-only">Filtrar por fecha</span>
          <Input
            className="w-[150px] max-[760px]:w-full"
            aria-label="Filtrar por fecha"
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
          />
        </Label>
        <Button
          type="button"
          className={onlyUpcoming ? BOTON_BARRA + " " + FILTRO_ENCENDIDO : BOTON_BARRA}
          aria-pressed={onlyUpcoming}
          onClick={() => setOnlyUpcoming((current) => !current)}
        >
          <SlidersHorizontal size={17} />
          {onlyUpcoming ? "Próximos" : "Todos los periodos"}
        </Button>
        <Button
          type="button"
          className={
            purchaseFilter === "abiertos"
              ? BOTON_BARRA + " " + FILTRO_ENCENDIDO
              : BOTON_BARRA
          }
          aria-pressed={purchaseFilter === "abiertos"}
          onClick={() =>
            setPurchaseFilter(
              purchaseFilter === "abiertos" ? "todos" : "abiertos",
            )
          }
        >
          <Clock size={17} />
          {purchaseFilter === "abiertos" ? "Solo por comprar" : "Por comprar"}
        </Button>
        <Button type="button" className={BOTON_BARRA} onClick={openManifest}>
          <ClipboardList size={17} /> Lista para solicitar
        </Button>
        {!demo && (
          <Button
            type="button"
            className={BOTON_BARRA}
            onClick={reload}
            disabled={loading}
          >
            <RefreshCw
              className={loading ? "animate-[spin_700ms_linear_infinite]" : ""}
              size={17}
            />
            {loading ? "Actualizando…" : "Actualizar"}
          </Button>
        )}
      </div>
      <div
        className="mb-[6px] flex min-h-7 items-center justify-between gap-[14px] text-[12px] text-muted"
        id="trip-results"
        aria-live="polite"
      >
        <span>
          {visibleTrips.length}{" "}
          {visibleTrips.length === 1 ? "viaje" : "viajes"}
          {onlyUpcoming ? " desde hoy" : " en total"}
          {statusFilter !== "Todos" ? ` · ${statusFilter}` : ""}
          {dateFilter ? ` · ${formatDate(dateFilter)}` : ""}
          {purchaseFilter === "abiertos" ? " · por comprar" : ""}
          {purchaseFilter === "sin_cerrar" ? " · pasados sin reserva" : ""}
        </span>
        {hasTripFilters && visibleTrips.length > 0 && (
          <Button
            type="button"
            className="border-transparent bg-transparent px-[10px]"
            onClick={clearTripFilters}
          >
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* El hueco existe siempre y crece con la barra, para que la tabla no dé un
          salto al marcar el primer viaje. La cuenta se congela en el último
          valor mientras se cierra: si no, se leería "0 viajes" al encogerse. */}
      <div
        className="group grid grid-rows-[0fr] transition-[grid-template-rows,margin] duration-200 ease-[var(--ease-out)] motion-reduce:transition-none data-[abierto]:my-[10px] data-[abierto]:grid-rows-[1fr]"
        data-abierto={selectedTrips.length > 0 ? "" : undefined}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className="flex min-h-[58px] items-center justify-between gap-4 rounded-md border border-line-strong bg-surface py-[7px] pr-2 pl-[15px] opacity-0 shadow-[0_10px_35px_rgba(0,0,0,0.1)] transition-opacity duration-[160ms] ease-[var(--ease-out)] group-data-[abierto]:opacity-100 max-[760px]:flex-col max-[760px]:items-stretch max-[760px]:p-3"
            role="status"
            aria-hidden={selectedTrips.length === 0 ? true : undefined}
          >
            <span>
              <strong>{cuentaSeleccion}</strong>{" "}
              {cuentaSeleccion === 1
                ? "viaje seleccionado"
                : "viajes seleccionados"}
            </span>
            <div className="flex gap-[7px] max-[760px]:grid max-[760px]:grid-cols-1">
              <Button
                type="button"
                onClick={() => setSelectedTrips([])}
                disabled={busy}
              >
                Quitar selección
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => void markSelectedRequested()}
                disabled={busy}
              >
                {busy
                  ? "Actualizando…"
                  : `Marcar ${cuentaSeleccion} como ${cuentaSeleccion === 1 ? "solicitado" : "solicitados"}`}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {visibleTrips.length ? (
        <TableWrap
          className="max-[760px]:overflow-visible max-[760px]:border-0 max-[760px]:bg-transparent"
          role="region"
          aria-label="Listado de viajes"
          tabIndex={0}
        >
          <Table>
            <THead>
              <tr>
                <Th className={CELDA_SELECCION}>
                  <label className={CASILLA_TOQUE}>
                    <Checkbox
                      className="mx-auto my-0"
                      aria-label="Seleccionar todos los viajes planificados visibles"
                      checked={
                        requestableTrips.length > 0 &&
                        requestableTrips.every((trip) =>
                          selectedTrips.includes(trip.id),
                        )
                      }
                      onChange={(event) => {
                        const ids = requestableTrips.map((trip) => trip.id);
                        setSelectedTrips((current) =>
                          event.target.checked
                            ? Array.from(new Set([...current, ...ids]))
                            : current.filter((id) => !ids.includes(id)),
                        );
                      }}
                      disabled={!requestableTrips.length}
                    />
                  </label>
                </Th>
                <Th>Persona y ruta</Th>
                <Th>Fecha</Th>
                <Th>Movimiento</Th>
                <Th>Hora</Th>
                <Th>Estado</Th>
                <Th>Reserva</Th>
                <Th>
                  <span className="sr-only">Acciones</span>
                </Th>
              </tr>
            </THead>
            <TBody>
              {visibleTrips.map((trip) => (
                <Tr key={trip.id}>
                  <Td data-label="Seleccionar" className={CELDA_SELECCION}>
                    {trip.status === "Planificado" &&
                    trip.date >= localDate() ? (
                      <label
                        className={
                          CASILLA_TOQUE + " max-[760px]:ml-auto max-[760px]:mr-[-10px]"
                        }
                      >
                        <Checkbox
                          className="mx-auto my-0 max-[760px]:mx-0"
                          aria-label={`Seleccionar viaje de ${personName(trip.person_id)} del ${formatDate(trip.date)}`}
                          checked={selectedTrips.includes(trip.id)}
                          onChange={(event) =>
                            setSelectedTrips((current) =>
                              event.target.checked
                                ? [...current, trip.id]
                                : current.filter((id) => id !== trip.id),
                            )
                          }
                        />
                      </label>
                    ) : (
                      <span aria-hidden="true">—</span>
                    )}
                  </Td>
                  <Td data-label="Persona y ruta" className={CELDA_PRINCIPAL}>
                    <strong className="block mb-[2px] text-foreground">
                      {personName(trip.person_id)}
                    </strong>
                    <small className="block text-muted">
                      {trip.origin} → {trip.destination}
                    </small>
                  </Td>
                  <Td data-label="Fecha">
                    {formatDate(trip.date)}
                    <PurchasePill estado={compraDe(trip)}>
                      {(() => {
                        const estado = compraDe(trip);
                        if (estado === "resuelto") return "Con reserva";
                        if (estado === "cerrado") return "Anulado";
                        if (estado === "sin_cerrar") return "Sin cerrar";
                        const faltan = diasParaVolar(trip.date, localDate());
                        if (faltan < 0) return "Fecha vencida";
                        if (faltan === 0) return "Vuela hoy";
                        return `Faltan ${faltan} ${faltan === 1 ? "día" : "días"}`;
                      })()}
                    </PurchasePill>
                  </Td>
                  <Td data-label="Movimiento">
                    <DirectionPill direction={trip.direction}>
                      {trip.direction === "SUBIDA" ? (
                        <ArrowUpRight size={16} />
                      ) : (
                        <ArrowDownLeft size={16} />
                      )}
                      {trip.direction === "SUBIDA" ? "Subida" : "Bajada"}
                    </DirectionPill>
                  </Td>
                  <Td data-label="Hora">
                    {trip.requested_time?.slice(0, 5) || "Por confirmar"}
                  </Td>
                  <Td data-label="Estado">
                    <StatusPill status={trip.status} />
                  </Td>
                  <Td data-label="Reserva">{trip.pnr || "—"}</Td>
                  <Td data-label="Acciones" className={CELDA_ACCIONES}>
                    <Button
                      type="button"
                      className="px-[10px]"
                      onClick={() => openTrip(trip)}
                    >
                      Abrir <ArrowUpRight size={15} />
                    </Button>
                    <Button
                      type="button"
                      variant="icon"
                      aria-label={`Ver historial de ${personName(trip.person_id)}`}
                      onClick={() => void showHistory(trip)}
                    >
                      <Clock size={16} />
                    </Button>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      ) : (
        <EmptyState
          icon={<Plane />}
          title={
            hasTripFilters
              ? "No hay viajes con estos filtros"
              : "Aún no hay viajes"
          }
          description={
            hasTripFilters
              ? "Cambia los filtros para ampliar la búsqueda."
              : people.length
                ? "Agrega un viaje o planifica el calendario de los turnos."
                : "Primero registra a las personas que viajarán."
          }
          action={
            hasTripFilters
              ? "Limpiar filtros"
              : people.length
                ? "Nuevo viaje"
                : "Ir a personas"
          }
          onAction={
            hasTripFilters
              ? clearTripFilters
              : people.length
                ? () => openTrip(null)
                : () => navigate("Personas")
          }
        />
      )}
      <div className="mt-3 flex items-start gap-[10px] rounded-md border border-line bg-surface px-[15px] py-[13px] text-[12px] text-muted max-[760px]:mt-[10px]">
        <Plane size={17} />
        <span>
          <strong className="text-foreground-soft">
            Tarifas en vivo aún no conectadas.
          </strong>{" "}
          El monto se registra al confirmar el pasaje.
        </span>
      </div>
    </section>
  );
}
