"use client";

import { formatoCLP } from "../lib/costs";
import { StaticOverviewCard } from "@/components/ui/overview-card";
import { TableWrap } from "@/components/ui/table-wrap";
import {
  CELDA_PRINCIPAL,
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
  const { costos, personName } = useApp();
  const { cobertura, porMes, porRuta, porPersona } = costos;

  const total = porMes.reduce((suma, grupo) => suma + grupo.total, 0);
  const faltan = cobertura.viajes - cobertura.conMonto;

  return (
    <section aria-labelledby="costs-results">
      <div className="mb-[18px] grid gap-3">
        <StaticOverviewCard>
          <span>Gasto registrado</span>
          <strong>{formatoCLP(total)}</strong>
          <small>
            {cobertura.conMonto} de {cobertura.viajes} viajes tienen monto
          </small>
        </StaticOverviewCard>
        {faltan > 0 && (
          <p
            className="m-0 rounded-sm border border-[color-mix(in_srgb,var(--warning)_34%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_7%,var(--surface))] px-[14px] py-3 text-[12px] leading-[1.5] text-foreground-soft"
            role="note"
          >
            Este total cubre {cobertura.conMonto} de {cobertura.viajes} viajes.
            {" "}
            <strong className="text-[var(--warning)]">
              A {faltan} {faltan === 1 ? "viaje" : "viajes"} les falta el monto
            </strong>
            , así que el gasto real es mayor. Se completa abriendo cada viaje y
            escribiendo lo que costó.
          </p>
        )}
      </div>

      <TableWrap role="region" aria-label="Costos por mes" tabIndex={0}>
        <h3 id="costs-results" className="text-foreground">Por mes</h3>
        <Table>
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
                  <Td data-label="Viajes" className={CELDA_PRINCIPAL}>{grupo.viajes}</Td>
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

      <TableWrap role="region" aria-label="Costos por ruta" tabIndex={0}>
        <h3 className="text-foreground">Por ruta</h3>
        <p className="max-w-[660px] text-[13px] text-muted">
          La referencia es la mediana de lo pagado en esa ruta: no se mueve
          porque una vez haya tocado comprar caro.
        </p>
        <Table>
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
                  <Td data-label="Viajes" className={CELDA_PRINCIPAL}>{grupo.viajes}</Td>
                  <Td data-label="Total">
                    {grupo.conMonto ? formatoCLP(grupo.total) : "—"}
                  </Td>
                  <Td data-label="Referencia">
                    {grupo.referencia === null ? (
                      <small className="block text-muted">Sin datos aún</small>
                    ) : (
                      formatoCLP(grupo.referencia)
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
        <h3 className="text-foreground">Por persona</h3>
        <Table>
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
                    <Td data-label="Viajes" className={CELDA_PRINCIPAL}>{grupo.viajes}</Td>
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
