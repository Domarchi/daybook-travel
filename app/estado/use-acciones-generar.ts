// Generar el calendario de viajes de las personas con jornada rotativa.
//
// El texto de las funciones es el mismo que tenían dentro de `store.tsx`; solo
// cambió dónde viven. Lo que usan de los otros hooks lo reciben en `e`.

import { FormEvent } from "react";
import { addDays } from "../../lib/calendar";
import { localDate } from "../../lib/format";
import { db } from "../../lib/supabase";
import type { Avisos } from "./use-avisos";
import type { Sesion } from "./use-sesion";
import type { Datos } from "./use-datos";
import type { Navegacion } from "./use-navegacion";
import type { Dialogos } from "./use-dialogos";
import type { Derivados } from "./use-derivados";

type Entrada = Avisos & Sesion & Datos & Navegacion & Dialogos & Derivados;

export function useAccionesGenerar(e: Entrada) {
  const {
    abrirModal,
    clearMessages,
    closeModal,
    demo,
    generateUntil,
    generationPeople,
    navigate,
    planificables,
    porGenerar,
    reload,
    runAction,
    setGenerateSelection,
    setGenerateUntil,
    setNotice,
    setTrips,
  } = e;

  function openGenerate(personId?: string) {
    clearMessages();
    if (!planificables.length) {
      navigate("Personas");
      setNotice(
        "Agrega una persona activa con jornada 4×3 o 10×10 para crear su calendario.",
      );
      return;
    }
    setGenerateSelection(
      personId && planificables.some((person) => person.id === personId)
        ? personId
        : "all",
    );
    setGenerateUntil(addDays(localDate(), 90));
    abrirModal("generate");
  }

  async function generateTrips(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(async () => {
      if (!generationPeople.length) {
        throw new Error(
          "Selecciona al menos una persona con jornada 4×3 o 10×10.",
        );
      }
      if (generateUntil < localDate()) {
        throw new Error("La fecha final debe ser hoy o posterior.");
      }

      // El motor decide las fechas una sola vez, aqui. La demostracion y la
      // operacion real guardan exactamente las mismas filas; lo unico distinto
      // es donde las guardan.
      const nuevos = generationPeople.flatMap((person) =>
        porGenerar(person, generateUntil).map((paso) => ({
          person_id: person.id,
          date: paso.date,
          direction: paso.direction,
          origin:
            paso.direction === "SUBIDA" ? person.origin : person.destination,
          destination:
            paso.direction === "SUBIDA" ? person.destination : person.origin,
          requested_time: null,
          baggage: person.baggage,
          status: "Planificado",
          pnr: "",
          flight: "",
          amount: null,
          notes: "",
        })),
      );

      let count = nuevos.length;
      if (demo) {
        const generated = nuevos.map((fila) => ({
          id: crypto.randomUUID(),
          ...fila,
        }));
        setTrips((current) =>
          [...current, ...generated].sort((a, b) =>
            a.date.localeCompare(b.date),
          ),
        );
      } else if (nuevos.length) {
        count = 0;
        for (let index = 0; index < nuevos.length; index += 200) {
          // ignoreDuplicates deja pasar lo que otra persona haya creado entre
          // medio: nunca se pisa un viaje que ya existe.
          const { data, error } = await db()
            .from("trips")
            .upsert(nuevos.slice(index, index + 200), {
              onConflict: "person_id,date,direction",
              ignoreDuplicates: true,
            })
            .select("id");
          if (error) throw error;
          count += data?.length ?? 0;
        }
        await reload();
      }

      const peopleCount = generationPeople.length;
      closeModal();
      setNotice(
        `${count} viajes nuevos para ${peopleCount} ${peopleCount === 1 ? "persona" : "personas"}. Los registros existentes se conservaron.`,
      );
    }, "form");
  }

  return {
    openGenerate,
    generateTrips,
  };
}

export type AccionesGenerar = ReturnType<typeof useAccionesGenerar>;
