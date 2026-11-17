// El manifiesto: abrirlo, descargar el CSV y marcar los viajes como solicitados.
//
// El texto de las funciones es el mismo que tenían dentro de `store.tsx`; solo
// cambió dónde viven. Lo que usan de los otros hooks lo reciben en `e`.

import { motivosDeAcreditacion, resumenDeMotivos } from "../../lib/accreditation";
import { localDate } from "../../lib/format";
import { db } from "../../lib/supabase";
import { csvDeViajes } from "../../lib/trips-csv";
import { notasConMotivo } from "../../lib/notas";
import { Trip } from "../../lib/types";
import type { Avisos } from "./use-avisos";
import type { Sesion } from "./use-sesion";
import type { Datos } from "./use-datos";
import type { Navegacion } from "./use-navegacion";
import type { Dialogos } from "./use-dialogos";
import type { Derivados } from "./use-derivados";
import type { Acreditacion } from "./use-acreditacion";
import { avisoConDeshacer, avisoDeError, avisoDeExito } from "@/lib/avisos";
import {
  MOTIVO_DESHACER_SOLICITUD,
  porTandas,
  textoDeDeshacerParcial,
  textoDeSolicitados,
  textoDeSolicitudDeshecha,
  textoDeSolicitudParcial,
} from "@/lib/marcar-solicitados";

type Entrada = Avisos & Sesion & Datos & Navegacion & Dialogos & Derivados & Acreditacion;

export function useManifiesto(e: Entrada) {
  const {
    abrirModal,
    clearMessages,
    demo,
    documents,
    documentTypes,
    exigeAcreditacion,
    manifestTrips,
    personName,
    reload,
    requestableTrips,
    runAction,
    selectedTrips,
    setConAcreditacionAprobada,
    setNotice,
    setSelectedTrips,
    setTrips,
    trips,
  } = e;

  // El manifiesto: los viajes por solicitar de la vista, agrupados por día y
  // ruta, para copiarlos a un correo. Deja esos viajes seleccionados para que,
  // una vez enviado el correo, se marquen como solicitados en un solo paso.
  function openManifest() {
    if (!requestableTrips.length) {
      setNotice(avisoDeError("No hay viajes futuros por solicitar con estos filtros."));
      return;
    }
    clearMessages();
    // Cada manifiesto parte sin excepciones: una aprobación de ayer no vale hoy.
    setConAcreditacionAprobada([]);
    // Si ya hay viajes marcados no se tocan: pisarlos hacía que quien marcaba
    // tres terminara marcando trece como solicitados sin darse cuenta.
    const hayMarcados = requestableTrips.some((trip) =>
      selectedTrips.includes(trip.id),
    );
    if (!hayMarcados) setSelectedTrips(requestableTrips.map((trip) => trip.id));
    abrirModal("manifest");
  }

  function exportCsv() {
    // Lo mismo que lleva el texto y el PDF: lo que el manifiesto muestra.
    const rows = manifestTrips;
    if (!rows.length) {
      setNotice(avisoDeError("No hay viajes futuros por solicitar con estos filtros."));
      return;
    }
    const csv = csvDeViajes(
      rows,
      personName,
      exigeAcreditacion
        ? (trip) =>
            resumenDeMotivos(
              motivosDeAcreditacion(
                trip.person_id,
                trip.date,
                documentTypes,
                documents,
              ),
            ) || "Al día"
        : undefined,
    );
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "daybook-travel-solicitud.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(
      avisoDeExito(
        "Lista descargada. Revísala y, cuando la envíes, marca la selección como solicitada.",
      ),
    );
  }

  // Cambia los viajes de a diez (lib/marcar-solicitados.ts), cada uno solo si
  // nadie lo tocó desde que se leyó (`updated_at`).
  function actualizarPorTandas(
    filas: { trip: Trip; updatedAt: string }[],
    cambio: (trip: Trip) => Partial<Trip>,
  ) {
    return porTandas(filas, async ({ trip, updatedAt }) => {
      const { data, error } = await db()
        .from("trips")
        .update(cambio(trip))
        .eq("id", trip.id)
        .eq("updated_at", updatedAt)
        .select("id, updated_at");
      return { error, fila: data?.[0] as { updated_at: string } | undefined };
    });
  }

  // Devuelve a Planificado los viajes que se acaban de marcar: el «Deshacer» del
  // aviso. Solo los que nadie volvió a tocar en esos diez segundos.
  async function deshacerSolicitud(
    hechos: { id: string; updatedAt: string }[],
    antes: Map<string, Trip>,
  ) {
    await runAction(async () => {
      const cambio = (trip: Trip): Partial<Trip> => ({
        status: "Planificado",
        notes: notasConMotivo(antes.get(trip.id)?.notes ?? "", MOTIVO_DESHACER_SOLICITUD),
        updated_at: new Date().toISOString(),
      });
      if (demo) {
        const ids = new Set(hechos.map((hecho) => hecho.id));
        setTrips((current) =>
          current.map((trip) => (ids.has(trip.id) ? { ...trip, ...cambio(trip) } : trip)),
        );
        setNotice(avisoDeExito(textoDeSolicitudDeshecha(hechos.length)));
        return;
      }
      const filas = hechos
        .map(({ id, updatedAt }) => {
          const trip = antes.get(id);
          return trip ? { trip, updatedAt } : null;
        })
        .filter((fila): fila is { trip: Trip; updatedAt: string } => Boolean(fila));
      const { hechos: devueltos, fallo, porConflicto } = await actualizarPorTandas(filas, cambio);
      await reload();
      if (fallo) {
        setNotice(avisoDeError(textoDeDeshacerParcial(devueltos.length, filas.length, porConflicto)));
      } else {
        setNotice(avisoDeExito(textoDeSolicitudDeshecha(devueltos.length)));
      }
    });
  }

  /** Devuelve `true` solo si quedaron marcados todos. */
  async function markSelectedRequested(soloEstos?: string[]): Promise<boolean> {
    // El manifiesto pasa exactamente lo que mostró; sin argumento se usa la
    // selección de la tabla de viajes.
    const ids = (soloEstos ?? selectedTrips).filter((id) =>
      trips.some(
        (trip) =>
          trip.id === id &&
          trip.status === "Planificado" &&
          trip.date >= localDate(),
      ),
    );
    if (!ids.length) {
      setNotice(avisoDeError("Selecciona viajes planificados para continuar."));
      return false;
    }
    let listo = false;
    await runAction(async () => {
      const updatedAt = new Date().toISOString();
      const rows = ids
        .map((id) => trips.find((trip) => trip.id === id))
        .filter((trip): trip is Trip => Boolean(trip));
      // Cómo estaban, para que «Deshacer» deje las notas como eran.
      const antes = new Map(rows.map((trip) => [trip.id, trip]));
      const cambio = (trip: Trip): Partial<Trip> => ({
        status: "Solicitado",
        notes: notasConMotivo(trip.notes, "Solicitud enviada."),
        updated_at: updatedAt,
      });
      let hechos: { id: string; updatedAt: string }[];
      if (demo) {
        const selected = new Set(ids);
        setTrips((current) =>
          current.map((trip) =>
            selected.has(trip.id) ? { ...trip, ...cambio(trip) } : trip,
          ),
        );
        hechos = ids.map((id) => ({ id, updatedAt }));
      } else {
        const resultado = await actualizarPorTandas(
          rows.map((trip) => ({ trip, updatedAt: trip.updated_at! })),
          cambio,
        );
        hechos = resultado.hechos;
        await reload();
        if (resultado.fallo) {
          // Nada quedó marcado: el error de siempre.
          if (!hechos.length) throw resultado.fallo;
          // Algunos sí: se dice cuántos y los que faltan quedan seleccionados.
          const marcados = new Set(hechos.map((hecho) => hecho.id));
          setSelectedTrips(ids.filter((id) => !marcados.has(id)));
          setNotice(
            avisoDeError(
              textoDeSolicitudParcial(hechos.length, ids.length, resultado.porConflicto),
            ),
          );
          return;
        }
      }
      setSelectedTrips([]);
      setNotice(
        avisoConDeshacer(textoDeSolicitados(ids.length), () => {
          void deshacerSolicitud(hechos, antes);
        }),
      );
      listo = true;
    });
    return listo;
  }

  return {
    openManifest,
    exportCsv,
    markSelectedRequested,
  };
}

export type Manifiesto = ReturnType<typeof useManifiesto>;
