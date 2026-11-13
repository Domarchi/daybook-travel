"use client";

// Actividad reciente: los últimos cambios de viajes, personas y documentos de
// todo el proyecto, agrupados por día, con quién los hizo y qué cambió.
//
// Carga sus propios datos al abrirse, como Accesos: no son parte del estado de
// todos los días y no tiene sentido traerlos al entrar. Lo que cada entrada dice
// sale de lib/actividad.ts y lib/historial.ts.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { LoadingMark } from "@/components/ui/dialog-parts";
import { ENTIDADES_DE_ACTIVIDAD, agruparPorDia, describir } from "../lib/actividad";
import { localDate } from "../lib/format";
import { db } from "../lib/supabase";
import type { HistoryItem } from "../lib/types";
import { conCorreoDelAutor } from "../app/estado/use-acciones-viajes";
import { useApp } from "../app/store";

const POR_PAGINA = 50;

const hora = (instante: string) =>
  new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" }).format(
    new Date(instante),
  );

function autorDe(item: HistoryItem) {
  if (item.actor_email) return item.actor_email;
  if (item.actor) return `Usuario ${item.actor.slice(0, 8)}`;
  return "Cambio interno";
}

export default function ActivityView() {
  const { demo, documentTypes, openPerson, openTrip, people, trips } = useApp();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async (desde: number) => {
    setCargando(true);
    setError("");
    try {
      const { data, error: fallo } = await db()
        .from("history")
        .select("*")
        .in("entity", [...ENTIDADES_DE_ACTIVIDAD])
        .order("created_at", { ascending: false })
        .range(desde, desde + POR_PAGINA - 1);
      if (fallo) throw fallo;
      const pagina = await conCorreoDelAutor((data ?? []) as HistoryItem[]);
      setItems((actuales) => (desde === 0 ? pagina : [...(actuales ?? []), ...pagina]));
      setHayMas(pagina.length === POR_PAGINA);
    } catch {
      setError("No se pudo cargar la actividad. Inténtalo nuevamente.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!demo) void cargar(0);
  }, [demo, cargar]);

  const mapas = useMemo(
    () => ({
      trips: new Map(trips.map((trip) => [trip.id, trip])),
      people: new Map(people.map((person) => [person.id, person])),
      tiposDeDocumento: new Map(documentTypes.map((tipo) => [tipo.id, tipo.name])),
    }),
    [trips, people, documentTypes],
  );

  if (demo) {
    return (
      <EmptyState
        icon={<Clock />}
        title="Actividad disponible en la operación"
        description="La demostración no guarda cambios permanentes."
      />
    );
  }

  if (items === null) {
    return (
      <div className="flex min-h-[220px] items-center justify-center gap-[10px]" aria-live="polite">
        {error ? <p className="text-danger">{error}</p> : (<><LoadingMark /><p className="text-muted">Cargando actividad…</p></>)}
      </div>
    );
  }

  if (!items.length) {
    return (
      <EmptyState icon={<Clock />} title="Sin actividad todavía" description="Aquí aparecerán los cambios de viajes y personas." />
    );
  }

  const grupos = agruparPorDia(items, localDate());

  return (
    <section aria-label="Actividad reciente" className="grid gap-5">
      {grupos.map((grupo) => (
        <div key={grupo.dia}>
          <h2 className="mb-2 text-[12px] font-extrabold tracking-[0.05em] text-muted uppercase">{grupo.nombre}</h2>
          <ol className="overflow-hidden rounded-lg border border-line bg-surface">
            {grupo.items.map((item) => {
              const e = describir(item, mapas);
              const abrir = e.abre
                ? () => {
                    if (e.abre?.tipo === "viaje") {
                      const trip = trips.find((t) => t.id === e.abre!.id);
                      if (trip) openTrip(trip);
                    } else if (e.abre) {
                      const person = people.find((p) => p.id === e.abre!.id);
                      if (person) openPerson(person);
                    }
                  }
                : undefined;
              return (
                <li
                  key={e.id}
                  className="grid grid-cols-[52px_1fr_auto] items-start gap-3 border-b border-line px-4 py-3 last:border-b-0 max-[760px]:grid-cols-[44px_1fr]"
                >
                  <span className="pt-[2px] text-[12px] text-muted tabular-nums">{hora(item.created_at)}</span>
                  <div className="grid min-w-0 gap-1">
                    <p className="text-[13px] text-foreground-soft">
                      <strong className="text-foreground">{e.titulo}</strong> · {e.sujeto}
                    </p>
                    <small className="text-muted">{autorDe(item)}</small>
                    {e.cambios.length > 0 && (
                      <ul className="grid gap-[2px] text-[12px] text-foreground-soft">
                        {e.cambios.map((cambio) => (
                          <li key={cambio.campo} className="flex flex-wrap items-center gap-x-[6px]">
                            <span className="font-[650] text-foreground">{cambio.campo}:</span>
                            <span className={cambio.antes === "—" ? "text-muted" : "line-through decoration-muted"}>
                              {cambio.antes}
                            </span>
                            <ArrowRight size={12} aria-label="cambió a" className="text-muted" />
                            <span>{cambio.despues}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {e.nota && (
                      <p className="text-[12px] whitespace-pre-wrap text-muted">{e.nota}</p>
                    )}
                  </div>
                  {abrir && (
                    <Button
                      type="button"
                      className="px-[10px] max-[760px]:col-start-2 max-[760px]:w-fit"
                      onClick={abrir}
                      aria-label={`Abrir ${e.abre?.tipo === "viaje" ? "el viaje" : "la ficha"}: ${e.sujeto}`}
                    >
                      Abrir
                    </Button>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      ))}
      {error && <p className="text-danger" role="alert">{error}</p>}
      {hayMas && (
        <Button type="button" className="w-fit justify-self-center" onClick={() => void cargar(items.length)} disabled={cargando}>
          {cargando ? "Cargando…" : "Ver cambios anteriores"}
        </Button>
      )}
    </section>
  );
}
