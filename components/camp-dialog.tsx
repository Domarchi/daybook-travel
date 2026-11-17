"use client";

// La lista para el campamento: llegadas, salidas y traslados de los próximos
// días, y cuántas personas duermen cada noche. Sale de los viajes registrados
// (lib/campamento.ts) y no cambia nada en la base: es un texto para mandar.

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogBody } from "@/components/ui/dialog-parts";
import { Input, Label, Select } from "@/components/ui/field";
import { AvisoNoCopiado, BotonCopiar, TextoParaCopiar } from "@/components/ui/copy-button";
import { useCopiar } from "@/components/ui/use-copiar";
import { armarCampamento, DIAS_SIN_BAJADA, fechaCorta, textoDeCampamento, totalesDeCampamento } from "../lib/campamento";
import { localDate } from "../lib/format";
import { useApp } from "../app/store";

const PERIODOS = [7, 14];

export default function CampDialog() {
  const { closeModal, people, personName, trips } = useApp();
  const [desde, setDesde] = useState(localDate);
  const [dias, setDias] = useState(7);

  const campamento = useMemo(
    () => armarCampamento({ viajes: trips, personas: people, desde, dias, nombreDe: personName }),
    [trips, people, desde, dias, personName],
  );
  const texto = useMemo(() => textoDeCampamento(campamento, localDate()), [campamento]);
  const { copiado, fallo, copiar, textoRef } = useCopiar(texto);
  const totales = totalesDeCampamento(campamento);
  const maximo = Math.max(0, ...campamento.dias.map((d) => d.pernoctan));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DialogBody className="flex flex-col">
        <div className="mb-3 flex shrink-0 flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Label className="text-caption">
              Desde
              <Input
                type="date"
                name="desde"
                value={desde}
                onChange={(event) => event.target.value && setDesde(event.target.value)}
                className="w-auto"
              />
            </Label>
            <Label className="text-caption">
              Período
              <Select
                name="dias"
                value={dias}
                onChange={(event) => setDias(Number(event.target.value))}
                className="w-auto"
              >
                {PERIODOS.map((n) => (
                  <option key={n} value={n}>
                    {n === 7 ? "Una semana" : "Dos semanas"}
                  </option>
                ))}
              </Select>
            </Label>
          </div>
          <BotonCopiar copiado={copiado} onClick={() => void copiar()} />
        </div>
        <p className="mb-3 shrink-0 text-meta text-foreground-soft" data-campamento-resumen>
          <strong className="text-foreground">{totales.llegadas}</strong>{" "}
          {totales.llegadas === 1 ? "llegada" : "llegadas"} y{" "}
          <strong className="text-foreground">{totales.salidas}</strong>{" "}
          {totales.salidas === 1 ? "salida" : "salidas"} en{" "}
          <strong className="text-foreground">{totales.traslados}</strong>{" "}
          {totales.traslados === 1 ? "traslado" : "traslados"} · hasta{" "}
          <strong className="text-foreground">{maximo}</strong>{" "}
          {maximo === 1 ? "persona" : "personas"} por noche
        </p>
        {campamento.sinBajada.length > 0 && (
          <section
            aria-labelledby="campamento-sin-bajada"
            className="mb-3 max-h-[24vh] shrink-0 overflow-y-auto rounded-md border border-[color-mix(in_srgb,var(--warning)_45%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_8%,var(--surface))] px-3 py-[11px]"
          >
            <h3 id="campamento-sin-bajada" className="text-meta text-foreground">
              Sin bajada registrada
            </h3>
            <p className="mt-1 mb-2 text-caption text-muted">
              Figuran en obra hace más de {DIAS_SIN_BAJADA} días. Se cuentan
              igual en las noches, pero seguramente falta cargar su bajada en
              Viajes.
            </p>
            <ul className="m-0 grid list-none gap-1 p-0 text-meta">
              {campamento.sinBajada.map((s) => (
                <li key={s.nombre}>
                  <strong className="text-foreground">{s.nombre}</strong>
                  {s.subio && <span className="text-muted"> · subió el {fechaCorta(s.subio)}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
        {fallo && <AvisoNoCopiado />}
        <TextoParaCopiar texto={texto} etiqueta="Lista para el campamento" textoRef={textoRef} />
        <p className="mt-3 shrink-0 text-caption text-muted">
          Sale de los viajes registrados: quien llegó y todavía no baja duerme en
          el campamento. Pega el texto en el correo o el WhatsApp del campamento;
          copiarlo no cambia nada en la aplicación.
        </p>
      </DialogBody>
      <div className="flex min-h-[72px] shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line bg-surface px-6 py-3 max-[760px]:px-4">
        <Button type="button" onClick={closeModal}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}
