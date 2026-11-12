// Abrir, guardar y ver el historial de un viaje, la ventana de compra y el
// cierre en bloque de los viajes que pasaron sin reserva.
//
// El texto de las funciones es el mismo que tenían dentro de `store.tsx`; solo
// cambió dónde viven. Lo que usan de los otros hooks lo reciben en `e`.

import { FormEvent } from "react";
import { localDate } from "../../lib/format";
import { estadoDeCompra, ventanaValida } from "../../lib/purchase";
import { cambioDeCierre, problemaDeCierre, type ModoDeCierre } from "../../lib/cierre";
import { problemaDeMotivo } from "../../lib/motivo";
import { db } from "../../lib/supabase";
import { HistoryItem, Person, Trip } from "../../lib/types";
import type { Avisos } from "./use-avisos";
import type { Sesion } from "./use-sesion";
import type { Datos } from "./use-datos";
import type { Navegacion } from "./use-navegacion";
import type { Dialogos } from "./use-dialogos";
import type { Derivados } from "./use-derivados";

type Entrada = Avisos & Sesion & Datos & Navegacion & Dialogos & Derivados;

export function useAccionesViajes(e: Entrada) {
  const {
    abrirModal,
    activePeople,
    clearMessages,
    closeModal,
    dateFilter,
    demo,
    documents,
    editTrip,
    peopleById,
    personFilter,
    purchaseWindow,
    reload,
    runAction,
    selectedDay,
    selectedTrips,
    setCalendarMonth,
    setEditPerson,
    setEditTrip,
    setFormError,
    setHistory,
    setHistoryLoading,
    setNewDate,
    setNewPerson,
    setNotice,
    setPendingTripDate,
    setPurchaseWindow,
    setReservationOpen,
    setSelectedDay,
    setSelectedTrips,
    setTrips,
    setTripStatus,
    trips,
    view,
  } = e;

  function openTrip(trip: Trip | null, date?: string, personId?: string) {
    clearMessages();
    if (!trip && !activePeople.length && !personId) {
      setPendingTripDate(date || selectedDay || dateFilter || localDate());
      setEditPerson(null);
      setFormError("");
      abrirModal("person");
      return;
    }
    setEditTrip(trip);
    setTripStatus(trip?.status ?? "Planificado");
    setReservationOpen(
      Boolean(
        trip?.pnr ||
        trip?.flight ||
        trip?.amount ||
        (trip && trip.status !== "Planificado"),
      ),
    );
    setNewDate(date || selectedDay || dateFilter || localDate());
    setNewPerson(personId || (view === "Viajes" ? personFilter : "") || "");
    abrirModal("trip");
  }

  async function saveTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAction(async () => {
      const person = peopleById.get(String(form.get("person_id")));
      if (!person) throw new Error("Selecciona una persona activa.");
      const direction = String(form.get("direction"));
      const changeReason = String(form.get("change_reason") ?? "").trim();
      const observations = String(form.get("notes") ?? "").trim();
      if (editTrip) {
        const problema = problemaDeMotivo(changeReason);
        if (problema) throw new Error(problema);
      }
      const notes = editTrip
        ? [observations, `Motivo del cambio: ${changeReason}`]
            .filter(Boolean)
            .join("\n")
        : observations;
      const trip = {
        person_id: person.id,
        date: String(form.get("date")),
        direction,
        origin:
          String(form.get("origin")).trim() ||
          (direction === "SUBIDA" ? person.origin : person.destination),
        destination:
          String(form.get("destination")).trim() ||
          (direction === "SUBIDA" ? person.destination : person.origin),
        requested_time: String(form.get("requested_time")) || null,
        baggage: String(form.get("baggage")),
        status: String(form.get("status")),
        pnr: String(form.get("pnr") ?? "").trim(),
        flight: String(form.get("flight") ?? "").trim(),
        amount:
          form.get("amount") === "" || form.get("amount") === null
            ? null
            : Number(form.get("amount")),
        notes,
        updated_at: new Date().toISOString(),
      };
      if (
        (!editTrip || editTrip.date !== trip.date) &&
        (trip.date < person.start_date ||
          (person.end_date && trip.date > person.end_date) ||
          !person.active)
      ) {
        throw new Error(
          "La fecha debe estar dentro de la vigencia de una persona activa.",
        );
      }
      if (
        ["Emitido", "Completado", "No presentado"].includes(trip.status) &&
        !trip.pnr
      ) {
        throw new Error("Registra el código de reserva para este estado.");
      }
      if (
        trips.some(
          (row) =>
            row.id !== editTrip?.id &&
            row.person_id === trip.person_id &&
            row.date === trip.date &&
            row.direction === trip.direction,
        )
      ) {
        throw new Error("Ese movimiento ya existe para la persona y fecha.");
      }
      if (demo) {
        setTrips((current) =>
          (editTrip
            ? current.map((row) =>
                row.id === editTrip.id ? { ...trip, id: row.id } : row,
              )
            : [...current, { ...trip, id: crypto.randomUUID() }]
          ).sort((a, b) => a.date.localeCompare(b.date)),
        );
      } else if (editTrip) {
        const result = await db()
          .from("trips")
          .update(trip)
          .eq("id", editTrip.id)
          .eq("updated_at", editTrip.updated_at!)
          .select("id");
        if (result.error) throw result.error;
        if (!result.data?.length) {
          throw new Error(
            "Otra persona modificó este viaje. Actualiza la vista antes de editar.",
          );
        }
        await reload();
      } else {
        const result = await db().from("trips").insert(trip);
        if (result.error) throw result.error;
        await reload();
      }
      closeModal();
      if (view === "Agenda") {
        setCalendarMonth(trip.date.slice(0, 7));
        setSelectedDay(trip.date);
      }
      setNotice("Viaje guardado correctamente.");
    }, "form");
  }

  async function savePurchaseWindow(dias: number) {
    clearMessages();
    if (!ventanaValida(dias)) {
      setNotice("La ventana de compra va de 1 a 120 dias.");
      return;
    }
    const anterior = purchaseWindow;
    setPurchaseWindow(dias);
    if (demo) return;
    const { error } = await db()
      .from("settings")
      .update({
        purchase_window_days: dias,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "00000000-0000-0000-0000-000000000001");
    if (error) {
      setPurchaseWindow(anterior);
      setNotice("No pudimos guardar la ventana de compra.");
    }
  }

  // El historial de un viaje o de una persona. El diálogo sabe de quién es por
  // cuál de los dos queda puesto: editTrip o editPerson.
  async function showHistory(trip: Trip) {
    setEditPerson(null);
    setEditTrip(trip);
    await cargarHistorial([trip.id]);
  }

  async function showPersonHistory(person: Person) {
    setEditTrip(null);
    setEditPerson(person);
    // Los vencimientos de sus documentos quedan auditados aparte, cada uno con
    // su propio id: se piden junto con la ficha para verlos en el mismo lugar.
    const documentos = documents
      .filter((documento) => documento.person_id === person.id && documento.id)
      .map((documento) => documento.id!);
    await cargarHistorial([person.id, ...documentos]);
  }

  async function cargarHistorial(recordIds: string[]) {
    clearMessages();
    setHistory([]);
    setHistoryLoading(!demo);
    abrirModal("history");
    if (demo) return;
    try {
      const { data, error } = await db()
        .from("history")
        .select("*")
        .in("record_id", recordIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const items = (data ?? []) as HistoryItem[];
      setHistory(await conCorreoDelAutor(items));
    } catch {
      setFormError("No se pudo cargar el historial. Inténtalo nuevamente.");
    } finally {
      setHistoryLoading(false);
    }
  }

  // Lo seleccionado que de verdad está sin cerrar. La tabla solo deja marcar
  // esos en la vista de pasados sin reserva, pero se vuelve a filtrar aquí: si
  // alguien registró una reserva entre medio, ese viaje ya no se toca.
  function viajesPorCerrar() {
    return selectedTrips
      .map((id) => trips.find((trip) => trip.id === id))
      .filter((trip): trip is Trip => Boolean(trip))
      .filter((trip) => estadoDeCompra(trip, localDate(), purchaseWindow) === "sin_cerrar");
  }

  function openCloseTrips() {
    clearMessages();
    if (!viajesPorCerrar().length) {
      setNotice("Selecciona viajes pasados sin reserva para continuar.");
      return;
    }
    abrirModal("close");
  }

  async function closeSelectedTrips(modo: ModoDeCierre, motivo: string, pnr: string) {
    const rows = viajesPorCerrar();
    await runAction(async () => {
      const problema = problemaDeCierre(rows, modo, motivo, pnr);
      if (problema) throw new Error(problema);
      const updatedAt = new Date().toISOString();
      if (demo) {
        const porId = new Map(rows.map((trip) => [trip.id, trip]));
        setTrips((current) =>
          current.map((trip) =>
            porId.has(trip.id)
              ? { ...trip, ...cambioDeCierre(trip, modo, motivo, pnr), updated_at: updatedAt }
              : trip,
          ),
        );
      } else {
        // De a diez, y cada uno solo si nadie lo cambió desde que se cargó la
        // lista: lo mismo que hace "Marcar como solicitados".
        for (let index = 0; index < rows.length; index += 10) {
          const results = await Promise.all(
            rows.slice(index, index + 10).map((trip) =>
              db()
                .from("trips")
                .update({ ...cambioDeCierre(trip, modo, motivo, pnr), updated_at: updatedAt })
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
      closeModal();
      const n = rows.length;
      setNotice(
        modo === "anular"
          ? `${n} ${n === 1 ? "viaje anulado" : "viajes anulados"}.`
          : `${n} ${n === 1 ? "viaje cerrado" : "viajes cerrados"} con la reserva ${pnr.trim().toUpperCase()}.`,
      );
    }, "form");
  }

  return {
    openTrip,
    saveTrip,
    savePurchaseWindow,
    showHistory,
    showPersonHistory,
    viajesPorCerrar,
    openCloseTrips,
    closeSelectedTrips,
  };
}

// El historial guarda al autor como uuid; la función de la migración 013 lo
// traduce a correo. Si la migración todavía no está aplicada, o la llamada
// falla, el historial se muestra igual, con el número corto de antes: no
// saber el correo no es razón para no mostrar los cambios.
export async function conCorreoDelAutor(items: HistoryItem[]): Promise<HistoryItem[]> {
  const ids = [...new Set(items.map((item) => item.actor).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return items;
  try {
    const { data, error } = await db().rpc("history_actors", { p_ids: ids });
    if (error) return items;
    const correos = new Map(
      ((data ?? []) as { id: string; email: string }[]).map((fila) => [fila.id, fila.email]),
    );
    return items.map((item) => ({
      ...item,
      actor_email: item.actor ? correos.get(item.actor) ?? null : null,
    }));
  } catch {
    return items;
  }
}

export type AccionesViajes = ReturnType<typeof useAccionesViajes>;
