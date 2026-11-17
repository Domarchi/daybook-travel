"use client";

import { useRef, useState } from "react";

import EmptyState from "@/components/ui/empty-state";
import { ArrowDownLeft, ArrowUpRight, ClipboardList, Clock, Plane, RefreshCw, Search, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import { formatDate, localDate } from "../lib/format";
import { TRIP_STATUSES as statuses } from "../lib/types";
import { diasParaVolar } from "../lib/purchase";
import { ESPERA_LARGA, diasEsperando, textoDeEspera } from "../lib/solicitudes";
import { textoDeRevision } from "../lib/revision";
import { esReservable } from "../lib/reserva";
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

// Los modos a los que se llega desde la Agenda. No tienen control en la barra:
// se muestran como una pastilla que se puede quitar.
const MODOS: Record<string, string> = {
  sin_cerrar: "Pasados sin reserva",
  revisar: "Para revisar",
};

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
    openCloseTrips,
    openReserveTrips,
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
    revision,
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

  // En la lista de pasados sin reserva la selección sirve para cerrarlos; en la
  // de solicitados, para registrar la reserva que mandó la agencia; en el resto,
  // para marcar como solicitados los planificados que vienen. Son usos que no se
  // mezclan: cada lista deja marcar solo lo suyo.
  const modoCierre = purchaseFilter === "sin_cerrar";
  const modoReserva = !modoCierre && statusFilter === "Solicitado";
  const esSeleccionable = (trip: (typeof visibleTrips)[number]) =>
    modoCierre
      ? compraDe(trip) === "sin_cerrar"
      : modoReserva
        ? esReservable(trip)
        : trip.status === "Planificado" && trip.date >= localDate();
  const seleccionables = modoReserva
    ? visibleTrips.filter(esReservable)
    : modoCierre
      ? visibleTrips.filter((trip) => compraDe(trip) === "sin_cerrar")
      : requestableTrips;

  // Marcar o desmarcar todos los que se pueden marcar en esta lista. Lo usan la
  // casilla de la cabecera y, en el teléfono (donde la cabecera no se ve), la
  // fila «Seleccionar los N…» sobre las tarjetas.
  const todosMarcados =
    seleccionables.length > 0 &&
    seleccionables.every((trip) => selectedTrips.includes(trip.id));
  function marcarTodos(marcar: boolean) {
    const ids = seleccionables.map((trip) => trip.id);
    setSelectedTrips((current) =>
      marcar
        ? Array.from(new Set([...current, ...ids]))
        : current.filter((id) => !ids.includes(id)),
    );
  }
  const [uno, varios] = modoCierre
    ? ["viaje sin cerrar", "viajes sin cerrar"]
    : modoReserva
      ? ["solicitado sin reserva", "solicitados sin reserva"]
      : ["planificado", "planificados"];
  const textoMarcarTodos =
    seleccionables.length === 1
      ? `Seleccionar 1 ${uno} visible`
      : `Seleccionar los ${seleccionables.length} ${varios} visibles`;

  // En el teléfono la barra muestra solo la búsqueda y «Filtros (n)»; el resto
  // se despliega debajo. n cuenta los filtros que están acotando la lista.
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const filtrosActivos = [
    statusFilter !== "Todos",
    Boolean(dateFilter),
    onlyUpcoming,
    purchaseFilter === "abiertos",
  ].filter(Boolean).length;
  const modo = MODOS[purchaseFilter];

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
        <div className="mb-[10px] flex min-h-12 items-center justify-between gap-4 rounded-md border border-line bg-surface py-[7px] pr-[9px] pl-[14px] text-meta text-foreground-soft max-[760px]:flex-col max-[760px]:items-stretch max-[760px]:p-3">
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
      {modo && (
        <div className="mb-[10px] flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border border-line bg-surface py-[7px] pr-[9px] pl-[14px] text-meta text-foreground-soft">
          <span>Mostrando</span>
          <Button
            type="button"
            className={"rounded-pill " + FILTRO_ENCENDIDO}
            aria-label={`Quitar el filtro «${modo}»`}
            onClick={() => {
              setSelectedTrips([]);
              setPurchaseFilter("todos");
              setOnlyUpcoming(true);
            }}
          >
            {modo} <X size={16} aria-hidden="true" />
          </Button>
        </div>
      )}
      <div className="mb-[10px] flex flex-wrap items-center gap-2 max-[760px]:grid max-[760px]:grid-cols-[minmax(0,1fr)_auto] max-[760px]:items-stretch">
        <label className="flex min-h-[46px] min-w-[min(100%,240px)] flex-[1_1_240px] items-center gap-[9px] rounded-sm border border-line-strong bg-surface px-3 text-meta font-semibold text-muted max-[760px]:min-w-0">
          <Search size={18} aria-hidden="true" />
          <input
            className="min-h-[42px] w-full min-w-0 border-0 bg-transparent p-0 text-foreground shadow-none outline-0 placeholder:text-muted placeholder:opacity-80"
            aria-label="Buscar viajes"
            placeholder="Buscar persona, ruta, vuelo o reserva…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <Button
          type="button"
          className="hidden max-[760px]:inline-flex"
          aria-expanded={filtrosAbiertos}
          aria-controls="filtros-viajes"
          onClick={() => setFiltrosAbiertos((abierto) => !abierto)}
        >
          <SlidersHorizontal size={17} />
          {filtrosActivos ? `Filtros (${filtrosActivos})` : "Filtros"}
        </Button>
        {/* En pantalla ancha esta caja no existe (contents): sus controles quedan
            en la misma fila. En el teléfono se despliega con «Filtros». */}
        <div
          id="filtros-viajes"
          data-abierto={filtrosAbiertos ? "" : undefined}
          className="contents max-[760px]:col-span-2 max-[760px]:hidden max-[760px]:gap-2 max-[760px]:data-[abierto]:grid"
        >
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
          Solo próximos
        </Button>
        <Button
          type="button"
          className={
            purchaseFilter === "abiertos"
              ? BOTON_BARRA + " " + FILTRO_ENCENDIDO
              : BOTON_BARRA
          }
          aria-pressed={purchaseFilter === "abiertos"}
          onClick={() => {
            setSelectedTrips([]);
            setPurchaseFilter(
              purchaseFilter === "abiertos" ? "todos" : "abiertos",
            );
          }}
        >
          <Clock size={17} />
          Solo por comprar
        </Button>
        </div>
        {/* Las acciones quedan a la vista también en el teléfono, lado a lado. */}
        <div className="contents max-[760px]:col-span-2 max-[760px]:grid max-[760px]:auto-cols-fr max-[760px]:grid-flow-col max-[760px]:gap-2">
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
      </div>
      <div
        className="mb-[6px] flex min-h-7 items-center justify-between gap-[14px] text-caption text-muted"
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
          {purchaseFilter === "revisar" ? " · para revisar" : ""}
          {modoReserva && seleccionables.length > 0
            ? " · marca los de un mismo vuelo para registrar su reserva"
            : ""}
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
              {modoCierre ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={openCloseTrips}
                  disabled={busy}
                >
                  {`Cerrar ${cuentaSeleccion} ${cuentaSeleccion === 1 ? "viaje" : "viajes"}`}
                </Button>
              ) : modoReserva ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={openReserveTrips}
                  disabled={busy}
                >
                  Registrar reserva
                </Button>
              ) : (
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
              )}
            </div>
          </div>
        </div>
      </div>

      {visibleTrips.length > 0 && seleccionables.length > 0 && (
        <label className="mb-[9px] hidden min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line bg-surface-soft px-3 text-meta font-semibold text-foreground-soft max-[760px]:flex">
          <Checkbox
            className="my-0"
            checked={todosMarcados}
            onChange={(event) => marcarTodos(event.target.checked)}
          />
          {textoMarcarTodos}
        </label>
      )}

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
                      aria-label={
                        modoCierre
                          ? "Seleccionar todos los viajes sin cerrar visibles"
                          : modoReserva
                            ? "Seleccionar todos los viajes solicitados sin reserva visibles"
                            : "Seleccionar todos los viajes planificados visibles"
                      }
                      checked={todosMarcados}
                      onChange={(event) => marcarTodos(event.target.checked)}
                      disabled={!seleccionables.length}
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
                  {/* En tarjeta, un viaje que no se puede marcar no lleva la fila
                      "Seleccionar —": eran 44 px de nada al comienzo de cada tarjeta. */}
                  <Td
                    data-label="Seleccionar"
                    className={esSeleccionable(trip) ? CELDA_SELECCION : CELDA_SELECCION + " max-[760px]:hidden"}
                  >
                    {esSeleccionable(trip) ? (
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
                    {/* Lo que conviene revisar antes de comprar (lib/revision.ts). */}
                    {revision.get(trip.id)?.map((motivo) => (
                      <small
                        key={motivo}
                        className="mt-1 flex items-center gap-1 text-overline font-bold text-warning"
                      >
                        <TriangleAlert size={13} aria-hidden="true" />
                        {textoDeRevision(motivo, trip.direction)}
                      </small>
                    ))}
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
                    {/* Un solo bloque: en tarjeta la celda es una fila con su título a la izquierda. */}
                    <div className="grid justify-items-start max-[760px]:justify-items-end">
                    <StatusPill status={trip.status} />
                    {(() => {
                      // Cuánto lleva esperando a la agencia; desde 3 días se destaca.
                      const dias = diasEsperando(trip, localDate());
                      if (dias === null) return null;
                      return (
                        <small
                          className={
                            "mt-1 block text-overline whitespace-nowrap " +
                            (dias >= ESPERA_LARGA ? "font-bold text-warning" : "text-muted")
                          }
                        >
                          Pedido {textoDeEspera(dias)}
                        </small>
                      );
                    })()}
                    </div>
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
    </section>
  );
}
