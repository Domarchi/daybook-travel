"use client";
// La propuesta de viajes que Bita arma a partir de un documento: qué encontró,
// qué ya está en la agenda y qué no pudo usar, con casillas para elegir y un solo
// botón que crea. Está controlada desde el panel (components/bita.tsx), que
// guarda su estado: si se cierra y se abre el panel, la propuesta sigue como
// estaba y un viaje no se puede crear dos veces.
import { ArrowDownLeft, ArrowUpRight, Check, TriangleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { FORMATOS_DE_DOCUMENTO, conteoDePropuesta, fechaCorta, type FilaDeDocumento, type RespuestaDocumento } from "../lib/bita-ui";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/field";
import { DirectionPill } from "./ui/trip-pills";

export type EstadoPropuesta = {
  datos: RespuestaDocumento;
  /** Claves de las filas «nuevo» que se van a crear. */
  elegidas: string[];
  fase: "lista" | "creando" | "creada" | "descartada";
  creados?: number;
  yaExistian?: number;
  error?: string;
};

type Props = {
  estado: EstadoPropuesta;
  alAlternar: (clave: string) => void;
  alMarcarTodas: (marcar: boolean) => void;
  alCrear: () => void;
  alDescartar: () => void;
  alAbrirViaje: (id: string) => void;
  alVerAgenda: () => void;
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function Detalle({ fila }: { fila: FilaDeDocumento }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block font-bold [overflow-wrap:anywhere]">{fila.persona}</span>
      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span>
          {fechaCorta(fila.fecha)}
          {fila.hora ? ` · ${fila.hora}` : ""}
        </span>
        {fila.sentido && (
          <DirectionPill direction={fila.sentido}>
            {fila.sentido === "SUBIDA" ? <ArrowUpRight size={13} aria-hidden="true" /> : <ArrowDownLeft size={13} aria-hidden="true" />}
            {fila.sentido === "SUBIDA" ? "Sube" : "Baja"}
          </DirectionPill>
        )}
        {fila.sentido && (
          <span>
            {fila.origen} → {fila.destino}
          </span>
        )}
        {fila.fila ? <span>fila {fila.fila}</span> : null}
      </span>
      {fila.detalle && <span className="mt-1 block text-xs [overflow-wrap:anywhere] text-foreground-soft">{fila.detalle}</span>}
    </span>
  );
}

export function PropuestaDeViajes({ estado, alAlternar, alMarcarTodas, alCrear, alDescartar, alAbrirViaje, alVerAgenda }: Props) {
  const { datos, elegidas, fase } = estado;
  const { nuevos, existen, problemas } = conteoDePropuesta(datos.filas);
  const aCrear = datos.filas.filter((f) => f.estado === "nuevo" && elegidas.includes(f.clave)).length;
  const ocupada = fase === "creando";
  // El botón que se pulsó desaparece (o se desactiva) y el foco caería al <body>: el teclado dejaría de llegar al
  // panel (Escape no cerraría). El foco pasa al mensaje con el resultado, que además queda a la vista.
  const resultado = useRef<HTMLDivElement>(null);
  const aviso = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (fase === "creada" || fase === "descartada") resultado.current?.focus();
  }, [fase]);
  useEffect(() => {
    if (estado.error) aviso.current?.focus();
  }, [estado.error]);
  const abierta = fase === "lista" || fase === "creando";
  const partes = [
    nuevos ? plural(nuevos, "viaje nuevo", "viajes nuevos") : "",
    existen ? `${existen} ya en la agenda` : "",
    problemas ? plural(problemas, "con problema", "con problemas") : "",
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-3 text-meta leading-snug">
      <div>
        <p className="m-0 font-bold [overflow-wrap:anywhere]">{datos.archivo}</p>
        <p className="m-0 text-xs text-muted">
          {FORMATOS_DE_DOCUMENTO[datos.formato]} · {partes.length ? partes.join(" · ") : "sin viajes que proponer"}
        </p>
      </div>
      {datos.resumen && <p className="m-0 [overflow-wrap:anywhere]">{datos.resumen}</p>}
      {datos.truncado && <p className="m-0 text-xs text-warning">El archivo era largo y solo leí el principio. Súbelo en partes para el resto.</p>}
      {datos.omitidos > 0 && (
        <p className="m-0 text-xs text-muted">Dejé fuera {plural(datos.omitidos, "fila repetida o sobrante", "filas repetidas o sobrantes")}.</p>
      )}

      {abierta && datos.filas.length > 0 && (
        <>
          {nuevos > 1 && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted">{plural(aCrear, "elegido", "elegidos")} de {nuevos}</span>
              <button
                type="button"
                disabled={ocupada}
                onClick={() => alMarcarTodas(aCrear < nuevos)}
                className="min-h-11 px-1 text-xs font-bold text-primary underline underline-offset-2 disabled:opacity-60"
              >
                {aCrear < nuevos ? "Elegir todos" : "Quitar todos"}
              </button>
            </div>
          )}
          <ul aria-label="Viajes encontrados en el documento" className="m-0 flex list-none flex-col gap-2 p-0">
            {datos.filas.map((fila) => (
              <li key={fila.clave} className={`rounded-md border border-line px-3 py-2 ${fila.estado === "nuevo" ? "bg-surface" : "bg-surface-soft"}`}>
                {fila.estado === "nuevo" ? (
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
                    <Checkbox
                      checked={elegidas.includes(fila.clave)}
                      disabled={ocupada}
                      onChange={() => alAlternar(fila.clave)}
                      className="mt-0.5 shrink-0"
                    />
                    <Detalle fila={fila} />
                  </label>
                ) : (
                  <div className="flex items-start gap-3 py-1">
                    {fila.estado === "existe" ? (
                      <Check size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
                    ) : (
                      <TriangleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-warning" />
                    )}
                    <div className="min-w-0 flex-1">
                      <Detalle fila={fila} />
                      {fila.estado === "existe" && fila.viajeId && (
                        <button
                          type="button"
                          onClick={() => alAbrirViaje(fila.viajeId!)}
                          className="mt-1 min-h-11 text-xs font-bold text-primary underline underline-offset-2"
                        >
                          ver viaje
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {datos.sinIdentificar.length > 0 && (
        <div>
          <p className="m-0 text-xs font-bold">No pude identificar</p>
          <ul className="m-0 mt-1 list-disc pl-5 text-xs text-foreground-soft">
            {datos.sinIdentificar.map((s) => (
              <li key={s.referencia} className="[overflow-wrap:anywhere]">
                {s.referencia}: {s.motivo}
              </li>
            ))}
          </ul>
          <p className="m-0 mt-1 text-xs text-muted">Agrégalos en Personas o créalos desde Nuevo viaje.</p>
        </div>
      )}

      {estado.error && (
        <p
          ref={aviso}
          tabIndex={-1}
          role="alert"
          className="m-0 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-xs text-danger outline-none"
        >
          {estado.error}
        </p>
      )}

      {abierta && nuevos > 0 && (
        <>
          <p className="m-0 text-xs text-muted">Se crean como Planificado, a tu nombre. No se pisa ni se borra nada.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" disabled={ocupada || aCrear === 0} onClick={alCrear}>
              {ocupada ? "Creando…" : aCrear === 0 ? "Elige al menos un viaje" : `Crear ${plural(aCrear, "viaje", "viajes")}`}
            </Button>
            <Button type="button" disabled={ocupada} onClick={alDescartar}>
              Descartar
            </Button>
          </div>
        </>
      )}
      {abierta && nuevos === 0 && (
        <div>
          <Button type="button" onClick={alDescartar}>
            Cerrar propuesta
          </Button>
        </div>
      )}

      {fase === "creada" && (
        <div ref={resultado} tabIndex={-1} role="status" className="flex flex-col items-start gap-2 outline-none">
          <p className="m-0 font-bold">
            {estado.creados
              ? `Listo: ${plural(estado.creados, "viaje planificado", "viajes planificados")}.`
              : "No se creó ninguno."}
          </p>
          {(estado.yaExistian ?? 0) > 0 && (
            <p className="m-0 text-xs text-muted">
              {estado.creados ? "Los otros" : "Los elegidos"} ya estaban en la agenda o dejaron de servir (la ficha cambió).
            </p>
          )}
          <Button type="button" onClick={alVerAgenda}>
            Ver la agenda
          </Button>
        </div>
      )}
      {fase === "descartada" && (
        <div ref={resultado} tabIndex={-1} role="status" className="text-xs text-muted outline-none">
          Descartaste esta propuesta. No se creó ningún viaje.
        </div>
      )}
    </div>
  );
}
