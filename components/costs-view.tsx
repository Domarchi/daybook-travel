"use client";

import { formatoCLP, registroDeCosto, cuentaParaCostos } from "../lib/costs";
import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/field";
import { TRIP_STATUSES } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { StaticOverviewCard } from "@/components/ui/overview-card";
import { TableWrap } from "@/components/ui/table-wrap";
import {
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui/data-table";
import { useApp } from "../app/store";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const nombreDelMes = (clave: string) => {
  const [anio, mes] = clave.split("-");
  return `${MESES[Number(mes) - 1] ?? clave} de ${anio}`;
};

function Cobertura({ conMonto, viajes }: { conMonto: number; viajes: number }) {
  if (!viajes) return <small className="block text-muted">Sin viajes</small>;
  return (
    <small
      className={
        "block " + (conMonto === viajes ? "text-muted" : "text-[var(--warning)]")
      }
    >
      {conMonto} de {viajes} con monto
    </small>
  );
}

export default function CostsView() {
  const {
    costos, personName, trips, costTrips, openTrip,
    costMonth, setCostMonth, costStatus, setCostStatus,
    costCategory, setCostCategory,
  } = useApp();
  const { cobertura, porMes, porRuta, porPersona } = costos;

  const total = porMes.reduce((suma, grupo) => suma + grupo.total, 0);
  const meses = useMemo(() => [...new Set(trips.filter(cuentaParaCostos).map((trip) => trip.date.slice(0, 7)))].sort(), [trips]);
  const reservas = costTrips.filter((trip) => registroDeCosto(trip) === "reserva-sin-monto");
  const planes = costTrips.filter((trip) => registroDeCosto(trip) === "planificado-sin-monto");
  const pendientes = costCategory === "reserva-sin-monto" ? reservas : planes;

  return (
    <section aria-label="Registro de costos">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Label className="min-w-[200px] max-[760px]:flex-1">
          Período
          <Select value={costMonth} onChange={(event) => setCostMonth(event.target.value)}>
            <option value="">Todos los meses</option>
            {meses.map((mes) => <option key={mes} value={mes}>{nombreDelMes(mes)}</option>)}
          </Select>
        </Label>
        <Label className="min-w-[180px] max-[760px]:flex-1">
          Estado
          <Select value={costStatus} onChange={(event) => setCostStatus(event.target.value)}>
            <option>Todos</option>
            {TRIP_STATUSES.filter((estado) => estado !== "Anulado").map((estado) => <option key={estado}>{estado}</option>)}
          </Select>
        </Label>
        {(costMonth || costStatus !== "Todos") && <Button type="button" onClick={() => {
          setCostMonth(""); setCostStatus("Todos"); setCostCategory("");
        }}>Limpiar filtros</Button>}
      </div>
      <div className="mb-3 grid grid-cols-[1.3fr_1fr_1fr] gap-3 max-[760px]:grid-cols-2" aria-live="polite">
        <StaticOverviewCard className="grid-cols-1 [&>strong]:col-start-1 max-[760px]:col-span-full">
          <span>Monto registrado</span>
          <strong>{formatoCLP(total)}</strong>
          <small>
            {cobertura.conMonto} de {cobertura.viajes} {cobertura.viajes === 1 ? "viaje" : "viajes"} con monto · CLP por pasajero
          </small>
        </StaticOverviewCard>
        <Button type="button" aria-pressed={costCategory === "reserva-sin-monto"}
          className="grid min-h-[112px] grid-cols-[1fr_auto] gap-1 p-4 text-left"
          onClick={() => setCostCategory(costCategory === "reserva-sin-monto" ? "" : "reserva-sin-monto")}>
          <span className="text-meta text-foreground-soft">Reservas sin monto</span>
          <ChevronRight className="row-span-3 self-center text-muted" size={18} />
          <strong className="text-display tabular-nums">{reservas.length}</strong>
          <small>Revisar costo confirmado</small>
        </Button>
        <Button type="button" aria-pressed={costCategory === "planificado-sin-monto"}
          className="grid min-h-[112px] grid-cols-[1fr_auto] gap-1 p-4 text-left"
          onClick={() => setCostCategory(costCategory === "planificado-sin-monto" ? "" : "planificado-sin-monto")}>
          <span className="text-meta text-foreground-soft">Planes sin monto</span>
          <ChevronRight className="row-span-3 self-center text-muted" size={18} />
          <strong className="text-display tabular-nums">{planes.length}</strong>
          <small>Precio por registrar</small>
        </Button>
      </div>
      <p className="mb-5 text-meta leading-relaxed" role="note">
        El total suma únicamente los montos registrados en el período y estado seleccionados.
        Los planes sin monto no implican gasto realizado. Los viajes anulados se excluyen.
      </p>
      {costCategory && <section className="mb-5 rounded-md border border-line bg-surface" aria-label="Viajes sin monto">
        <header className="flex items-center justify-between gap-3 border-b border-line p-4">
          <h2 className="text-emphasis">{costCategory === "reserva-sin-monto" ? "Reservas sin monto" : "Planes sin monto"} · {pendientes.length}</h2>
          <Button type="button" onClick={() => setCostCategory("")}>Cerrar lista</Button>
        </header>
        {pendientes.length ? pendientes.slice().sort((a, b) => a.date.localeCompare(b.date)).map((trip) =>
          <Button key={trip.id} type="button" className="flex w-full justify-between gap-3 rounded-none border-0 border-b border-line p-4 text-left last:border-b-0" onClick={() => openTrip(trip)}>
            <span className="grid min-w-0 gap-1"><strong>{personName(trip.person_id)}</strong><small>{formatDate(trip.date)} · {trip.origin} → {trip.destination} · {trip.status}</small></span>
            <ChevronRight className="shrink-0 text-muted" size={18} />
          </Button>
        ) : <p className="p-4 text-meta">No hay viajes de esta categoría con los filtros actuales.</p>}
      </section>}

      <TableWrap className="mb-5" role="region" aria-label="Costos por mes" tabIndex={0}>
        <h3 className="px-4 pt-4 pb-3 text-heading text-foreground">Por mes</h3>
        <Table className="min-w-[600px]">
          <THead>
            <Tr>
              <Th>Mes</Th>
              <Th>Viajes</Th>
              <Th>Total</Th>
              <Th>Cobertura</Th>
            </Tr>
          </THead>
          <TBody>
            {porMes.length ? (
              porMes.map((grupo) => (
                <Tr key={grupo.clave}>
                  <Td data-label="Mes">{nombreDelMes(grupo.clave)}</Td>
                  <Td data-label="Viajes" className="font-semibold tabular-nums">{grupo.viajes}</Td>
                  <Td data-label="Total">
                    {grupo.conMonto ? formatoCLP(grupo.total) : "—"}
                  </Td>
                  <Td data-label="Cobertura">
                    <Cobertura conMonto={grupo.conMonto} viajes={grupo.viajes} />
                  </Td>
                </Tr>
              ))
            ) : (
              <Tr>
                <Td colSpan={4}>Todavía no hay viajes que costear.</Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </TableWrap>

      <TableWrap className="mb-5" role="region" aria-label="Costos por ruta" tabIndex={0}>
        <h3 className="px-4 pt-4 pb-2 text-heading text-foreground">Por ruta</h3>
        <p className="max-w-[660px] px-4 pb-4 text-meta text-muted">
          La referencia es la mediana de los montos registrados para esa ruta
          con los filtros actuales. Una muestra pequeña puede variar entre compras.
        </p>
        <Table className="min-w-[760px]">
          <THead>
            <Tr>
              <Th>Ruta</Th>
              <Th>Viajes</Th>
              <Th>Total</Th>
              <Th>Referencia</Th>
              <Th>Cobertura</Th>
            </Tr>
          </THead>
          <TBody>
            {porRuta.length ? (
              porRuta.map((grupo) => (
                <Tr key={grupo.clave}>
                  <Td data-label="Ruta">{grupo.clave}</Td>
                  <Td data-label="Viajes" className="font-semibold tabular-nums">{grupo.viajes}</Td>
                  <Td data-label="Total">
                    {grupo.conMonto ? formatoCLP(grupo.total) : "—"}
                  </Td>
                  <Td data-label="Referencia">
                    {grupo.referencia === null ? (
                      <small className="block text-muted">Sin datos aún</small>
                    ) : (
                      <span>{formatoCLP(grupo.referencia)}<small className="block">{grupo.conMonto} {grupo.conMonto === 1 ? "registro" : "registros"}</small></span>
                    )}
                  </Td>
                  <Td data-label="Cobertura">
                    <Cobertura conMonto={grupo.conMonto} viajes={grupo.viajes} />
                  </Td>
                </Tr>
              ))
            ) : (
              <Tr>
                <Td colSpan={5}>Todavía no hay rutas registradas.</Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </TableWrap>

      <TableWrap role="region" aria-label="Costos por persona" tabIndex={0}>
        <h3 className="px-4 pt-4 pb-3 text-heading text-foreground">Por persona</h3>
        <Table className="min-w-[600px]">
          <THead>
            <Tr>
              <Th>Persona</Th>
              <Th>Viajes</Th>
              <Th>Total</Th>
              <Th>Cobertura</Th>
            </Tr>
          </THead>
          <TBody>
            {porPersona.length ? (
              porPersona
                .slice()
                .sort((a, b) => b.total - a.total)
                .map((grupo) => (
                  <Tr key={grupo.clave}>
                    <Td data-label="Persona">{personName(grupo.clave)}</Td>
                    <Td data-label="Viajes" className="font-semibold tabular-nums">{grupo.viajes}</Td>
                    <Td data-label="Total">
                      {grupo.conMonto ? formatoCLP(grupo.total) : "—"}
                    </Td>
                    <Td data-label="Cobertura">
                      <Cobertura
                        conMonto={grupo.conMonto}
                        viajes={grupo.viajes}
                      />
                    </Td>
                  </Tr>
                ))
            ) : (
              <Tr>
                <Td colSpan={4}>Todavía no hay personas con viajes.</Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </TableWrap>
    </section>
  );
}
