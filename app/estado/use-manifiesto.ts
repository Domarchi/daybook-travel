// El manifiesto: abrirlo, descargar el CSV y marcar los viajes como solicitados.
//
// El texto de las funciones es el mismo que tenían dentro de `store.tsx`; solo
// cambió dónde viven. Lo que usan de los otros hooks lo reciben en `e`.

import { motivosDeAcreditacion, resumenDeMotivos } from "../../lib/accreditation";
import { localDate } from "../../lib/format";
import { db } from "../../lib/supabase";
import { csvDeViajes } from "../../lib/trips-csv";
import { Trip } from "../../lib/types";
import type { Avisos } from "./use-avisos";
import type { Sesion } from "./use-sesion";
import type { Datos } from "./use-datos";
import type { Navegacion } from "./use-navegacion";
import type { Dialogos } from "./use-dialogos";
import type { Derivados } from "./use-derivados";
import type { Acreditacion } from "./use-acreditacion";

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
      setNotice("No hay viajes futuros por solicitar con estos filtros.");
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
      setNotice("No hay viajes futuros por solicitar con estos filtros.");
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
      "Lista descargada. Revísala y, cuando la envíes, marca la selección como solicitada.",
    );
  }

  async function markSelectedRequested(soloEstos?: string[]) {
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
      setNotice("Selecciona viajes planificados para continuar.");
      return;
    }
    await runAction(async () => {
      const updatedAt = new Date().toISOString();
      if (demo) {
        const selected = new Set(ids);
        setTrips((current) =>
          current.map((trip) =>
            selected.has(trip.id)
              ? {
                  ...trip,
                  status: "Solicitado",
                  notes: [
                    trip.notes.trim(),
                    "Motivo del cambio: Solicitud enviada.",
                  ]
                    .filter(Boolean)
                    .join("\n"),
                  updated_at: updatedAt,
                }
              : trip,
          ),
        );
      } else {
        const rows = ids
          .map((id) => trips.find((trip) => trip.id === id))
          .filter((trip): trip is Trip => Boolean(trip));
        for (let index = 0; index < rows.length; index += 10) {
          const results = await Promise.all(
            rows.slice(index, index + 10).map((trip) =>
              db()
                .from("trips")
                .update({
                  status: "Solicitado",
                  notes: [
                    trip.notes.trim(),
                    "Motivo del cambio: Solicitud enviada.",
                  ]
                    .filter(Boolean)
                    .join("\n"),
                  updated_at: updatedAt,
                })
                .eq("id", trip.id)
                .eq("updated_at", trip.updated_at!)
                .select("id"),
            ),
          );
          for (const result of results) {
            if (result.error) throw result.error;
            if (!result.data?.length) {
              throw new Error(
                "Uno de los viajes cambió mientras trabajabas. Actualiza la lista y vuelve a intentarlo.",
              );
            }
          }
        }
        await reload();
      }
      setSelectedTrips([]);
      setNotice(
        `${ids.length} ${ids.length === 1 ? "viaje marcado como solicitado" : "viajes marcados como solicitados"}.`,
      );
    });
  }

  return {
    openManifest,
    exportCsv,
    markSelectedRequested,
  };
}

export type Manifiesto = ReturnType<typeof useManifiesto>;
